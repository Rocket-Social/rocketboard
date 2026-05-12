import { decryptToken, getInstallationAccessToken } from '../_shared/github-crypto.ts'
import { verifyGithubWebhookSignature } from '../_shared/github-webhook-signature.ts'
import {captureEdgeException, withMonitoring} from '../_shared/monitoring.ts'
import {
  createServiceClient,
  jsonResponse,
} from '../_shared/supabase.ts'

const GITHUB_WEBHOOK_SECRET = Deno.env.get('GITHUB_WEBHOOK_SECRET')!

Deno.serve(withMonitoring('github-webhook', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const body = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  if (!(await verifyGithubWebhookSignature({ body, secret: GITHUB_WEBHOOK_SECRET, signature }))) {
    return jsonResponse({ error: 'Invalid signature' }, 401)
  }

  const event = req.headers.get('x-github-event')
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  const supabase = createServiceClient()

  try {
    switch (event) {
      case 'installation':
        await handleInstallation(supabase, payload)
        break
      case 'pull_request':
        await handlePullRequest(supabase, payload)
        break
      case 'pull_request_review':
        await handlePullRequestReview(supabase, payload)
        break
      case 'issue_comment':
      case 'pull_request_review_comment':
        await handlePullRequestComment(supabase, payload)
        break
      case 'push':
        await handlePush(supabase, payload)
        break
      default:
        break
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    console.error(`[github-webhook] Error handling ${event}:`, error)
    void captureEdgeException(error, {functionName: 'github-webhook'})
    return jsonResponse({ error: 'Internal error' }, 500)
  }
}))

async function handleInstallation(supabase: ReturnType<typeof createServiceClient>, payload: Record<string, unknown>) {
  const action = payload.action as string
  const installation = payload.installation as Record<string, unknown>
  const installationId = Number(installation.id ?? 0)

  if (action === 'deleted' && installationId > 0) {
    const { error } = await supabase
      .from('github_connection_sources')
      .delete()
      .eq('installation_id', installationId)

    if (error) console.error('[github-webhook] Failed to delete source:', error)
  }
}

async function handlePullRequest(supabase: ReturnType<typeof createServiceClient>, payload: Record<string, unknown>) {
  const action = payload.action as string
  const pr = payload.pull_request as Record<string, unknown>
  const repo = payload.repository as Record<string, unknown>
  const githubRepoId = Number(repo.id ?? 0)
  const repoFullName = String(repo.full_name ?? '')
  const installation = payload.installation as Record<string, unknown> | undefined
  const repoRecords = await getRepoRecords(supabase, githubRepoId)

  if (repoRecords.length === 0) return

  const token = await resolveWebhookToken(repoRecords, installation)
  const detailedPR = token ? await fetchPullRequestDetails(repoFullName, Number(pr.number), token) : null
  const normalizedPr = detailedPR ?? pr
  const reviews = token ? await fetchPullRequestReviews(repoFullName, Number(pr.number), token) : []
  const normalizedHead = normalizedPr.head as Record<string, unknown> | null
  const checksStatus = token ? await fetchChecksStatus(repoFullName, normalizedHead?.sha as string | undefined, token) : null
  const autoTransitionCache = new Map<string, boolean>()

  for (const repoRecord of repoRecords) {
    const prData = mapGitHubPR(normalizedPr, repoRecord.id, reviews, checksStatus)

    const { data: upsertedPR, error: prError } = await supabase
      .from('github_pull_requests')
      .upsert(prData, { onConflict: 'repo_id,github_pr_id' })
      .select('id')
      .single()

    if (prError || !upsertedPR) {
      console.error('[github-webhook] Failed to upsert PR:', prError)
      continue
    }

    const eventType = mapPRActionToEventType(
      action,
      Boolean(normalizedPr.draft),
      Boolean(normalizedPr.merged) || normalizedPr.merged_at != null,
    )
    if (eventType) {
      await insertEvent(supabase, {
        actor_avatar_url: (payload.sender as Record<string, unknown>)?.avatar_url as string ?? null,
        actor_login: (payload.sender as Record<string, unknown>)?.login as string ?? null,
        event_type: eventType,
        github_created_at: normalizedPr.updated_at as string ?? new Date().toISOString(),
        payload: {
          pr_number: normalizedPr.number,
          pr_title: normalizedPr.title,
          repo_name: repo.name,
        },
        pull_request_id: upsertedPR.id,
        repo_id: repoRecord.id,
      })
    }

    if (['opened', 'edited', 'reopened', 'ready_for_review'].includes(action)) {
      await supabase.rpc('auto_link_pr_to_cards', {
        target_body: normalizedPr.body ?? null,
        target_head_ref: normalizedHead?.ref as string ?? null,
        target_pr_id: upsertedPR.id,
        target_project_id: repoRecord.project_id,
      })
    }

    const autoTransitionsEnabled = await isAutoTransitionsEnabled(supabase, repoRecord.project_id, autoTransitionCache)
    if (autoTransitionsEnabled && ['opened', 'reopened', 'closed', 'ready_for_review'].includes(action)) {
      await autoTransitionCards(supabase, upsertedPR.id, action, normalizedPr, repoRecord.project_id)
    }
  }
}

async function handlePullRequestReview(supabase: ReturnType<typeof createServiceClient>, payload: Record<string, unknown>) {
  const review = payload.review as Record<string, unknown>
  const pr = payload.pull_request as Record<string, unknown>
  const repo = payload.repository as Record<string, unknown>
  const repoRecords = await getRepoRecords(supabase, Number(repo.id ?? 0))

  if (repoRecords.length === 0) return

  const installation = payload.installation as Record<string, unknown> | undefined
  const token = await resolveWebhookToken(repoRecords, installation)
  const repoFullName = String(repo.full_name ?? '')
  const detailedPR = token ? await fetchPullRequestDetails(repoFullName, Number(pr.number), token) : null
  const normalizedPR = detailedPR ?? pr
  const reviews = token ? await fetchPullRequestReviews(repoFullName, Number(normalizedPR.number), token) : [review]
  const requestedReviewers = Array.isArray(normalizedPR.requested_reviewers) ? normalizedPR.requested_reviewers as Record<string, unknown>[] : []
  const {
    approvalCount,
    changesRequestedCount,
    firstReviewSubmittedAt,
    lastReviewSubmittedAt,
    reviewCount,
    reviewState,
    reviewers,
  } = summarizeReviews(reviews, requestedReviewers)
  const commentCount = getPullRequestCommentCount(normalizedPR, reviewCount)

  for (const repoRecord of repoRecords) {
    await supabase
      .from('github_pull_requests')
      .update({
        approval_count: approvalCount,
        changes_requested_count: changesRequestedCount,
        first_review_submitted_at: firstReviewSubmittedAt,
        last_review_submitted_at: lastReviewSubmittedAt,
        comment_count: commentCount,
        review_count: reviewCount,
        review_state: reviewState,
        reviewers,
        synced_at: new Date().toISOString(),
      })
      .eq('repo_id', repoRecord.id)
      .eq('github_pr_id', Number(pr.id))

    const { data: prRecord } = await supabase
      .from('github_pull_requests')
      .select('id')
      .eq('repo_id', repoRecord.id)
      .eq('github_pr_id', Number(pr.id))
      .maybeSingle()

    await insertEvent(supabase, {
      actor_avatar_url: (review.user as Record<string, unknown>)?.avatar_url as string ?? null,
      actor_login: (review.user as Record<string, unknown>)?.login as string ?? null,
      event_type: 'review_submitted',
      github_created_at: review.submitted_at as string ?? new Date().toISOString(),
      payload: {
        pr_number: pr.number,
        pr_title: pr.title,
        repo_name: repo.name,
        review_state: review.state,
      },
      pull_request_id: prRecord?.id ?? null,
      repo_id: repoRecord.id,
    })
  }
}

async function handlePullRequestComment(supabase: ReturnType<typeof createServiceClient>, payload: Record<string, unknown>) {
  const repo = payload.repository as Record<string, unknown>
  const repoRecords = await getRepoRecords(supabase, Number(repo.id ?? 0))

  if (repoRecords.length === 0) return

  const issue = payload.issue as Record<string, unknown> | undefined
  const payloadPR = payload.pull_request as Record<string, unknown> | undefined
  const isPullRequestIssue = Boolean(issue?.pull_request) || Boolean(payloadPR)
  const prNumber = Number(payloadPR?.number ?? issue?.number ?? 0)

  if (!isPullRequestIssue || !Number.isFinite(prNumber) || prNumber <= 0) return

  const installation = payload.installation as Record<string, unknown> | undefined
  const token = await resolveWebhookToken(repoRecords, installation)
  if (!token) return

  const repoFullName = String(repo.full_name ?? '')
  const detailedPR = await fetchPullRequestDetails(repoFullName, prNumber, token)
  if (!detailedPR) return

  const reviews = await fetchPullRequestReviews(repoFullName, prNumber, token)
  const head = detailedPR.head as Record<string, unknown> | null
  const checksStatus = await fetchChecksStatus(repoFullName, head?.sha as string | undefined, token)

  for (const repoRecord of repoRecords) {
    const prData = mapGitHubPR(detailedPR, repoRecord.id, reviews, checksStatus)

    const { error } = await supabase
      .from('github_pull_requests')
      .upsert(prData, { onConflict: 'repo_id,github_pr_id' })

    if (error) {
      console.error('[github-webhook] Failed to refresh PR comment stats:', error)
    }
  }
}

async function handlePush(supabase: ReturnType<typeof createServiceClient>, payload: Record<string, unknown>) {
  const repo = payload.repository as Record<string, unknown>
  const repoRecords = await getRepoRecords(supabase, Number(repo.id ?? 0))
  if (repoRecords.length === 0) return

  const commits = payload.commits as Record<string, unknown>[] ?? []
  const ref = payload.ref as string ?? ''
  const branch = ref.replace('refs/heads/', '')
  const created = payload.created === true
  const autoTransitionCache = new Map<string, boolean>()

  for (const repoRecord of repoRecords) {
    await insertEvent(supabase, {
      actor_avatar_url: (payload.sender as Record<string, unknown>)?.avatar_url as string ?? null,
      actor_login: (payload.sender as Record<string, unknown>)?.login as string ?? null,
      event_type: 'push',
      github_created_at: new Date().toISOString(),
      payload: {
        branch,
        commit_count: commits.length,
        repo_name: repo.name,
      },
      pull_request_id: null,
      repo_id: repoRecord.id,
    })

    // Update commit daily rollup for default branch pushes (additive)
    if (branch === repoRecord.default_branch && commits.length > 0) {
      const today = new Date().toISOString().split('T')[0]!
      await supabase.rpc('upsert_commit_daily_rollup', {
        target_repo_id: repoRecord.id,
        target_activity_date: today,
        target_commit_count: commits.length,
      }).then(({ error }) => {
        if (error) console.error('[github-webhook] Commit rollup upsert error:', error)
      })
    }

    const autoTransitionsEnabled = await isAutoTransitionsEnabled(supabase, repoRecord.project_id, autoTransitionCache)
    if (autoTransitionsEnabled && created && branch && branch !== repoRecord.default_branch) {
      await autoTransitionBranchCards(supabase, repoRecord.project_id, branch)
    }
  }
}

async function getRepoRecords(
  supabase: ReturnType<typeof createServiceClient>,
  githubRepoId: number,
) {
  const { data } = await supabase
    .from('github_repositories')
    .select('id, project_id, default_branch, connection_source_id, github_connection_sources(*)')
    .eq('github_repo_id', githubRepoId)

  return (data ?? []) as Array<Record<string, unknown> & {
    id: string
    project_id: string
    default_branch: string
  }>
}

async function resolveWebhookToken(
  repoRecords: Array<Record<string, unknown>>,
  installation: Record<string, unknown> | undefined,
) {
  const installationId = Number(installation?.id ?? 0)
  if (installationId > 0) {
    const installationToken = await getInstallationAccessToken(installationId)
    if (installationToken) return installationToken
  }

  for (const repoRecord of repoRecords) {
    const source = repoRecord.github_connection_sources as Record<string, unknown> | null
    if (!source) continue
    const token = await resolveGitHubToken(source)
    if (token) return token
  }

  return null
}

async function isAutoTransitionsEnabled(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  cache: Map<string, boolean>,
) {
  if (cache.has(projectId)) {
    return cache.get(projectId) ?? true
  }

  const { data } = await supabase
    .from('project_github_settings')
    .select('auto_transitions_enabled')
    .eq('project_id', projectId)
    .maybeSingle()

  const enabled = data?.auto_transitions_enabled ?? true
  cache.set(projectId, enabled)
  return enabled
}

async function autoTransitionCards(
  supabase: ReturnType<typeof createServiceClient>,
  prId: string,
  action: string,
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

  if (action === 'opened' || action === 'reopened' || action === 'ready_for_review') {
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

async function autoTransitionBranchCards(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  branch: string,
) {
  const cardNumbers = await findCardNumbersForBranch(supabase, projectId, branch)
  if (cardNumbers.length === 0) return

  const { data: statusOptions } = await supabase
    .from('project_status_options')
    .select('id, label, key, category, position')
    .eq('project_id', projectId)
    .order('position')

  const targetStatus = findFirstNonReviewStartedStatus(statusOptions ?? []) ?? findFirstStatusInCategory(statusOptions ?? [], 'started')
  if (!targetStatus) return

  const { data: cards } = await supabase
    .from('cards')
    .select('id, project_card_number, status_option_id')
    .eq('project_id', projectId)
    .in('project_card_number', cardNumbers)

  for (const card of cards ?? []) {
    const currentStatus = (statusOptions ?? []).find((option: Record<string, unknown>) => option.id === card.status_option_id)
    if (categoryRank(String(currentStatus?.category ?? '')) >= categoryRank(String(targetStatus.category ?? ''))) {
      continue
    }

    await supabase
      .from('cards')
      .update({ status_option_id: targetStatus.id })
      .eq('id', card.id)
  }
}

async function findCardNumbersForBranch(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  branch: string,
) {
  const { data: project } = await supabase
    .from('projects')
    .select('project_key')
    .eq('id', projectId)
    .maybeSingle()

  const projectKey = project?.project_key as string | undefined
  if (!projectKey) return []

  const matcher = new RegExp(`${projectKey}-(\\d+)`, 'gi')
  const matches = [...branch.matchAll(matcher)]
  const numbers = matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value))
  return [...new Set(numbers)]
}

function findReviewStatus(statusOptions: Record<string, unknown>[]) {
  return statusOptions.find((option) => {
    const key = String(option.key ?? '').toLowerCase()
    const label = String(option.label ?? '').toLowerCase()
    return String(option.category ?? '') === 'started' && (key.includes('review') || label.includes('review'))
  }) ?? null
}

function findFirstNonReviewStartedStatus(statusOptions: Record<string, unknown>[]) {
  return statusOptions.find((option) => {
    const key = String(option.key ?? '').toLowerCase()
    const label = String(option.label ?? '').toLowerCase()
    return String(option.category ?? '') === 'started' && !key.includes('review') && !label.includes('review')
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

async function fetchPullRequestDetails(repoFullName: string, prNumber: number, token: string) {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) return null
  return await response.json() as Record<string, unknown>
}

async function fetchPullRequestReviews(repoFullName: string, prNumber: number, token: string) {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/reviews?per_page=100`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) return []
  return await response.json() as Record<string, unknown>[]
}

async function fetchChecksStatus(repoFullName: string, sha: string | undefined, token: string) {
  if (!sha) return null

  const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${sha}/status`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) return null

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
  const merged = pr.merged === true || pr.merged_at != null
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
  const commentCount = getPullRequestCommentCount(pr, reviewCount)

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

function getPullRequestCommentCount(
  pr: Record<string, unknown>,
  reviewCount: number,
) {
  return (
    Number(pr.comments ?? 0) +
    Number(pr.review_comments ?? 0) +
    reviewCount
  )
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

function mapPRActionToEventType(action: string, isDraft: boolean, merged: boolean): string | null {
  switch (action) {
    case 'opened': return isDraft ? 'pr_draft' : 'pr_opened'
    case 'closed': return merged ? 'pr_merged' : 'pr_closed'
    case 'reopened': return 'pr_opened'
    case 'edited': return 'pr_edited'
    case 'converted_to_draft': return 'pr_draft'
    case 'ready_for_review': return 'pr_ready'
    default: return null
  }
}

async function insertEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: {
    repo_id: string
    event_type: string
    actor_login: string | null
    actor_avatar_url: string | null
    pull_request_id: string | null
    payload: Record<string, unknown>
    github_created_at: string
  },
) {
  const { error } = await supabase
    .from('github_events')
    .insert(event)

  if (error) console.error('[github-webhook] Failed to insert event:', error)
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

  return null
}
