import { decryptToken, getInstallationAccessToken } from '../_shared/github-crypto.ts'
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
      .select('id, project_id, full_name, default_branch, connection_source_id, history_backfilled_at, github_connection_sources(*)')
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

    const initialBackfill = !repo.history_backfilled_at
    const openPRs = await fetchAllPRs(repo.full_name, token, 'open', undefined, rateLimitedGitHubFetch)
    const closedPRs = await fetchAllPRs(repo.full_name, token, 'closed', initialBackfill ? 365 : 30, rateLimitedGitHubFetch)
    const allPRs = [...openPRs, ...closedPRs]

    let synced = 0
    let linked = 0

    for (const pr of allPRs) {
      const details = await fetchPullRequestDetails(repo.full_name, Number(pr.number), token, rateLimitedGitHubFetch)
      const normalized = details ?? pr
      const reviews = await fetchPullRequestReviews(repo.full_name, Number(pr.number), token, rateLimitedGitHubFetch)
      const normalizedHead = normalized.head as Record<string, unknown> | null
      const checksStatus = await fetchChecksStatus(repo.full_name, normalizedHead?.sha as string | undefined, token, rateLimitedGitHubFetch)
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
      }
    }

    await supabase
      .from('github_repositories')
      .update({
        history_backfilled_at: initialBackfill ? new Date().toISOString() : repo.history_backfilled_at,
        last_synced_at: new Date().toISOString(),
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

  return {
    additions: Number(pr.additions ?? 0),
    author_avatar_url: user?.avatar_url as string ?? null,
    author_login: user?.login as string ?? null,
    base_ref: base?.ref as string ?? null,
    body: pr.body as string | null,
    checks_status: checksStatus,
    closed_at: pr.closed_at as string | null,
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
  supabase: ReturnType<typeof createClient>,
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

