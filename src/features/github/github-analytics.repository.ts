import { getSupabaseBrowserClient } from '../../platform/supabase/client'
import { rpcAdapter } from '../../platform/data/rpc-adapter'
import type {
  GitHubAnalyticsPullRequest,
  GitHubAnalyticsSettings,
  GitHubBoardSummary,
  GitHubCommitDailyRollup,
  GitHubEvent,
  GitHubIdentityCandidate,
  GitHubReviewEvent,
} from './github.types'

type AnalyticsPullRequestRow = {
  id: string
  repo_id: string
  github_pr_id: number
  number: number
  title: string
  state: string
  draft: boolean
  author_login: string | null
  html_url: string
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
  review_state: string | null
  first_review_submitted_at: string | null
  last_review_submitted_at: string | null
  review_count: number
  approval_count: number
  changes_requested_count: number
}

type EventRow = {
  id: string
  repo_id: string
  github_repositories?: { full_name?: string | null } | { full_name?: string | null }[] | null
  github_pull_requests?:
    | { html_url?: string | null; number?: number | null; title?: string | null }
    | { html_url?: string | null; number?: number | null; title?: string | null }[]
    | null
  event_type: string
  actor_login: string | null
  actor_avatar_url: string | null
  pull_request_id: string | null
  payload: Record<string, unknown>
  github_created_at: string
  created_at: string
}

type ReviewEventRow = {
  id: string
  repo_id: string
  actor_login: string | null
  actor_avatar_url: string | null
  pull_request_id: string | null
  payload: Record<string, unknown>
  github_created_at: string
}

type SummaryRow = {
  open_count: number
  needs_review_count: number
  stale_count: number
  merged_this_week: number
  avg_review_hours: number
}

type CommitDailyRollupRow = {
  id: string
  repo_id: string
  activity_date: string
  commit_count: number
  computed_timezone: string
  created_at: string
  updated_at: string
}

type IdentityCandidateRow = {
  github_login: string
  last_seen_at: string | null
  pr_count: number
  review_count: number
}

function supabase() {
  return getSupabaseBrowserClient()
}

function mapAnalyticsPullRequest(
  row: AnalyticsPullRequestRow,
): GitHubAnalyticsPullRequest {
  return {
    id: row.id,
    repoId: row.repo_id,
    githubPrId: row.github_pr_id,
    number: row.number,
    title: row.title,
    state: row.state as GitHubAnalyticsPullRequest['state'],
    draft: row.draft,
    authorLogin: row.author_login,
    htmlUrl: row.html_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mergedAt: row.merged_at,
    closedAt: row.closed_at,
    reviewState: row.review_state as GitHubAnalyticsPullRequest['reviewState'],
    firstReviewSubmittedAt: row.first_review_submitted_at,
    lastReviewSubmittedAt: row.last_review_submitted_at,
    reviewCount: Number(row.review_count ?? 0),
    approvalCount: Number(row.approval_count ?? 0),
    changesRequestedCount: Number(row.changes_requested_count ?? 0),
  }
}

function mapEvent(row: EventRow): GitHubEvent {
  const repository = singleRelation(row.github_repositories)
  const pullRequest = singleRelation(row.github_pull_requests)

  return {
    id: row.id,
    repoId: row.repo_id,
    repoFullName: repository?.full_name ?? null,
    eventType: row.event_type as GitHubEvent['eventType'],
    actorLogin: row.actor_login,
    actorAvatarUrl: row.actor_avatar_url,
    pullRequestId: row.pull_request_id,
    pullRequestHtmlUrl: pullRequest?.html_url ?? null,
    pullRequestNumber: pullRequest?.number ?? null,
    pullRequestTitle: pullRequest?.title ?? null,
    payload: row.payload,
    githubCreatedAt: row.github_created_at,
    createdAt: row.created_at,
  }
}

function mapReviewEvent(row: ReviewEventRow): GitHubReviewEvent {
  return {
    id: row.id,
    repoId: row.repo_id,
    actorLogin: row.actor_login,
    actorAvatarUrl: row.actor_avatar_url,
    pullRequestId: row.pull_request_id,
    payload: row.payload,
    githubCreatedAt: row.github_created_at,
  }
}

function mapSummary(row: SummaryRow): GitHubBoardSummary {
  return {
    openCount: Number(row.open_count),
    needsReviewCount: Number(row.needs_review_count),
    staleCount: Number(row.stale_count),
    mergedThisWeek: Number(row.merged_this_week),
    avgReviewHours: Number(row.avg_review_hours),
  }
}

function mapCommitDailyRollup(
  row: CommitDailyRollupRow,
): GitHubCommitDailyRollup {
  return {
    id: row.id,
    repoId: row.repo_id,
    activityDate: row.activity_date,
    commitCount: row.commit_count,
    computedTimezone: row.computed_timezone,
  }
}

function mapIdentityCandidate(
  row: IdentityCandidateRow,
): GitHubIdentityCandidate {
  return {
    githubLogin: row.github_login,
    lastSeenAt: row.last_seen_at,
    prCount: Number(row.pr_count ?? 0),
    reviewCount: Number(row.review_count ?? 0),
  }
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export const githubAnalyticsRepository = {
  async getProjectGitHubAnalyticsPullRequests(
    projectId: string,
    from: string | null,
    to: string | null,
  ): Promise<GitHubAnalyticsPullRequest[]> {
    const rows = await rpcAdapter.call<AnalyticsPullRequestRow[]>(
      'get_project_github_analytics_pull_requests',
      {
        target_from: from,
        target_project_id: projectId,
        target_to: to,
      },
    )

    return (rows ?? []).map((row) => mapAnalyticsPullRequest(row))
  },

  async getProjectGitHubSummary(
    projectId: string,
  ): Promise<GitHubBoardSummary> {
    const empty: GitHubBoardSummary = {
      openCount: 0,
      needsReviewCount: 0,
      staleCount: 0,
      mergedThisWeek: 0,
      avgReviewHours: 0,
    }

    try {
      const rows = await rpcAdapter.call<SummaryRow[]>(
        'get_project_github_summary',
        {
          target_project_id: projectId,
        },
      )
      const row = Array.isArray(rows) ? rows[0] : rows
      return row ? mapSummary(row) : empty
    } catch {
      return empty
    }
  },

  async getEventsForProject(
    projectId: string,
    limit = 50,
    offset = 0,
  ): Promise<GitHubEvent[]> {
    const { data, error } = await supabase()
      .from('github_events')
      .select('*, github_repositories!inner(project_id, full_name), github_pull_requests(html_url, number, title)')
      .eq('github_repositories.project_id', projectId)
      .order('github_created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return []
      throw error
    }

    return (data ?? []).map((row) => mapEvent(row as EventRow))
  },

  async getProjectGitHubReviewEvents(
    projectId: string,
    from: string | null,
    to: string | null,
  ): Promise<GitHubReviewEvent[]> {
    const rows = await rpcAdapter.call<ReviewEventRow[]>(
      'get_project_github_review_events',
      {
        target_from: from,
        target_project_id: projectId,
        target_to: to,
      },
    )

    return (rows ?? []).map((row) => mapReviewEvent(row))
  },

  async getOrganizationGitHubIdentityCandidates(
    organizationId: string,
  ): Promise<GitHubIdentityCandidate[]> {
    const rows = await rpcAdapter.call<IdentityCandidateRow[]>(
      'get_organization_github_identity_candidates',
      {
        target_org_id: organizationId,
      },
    )

    return (rows ?? []).map((row) => mapIdentityCandidate(row))
  },

  async setProfileGitHubLogin(
    organizationId: string,
    userId: string,
    githubLogin: string | null,
  ): Promise<void> {
    await rpcAdapter.call('set_profile_github_login', {
      target_github_login: githubLogin,
      target_org_id: organizationId,
      target_user_id: userId,
    })
  },

  async updateAnalyticsSettings(
    projectId: string,
    settings: GitHubAnalyticsSettings,
  ): Promise<void> {
    const { error } = await supabase()
      .from('project_github_settings')
      .update({
        analytics_sprint_length_weeks: settings.sprintLengthWeeks,
        analytics_last_sprint_end_date: settings.lastSprintEndDate,
        analytics_timezone: settings.timezone,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)

    if (error) throw error
  },

  async getCommitRollups(
    projectId: string,
    from: string,
    to: string,
  ): Promise<GitHubCommitDailyRollup[]> {
    const { data, error } = await supabase()
      .from('github_commit_daily_rollups')
      .select('*, github_repositories!inner(project_id)')
      .eq('github_repositories.project_id', projectId)
      .gte('activity_date', from)
      .lte('activity_date', to)
      .order('activity_date')

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return []
      throw error
    }

    return (data ?? []).map((row) =>
      mapCommitDailyRollup(row as CommitDailyRollupRow),
    )
  },
}
