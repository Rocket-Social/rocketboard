import { decryptToken, getInstallationAccessToken } from '../_shared/github-crypto.ts'
import {
  buildBackfillEventsForPullRequest,
  buildBackfillEventsForStoredPullRequest,
  type GitHubSyncActivityEvent,
} from './activity-events.ts'
import {
  createServiceClient,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'

export const GithubSyncBodySchema = z.object({
  repo_id: z.string().uuid(),
})

const MAX_CALLS_PER_INVOCATION = 500
const RATE_LIMIT_LOW_WATERMARK = 10

function createRateLimiter() {
  let apiCallCount = 0

  return async function rateLimitedGitHubFetch(url: string, init?: RequestInit): Promise<Response> {
    if (++apiCallCount > MAX_CALLS_PER_INVOCATION) {
      throw new Error(`GitHub API call limit reached (${MAX_CALLS_PER_INVOCATION})`)
    }

    const res = await fetch(url, init)

    const remaining = parseInt(res.headers.get('X-RateLimit-Remaining') ?? '999', 10)
    const resetAt = parseInt(res.headers.get('X-RateLimit-Reset') ?? '0', 10)

    if (remaining < RATE_LIMIT_LOW_WATERMARK && resetAt > 0) {
      const waitMs = Math.max(0, (resetAt * 1000) - Date.now()) + 1000
      console.warn(`[github-sync] Rate limit low (${remaining} remaining), waiting ${waitMs}ms`)
      await new Promise(r => setTimeout(r, Math.min(waitMs, 60_000)))
    }

    return res
  }
}

Deno.serve(withMonitoring('github-sync', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabase = createServiceClient()

  const rateLimitedGitHubFetch = createRateLimiter()

  try {
    const { repo_id: repoId } = await parseJsonBody(req, GithubSyncBodySchema)

    const { data: repo, error: repoError } = await supabase
      .from('github_repositories')
      .select('id, project_id, full_name, default_branch, connection_source_id, history_backfilled_at, pr_stats_backfill_requested_at, github_connection_sources(*)')
      .eq('id', repoId)
      .single()

    if (repoError || !repo) {
      return jsonResponse({ error: 'Repository not found' }, 404)
    }

    const { data: canAccessProject } = await supabase.rpc('can_access_project', {
      target_project_id: repo.project_id,
      target_user_id: user.id,
    })

    if (!canAccessProject) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const source = repo.github_connection_sources as Record<string, unknown> | null
    const token = source ? await resolveGitHubToken(source) : null
    if (!token) {
      return jsonResponse({ error: 'Failed to get GitHub access token' }, 500)
    }

    const autoTransitionsEnabled = await getAutoTransitionsEnabled(supabase, repo.project_id)
    const hadActivityEvents = await hasActivityEvents(supabase, repo.id)

    const initialBackfill = !repo.history_backfilled_at
    const statsBackfillRequested = Boolean(repo.pr_stats_backfill_requested_at)
    const closedDaysBack = initialBackfill ? 365 : statsBackfillRequested ? 90 : 30
    const openPRs = await fetchAllPRs(repo.full_name, token, 'open', undefined, rateLimitedGitHubFetch)
    const closedPRs = await fetchAllPRs(repo.full_name, token, 'closed', closedDaysBack, rateLimitedGitHubFetch)
    const allPRs = [...openPRs, ...closedPRs]

    let synced = 0
    let eventsSynced = 0
    let linked = 0

    for (const pr of allPRs) {
      const details = await fetchPullRequestDetails(repo.full_name, Number(pr.number), token, rateLimitedGitHubFetch)
      const normalized = details ?? pr
      const reviews = await fetchPullRequestReviews(repo.full_name, Number(pr.number), token, rateLimitedGitHubFetch)
      const normalizedHead = normalized.head as Record<string, unknown> | null
      const shouldRefreshChecks = !statsBackfillRequested || normalized.state === 'open'
      const checksStatus = shouldRefreshChecks
        ? await fetchChecksStatus(repo.full_name, normalizedHead?.sha as string | undefined, token, rateLimitedGitHubFetch)
        : null
      const prData = mapGitHubPR(normalized, repo.id, reviews, checksStatus)

      const { data: upsertedPR } = await supabase
        .from('github_pull_requests')
        .upsert(prData, { onConflict: 'repo_id,github_pr_id' })
        .select('id')
        .single()

      synced++

      if (upsertedPR) {
        const { data: linkedCards } = await supabase.rpc('auto_link_pr_to_cards', {
          target_body: normalized.body ?? null,
          target_head_ref: normalizedHead?.ref as string ?? null,
          target_pr_id: upsertedPR.id,
          target_project_id: repo.project_id,
        })

        if (linkedCards && (Array.isArray(linkedCards) ? linkedCards.length > 0 : linkedCards)) {
          linked++
        }

        if (autoTransitionsEnabled) {
          const currentAction = normalized.merged_at != null || normalized.merged === true
            ? 'closed'
            : normalized.state === 'open'
              ? 'opened'
              : 'closed'
          await autoTransitionCards(supabase, upsertedPR.id, currentAction, normalized, repo.project_id)
        }

        const activityEvents = buildBackfillEventsForPullRequest({
          pr: normalized,
          pullRequestId: upsertedPR.id,
          repoId: repo.id,
          repoName: repoNameFromFullName(repo.full_name),
          reviews,
        })

        eventsSynced += await upsertBackfillEvents(supabase, activityEvents)
      }
    }

    if (!hadActivityEvents) {
      eventsSynced += await backfillStoredPullRequestLifecycleEvents(
        supabase,
        repo.id,
        repoNameFromFullName(repo.full_name),
      )
    }

    await supabase
      .from('github_repositories')
      .update({
        history_backfilled_at: initialBackfill ? new Date().toISOString() : repo.history_backfilled_at,
        last_synced_at: new Date().toISOString(),
        pr_stats_backfill_requested_at: null,
      })
      .eq('id', repoId)

    // Background commit history backfill (non-blocking)
    const defaultBranch = (repo as Record<string, unknown>).default_branch as string | undefined
    if (defaultBranch) {
      backfillCommitHistory(supabase, repo.id, repo.full_name, defaultBranch, token, initialBackfill ? 365 : 30, rateLimitedGitHubFetch)
        .catch((err) => console.error('[github-sync] Commit backfill error:', err))
    }

    return jsonResponse({
      closed_count: closedPRs.length,
      events_synced: eventsSynced,
      linked,
      ok: true,
      open_count: openPRs.length,
      synced,
    })
  } catch (error) {
    console.error('[github-sync] Error:', error)
    return errorResponseForException(error, 'Sync failed', 'github-sync')
  }
}))

type GitHubFetch = (url: string, init?: RequestInit) => Promise<Response>

async function fetchAllPRs(
  repoFullName: string,
  token: string,
  state: 'open' | 'closed',
  daysBack: number | undefined,
  ghFetch: GitHubFetch,
): Promise<Record<string, unknown>[]> {
  const allPRs: Record<string, unknown>[] = []
  let page = 1
  const perPage = 100
  const cutoff = daysBack
    ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    : null

  while (page <= 10) {
    const params = new URLSearchParams({
      direction: 'desc',
      page: String(page),
      per_page: String(perPage),
      sort: 'updated',
      state,
    })

    const response = await ghFetch(`https://api.github.com/repos/${repoFullName}/pulls?${params}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      const status = response.status
      if (status === 403 || status === 429) {
        console.error(`[github-sync] Rate limited for ${repoFullName}`)
        break
      }

      throw new Error(`GitHub API error: ${status}`)
    }

    const prs = await response.json() as Record<string, unknown>[]
    if (prs.length === 0) break

    if (cutoff && state === 'closed') {
      const filtered = prs.filter((pr) => new Date(pr.updated_at as string) >= cutoff)
      allPRs.push(...filtered)
      if (filtered.length < prs.length) break
    } else {
      allPRs.push(...prs)
    }

    if (prs.length < perPage) break
    page++
  }

  return allPRs
}

async function fetchPullRequestDetails(repoFullName: string, prNumber: number, token: string, ghFetch: GitHubFetch) {
  const response = await ghFetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    return null
  }

  return await response.json() as Record<string, unknown>
}

async function fetchPullRequestReviews(repoFullName: string, prNumber: number, token: string, ghFetch: GitHubFetch) {
  const response = await ghFetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/reviews?per_page=100`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    return []
  }

  return await response.json() as Record<string, unknown>[]
}

async function fetchChecksStatus(repoFullName: string, sha: string | undefined, token: string, ghFetch: GitHubFetch) {
  if (!sha) return null

  const response = await ghFetch(`https://api.github.com/repos/${repoFullName}/commits/${sha}/status`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    return null
  }

  const data = await response.json() as { state?: string }
  switch (data.state) {
    case 'success':
      return 'success'
    case 'failure':
    case 'error':
      return 'failure'
    case 'pending':
      return 'pending'
    default:
      return null
  }
}

function mapGitHubPR(
  pr: Record<string, unknown>,
  repoId: string,
  reviews: Record<string, unknown>[],
  checksStatus: 'success' | 'failure' | 'pending' | null,
) {
  const head = pr.head as Record<string, unknown> | null
  const base = pr.base as Record<string, unknown> | null
  const user = pr.user as Record<string, unknown> | null
  const merged = pr.merged_at !== null && pr.merged_at !== undefined
  const requestedReviewers = Array.isArray(pr.requested_reviewers)
    ? pr.requested_reviewers as Record<string, unknown>[]
    : []
  const {
    approvalCount,
    changesRequestedCount,
    firstReviewSubmittedAt,
    lastReviewSubmittedAt,
    reviewCount,
    reviewState,
    reviewers,
  } = summarizeReviews(reviews, requestedReviewers)
  const state = merged ? 'merged' : (pr.state as string)
  const commentCount =
    Number(pr.comments ?? 0) +
    Number(pr.review_comments ?? 0) +
    reviewCount

  return {
    additions: Number(pr.additions ?? 0),
    author_avatar_url: user?.avatar_url as string ?? null,
    author_login: user?.login as string ?? null,
    base_ref: base?.ref as string ?? null,
    body: pr.body as string | null,
    checks_status: checksStatus,
    changed_files: Number(pr.changed_files ?? 0),
    closed_at: pr.closed_at as string | null,
    comment_count: commentCount,
    created_at: pr.created_at as string,
    deletions: Number(pr.deletions ?? 0),
    draft: (pr.draft as boolean) ?? false,
    first_review_submitted_at: firstReviewSubmittedAt,
    github_pr_id: pr.id as number,
    head_ref: head?.ref as string ?? null,
    html_url: pr.html_url as string,
    approval_count: approvalCount,
    changes_requested_count: changesRequestedCount,
    last_review_submitted_at: lastReviewSubmittedAt,
    merged_at: pr.merged_at as string | null,
    number: pr.number as number,
    repo_id: repoId,
    review_count: reviewCount,
    review_state: reviewState,
    reviewers,
    state,
    synced_at: new Date().toISOString(),
    title: pr.title as string,
    updated_at: pr.updated_at as string,
  }
}

function summarizeReviews(
  reviews: Record<string, unknown>[],
  requestedReviewers: Record<string, unknown>[],
) {
  const latestByUser = new Map<string, { avatarUrl: string | null; state: 'approved' | 'changes_requested' | 'dismissed' | 'pending' }>()

  for (const requestedReviewer of requestedReviewers) {
    const login = requestedReviewer.login as string | undefined
    if (!login) continue
    latestByUser.set(login, {
      avatarUrl: requestedReviewer.avatar_url as string ?? null,
      state: 'pending',
    })
  }

  const sortedReviews = [...reviews].sort((left, right) =>
    new Date(left.submitted_at as string ?? 0).getTime() - new Date(right.submitted_at as string ?? 0).getTime(),
  )

  const submittedReviews = sortedReviews.filter((review) => {
    const submittedAt = review.submitted_at as string | undefined
    return Boolean(submittedAt)
  })

  for (const review of sortedReviews) {
    const reviewUser = review.user as Record<string, unknown> | null
    const login = reviewUser?.login as string | undefined
    const rawState = String(review.state ?? '').toLowerCase()

    if (!login) continue

    const normalizedState = rawState === 'approved'
      ? 'approved'
      : rawState === 'changes_requested'
        ? 'changes_requested'
        : rawState === 'dismissed'
          ? 'dismissed'
          : null

    if (!normalizedState) continue

    latestByUser.set(login, {
      avatarUrl: reviewUser?.avatar_url as string ?? null,
      state: normalizedState,
    })
  }

  const reviewers = [...latestByUser.entries()].map(([login, value]) => ({
    avatarUrl: value.avatarUrl,
    login,
    state: value.state,
  }))

  let reviewState: 'approved' | 'changes_requested' | 'review_requested' | null = null
  if (reviewers.some((reviewer) => reviewer.state === 'changes_requested')) {
    reviewState = 'changes_requested'
  } else if (requestedReviewers.length > 0) {
    reviewState = 'review_requested'
  } else if (reviewers.some((reviewer) => reviewer.state === 'approved')) {
    reviewState = 'approved'
  }

  return {
    approvalCount: submittedReviews.filter((review) => String(review.state ?? '').toLowerCase() === 'approved').length,
    changesRequestedCount: submittedReviews.filter((review) => String(review.state ?? '').toLowerCase() === 'changes_requested').length,
    firstReviewSubmittedAt: submittedReviews[0]?.submitted_at as string | null ?? null,
    lastReviewSubmittedAt: submittedReviews[submittedReviews.length - 1]?.submitted_at as string | null ?? null,
    reviewCount: submittedReviews.length,
    reviewState,
    reviewers,
  }
}

async function getAutoTransitionsEnabled(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
) {
  const { data } = await supabase
    .from('project_github_settings')
    .select('auto_transitions_enabled')
    .eq('project_id', projectId)
    .maybeSingle()

  return data?.auto_transitions_enabled ?? true
}

async function hasActivityEvents(
  supabase: ReturnType<typeof createServiceClient>,
  repoId: string,
) {
  const { count, error } = await supabase
    .from('github_events')
    .select('id', { count: 'exact', head: true })
    .eq('repo_id', repoId)

  if (error) {
    console.error('[github-sync] Activity event count error:', error)
    return true
  }

  return Number(count ?? 0) > 0
}

async function backfillStoredPullRequestLifecycleEvents(
  supabase: ReturnType<typeof createServiceClient>,
  repoId: string,
  repoName: string,
) {
  const { data: pullRequests, error } = await supabase
    .from('github_pull_requests')
    .select('id, author_avatar_url, author_login, closed_at, created_at, merged_at, number, title')
    .eq('repo_id', repoId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[github-sync] Stored PR activity backfill query error:', error)
    return 0
  }

  const events = (pullRequests ?? []).flatMap((pr) =>
    buildBackfillEventsForStoredPullRequest({
      pr,
      repoId,
      repoName,
    }),
  )

  return upsertBackfillEvents(supabase, events)
}

async function upsertBackfillEvents(
  supabase: ReturnType<typeof createServiceClient>,
  events: GitHubSyncActivityEvent[],
) {
  let synced = 0

  for (const event of events) {
    const existing = await findExistingBackfillEvent(supabase, event)
    const payload = {
      actor_avatar_url: event.actor_avatar_url,
      actor_login: event.actor_login,
      github_created_at: event.github_created_at,
      payload: event.payload,
      pull_request_id: event.pull_request_id,
      repo_id: event.repo_id,
    }

    const { error } = existing?.id
      ? await supabase
        .from('github_events')
        .update(payload)
        .eq('id', existing.id)
      : await supabase
        .from('github_events')
        .insert({
          ...payload,
          event_type: event.event_type,
        })

    if (error) {
      console.error('[github-sync] Activity event upsert error:', error)
      continue
    }

    synced++
  }

  return synced
}

async function findExistingBackfillEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: GitHubSyncActivityEvent,
) {
  let query = supabase
    .from('github_events')
    .select('id')
    .eq('repo_id', event.repo_id)
    .eq('event_type', event.event_type)
    .eq('pull_request_id', event.pull_request_id)

  if (event.event_type === 'review_submitted') {
    query = query.eq('github_created_at', event.github_created_at)
    query = event.actor_login
      ? query.eq('actor_login', event.actor_login)
      : query.is('actor_login', null)
  }

  const { data, error } = await query.limit(1).maybeSingle()

  if (error) {
    console.error('[github-sync] Activity event lookup error:', error)
    return null
  }

  return data
}

async function autoTransitionCards(
  supabase: ReturnType<typeof createServiceClient>,
  prId: string,
  action: 'opened' | 'closed',
  pr: Record<string, unknown>,
  projectId: string,
) {
  const { data: links } = await supabase
    .from('card_github_links')
    .select('card_id')
    .eq('pull_request_id', prId)

  if (!links || links.length === 0) return

  const { data: statusOptions } = await supabase
    .from('project_status_options')
    .select('id, label, key, category, position')
    .eq('project_id', projectId)
    .order('position')

  if (!statusOptions || statusOptions.length === 0) return

  let targetStatus: Record<string, unknown> | null = null
  const isDraft = pr.draft === true
  const merged = pr.merged === true || pr.merged_at != null

  if (action === 'opened') {
    if (!isDraft) {
      targetStatus = findReviewStatus(statusOptions) ?? findFirstStatusInCategory(statusOptions, 'started')
    }
  } else if (action === 'closed') {
    targetStatus = merged
      ? findFirstStatusInCategory(statusOptions, 'completed')
      : findFirstStatusInCategory(statusOptions, 'started')
  }

  if (!targetStatus) return

  for (const link of links) {
    const { data: card } = await supabase
      .from('cards')
      .select('id, status_option_id')
      .eq('id', link.card_id)
      .single()

    if (!card) continue

    const currentStatus = statusOptions.find((option: Record<string, unknown>) => option.id === card.status_option_id)
    if (categoryRank(String(currentStatus?.category ?? '')) >= categoryRank(String(targetStatus.category ?? ''))) {
      continue
    }

    await supabase
      .from('cards')
      .update({ status_option_id: targetStatus.id })
      .eq('id', card.id)
  }
}

function findReviewStatus(statusOptions: Record<string, unknown>[]) {
  return statusOptions.find((option) => {
    const key = String(option.key ?? '').toLowerCase()
    const label = String(option.label ?? '').toLowerCase()
    return String(option.category ?? '') === 'started' && (key.includes('review') || label.includes('review'))
  }) ?? null
}

function findFirstStatusInCategory(statusOptions: Record<string, unknown>[], category: string) {
  return statusOptions.find((option) => String(option.category ?? '') === category) ?? null
}

function categoryRank(category: string | null | undefined): number {
  switch (category) {
    case 'not_started': return 0
    case 'started': return 1
    case 'completed': return 2
    default: return -1
  }
}

function repoNameFromFullName(fullName: string): string {
  return fullName.split('/').pop() ?? fullName
}

async function resolveGitHubToken(source: Record<string, unknown>): Promise<string | null> {
  const permissions = source.permissions as Record<string, unknown> | null

  if (permissions?.oauth_token_encrypted) {
    return decryptToken(String(permissions.oauth_token_encrypted))
  }

  const installationId = Number(source.installation_id ?? 0)
  if (installationId > 0) {
    return getInstallationAccessToken(installationId)
  }

  console.error('[github-sync] No valid auth method found on source')
  return null
}

async function backfillCommitHistory(
  supabase: ReturnType<typeof createServiceClient>,
  repoId: string,
  repoFullName: string,
  defaultBranch: string,
  token: string,
  daysBack: number,
  ghFetch: GitHubFetch,
) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  const commitsByDate = new Map<string, number>()
  let page = 1

  while (page <= 20) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: '100',
      sha: defaultBranch,
      since,
    })

    const response = await ghFetch(`https://api.github.com/repos/${repoFullName}/commits?${params}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        console.warn(`[github-sync] Rate limited during commit backfill for ${repoFullName}`)
        break
      }
      break
    }

    const commits = await response.json() as { commit?: { committer?: { date?: string } } }[]
    if (commits.length === 0) break

    for (const commit of commits) {
      const dateStr = commit.commit?.committer?.date
      if (!dateStr) continue
      const activityDate = dateStr.split('T')[0]!
      commitsByDate.set(activityDate, (commitsByDate.get(activityDate) ?? 0) + 1)
    }

    if (commits.length < 100) break
    page++
  }

  if (commitsByDate.size === 0) return

  const rows = Array.from(commitsByDate.entries()).map(([activityDate, commitCount]) => ({
    repo_id: repoId,
    activity_date: activityDate,
    commit_count: commitCount,
    computed_timezone: 'UTC',
  }))

  // Upsert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await supabase
      .from('github_commit_daily_rollups')
      .upsert(batch, { onConflict: 'repo_id,activity_date' })

    if (error) {
      console.error('[github-sync] Commit rollup upsert error:', error)
    }
  }

  console.log(`[github-sync] Backfilled ${commitsByDate.size} days of commit history for ${repoFullName}`)
}
