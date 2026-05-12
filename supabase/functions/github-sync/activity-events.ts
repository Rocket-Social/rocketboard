export type GitHubSyncActivityEvent = {
  actor_avatar_url: string | null
  actor_login: string | null
  event_type: 'pr_opened' | 'pr_merged' | 'pr_closed' | 'review_submitted'
  github_created_at: string
  payload: Record<string, unknown>
  pull_request_id: string
  repo_id: string
}

type Actor = {
  avatarUrl: string | null
  login: string | null
}

type BackfillEventInput = {
  pr: Record<string, unknown>
  pullRequestId: string
  repoId: string
  repoName: string
  reviews: Record<string, unknown>[]
}

type StoredPullRequestInput = {
  pr: Record<string, unknown>
  repoId: string
  repoName: string
}

export function buildBackfillEventsForPullRequest(input: BackfillEventInput): GitHubSyncActivityEvent[] {
  const events: GitHubSyncActivityEvent[] = []
  const author = actorFrom(input.pr.user)
  const prNumber = numberOrNull(input.pr.number)
  const prTitle = stringOrNull(input.pr.title) ?? ''
  const basePayload = {
    pr_number: prNumber,
    pr_title: prTitle,
    repo_name: input.repoName,
    source: 'github-sync',
  }

  const createdAt = stringOrNull(input.pr.created_at)
  if (createdAt) {
    events.push(createActivityEvent({
      actor: author,
      eventType: 'pr_opened',
      githubCreatedAt: createdAt,
      input,
      payload: basePayload,
    }))
  }

  const mergedAt = stringOrNull(input.pr.merged_at)
  const closedAt = stringOrNull(input.pr.closed_at)
  const isMerged = input.pr.merged === true || Boolean(mergedAt)

  if (isMerged && mergedAt) {
    events.push(createActivityEvent({
      actor: actorFrom(input.pr.merged_by) ?? author,
      eventType: 'pr_merged',
      githubCreatedAt: mergedAt,
      input,
      payload: basePayload,
    }))
  } else if (closedAt) {
    events.push(createActivityEvent({
      actor: author,
      eventType: 'pr_closed',
      githubCreatedAt: closedAt,
      input,
      payload: basePayload,
    }))
  }

  const sortedReviews = [...input.reviews].sort((left, right) =>
    new Date(stringOrNull(left.submitted_at) ?? 0).getTime()
    - new Date(stringOrNull(right.submitted_at) ?? 0).getTime(),
  )

  for (const review of sortedReviews) {
    const submittedAt = stringOrNull(review.submitted_at)
    if (!submittedAt) continue

    events.push(createActivityEvent({
      actor: actorFrom(review.user),
      eventType: 'review_submitted',
      githubCreatedAt: submittedAt,
      input,
      payload: {
        ...basePayload,
        review_state: stringOrNull(review.state) ?? 'reviewed',
      },
    }))
  }

  return events
}

export function buildBackfillEventsForStoredPullRequest(input: StoredPullRequestInput): GitHubSyncActivityEvent[] {
  const pullRequestId = stringOrNull(input.pr.id)
  if (!pullRequestId) return []

  const events: GitHubSyncActivityEvent[] = []
  const author = {
    avatarUrl: stringOrNull(input.pr.author_avatar_url),
    login: stringOrNull(input.pr.author_login),
  }
  const basePayload = {
    pr_number: numberOrNull(input.pr.number),
    pr_title: stringOrNull(input.pr.title) ?? '',
    repo_name: input.repoName,
    source: 'github-sync',
  }

  const createdAt = stringOrNull(input.pr.created_at)
  if (createdAt) {
    events.push(createActivityEvent({
      actor: author,
      eventType: 'pr_opened',
      githubCreatedAt: createdAt,
      input: {
        pr: input.pr,
        pullRequestId,
        repoId: input.repoId,
        repoName: input.repoName,
        reviews: [],
      },
      payload: basePayload,
    }))
  }

  const mergedAt = stringOrNull(input.pr.merged_at)
  const closedAt = stringOrNull(input.pr.closed_at)

  if (mergedAt) {
    events.push(createActivityEvent({
      actor: author,
      eventType: 'pr_merged',
      githubCreatedAt: mergedAt,
      input: {
        pr: input.pr,
        pullRequestId,
        repoId: input.repoId,
        repoName: input.repoName,
        reviews: [],
      },
      payload: basePayload,
    }))
  } else if (closedAt) {
    events.push(createActivityEvent({
      actor: author,
      eventType: 'pr_closed',
      githubCreatedAt: closedAt,
      input: {
        pr: input.pr,
        pullRequestId,
        repoId: input.repoId,
        repoName: input.repoName,
        reviews: [],
      },
      payload: basePayload,
    }))
  }

  return events
}

function createActivityEvent(args: {
  actor: Actor | null
  eventType: GitHubSyncActivityEvent['event_type']
  githubCreatedAt: string
  input: BackfillEventInput
  payload: Record<string, unknown>
}): GitHubSyncActivityEvent {
  return {
    actor_avatar_url: args.actor?.avatarUrl ?? null,
    actor_login: args.actor?.login ?? null,
    event_type: args.eventType,
    github_created_at: args.githubCreatedAt,
    payload: args.payload,
    pull_request_id: args.input.pullRequestId,
    repo_id: args.input.repoId,
  }
}

function actorFrom(value: unknown): Actor | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const login = stringOrNull(record.login)
  const avatarUrl = stringOrNull(record.avatar_url)
  if (!login && !avatarUrl) return null

  return {
    avatarUrl,
    login,
  }
}

function numberOrNull(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
