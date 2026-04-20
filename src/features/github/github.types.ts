export type GitHubConnectionScope = 'organization' | 'personal'
export type GitHubConnectionAuthType = 'pat' | 'github_app'
export type GitHubConnectionStatus = 'active' | 'error' | 'revoked'

export type GitHubConnectionSource = {
  id: string
  organizationId: string | null
  ownerUserId: string | null
  scopeType: GitHubConnectionScope
  authType: GitHubConnectionAuthType
  installationId: number
  accountLogin: string
  accountType: 'Organization' | 'User'
  accountAvatarUrl: string | null
  status: GitHubConnectionStatus
  installedBy: string | null
  lastValidatedAt: string | null
  createdAt: string
  updatedAt: string
}

export type GitHubInstallation = GitHubConnectionSource

export type GitHubAllowedRepository = {
  id: string
  connectionSourceId: string
  githubRepoId: number
  fullName: string
  name: string
  defaultBranch: string
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

export type GitHubProjectSettings = {
  projectId: string
  connectionSourceId: string | null
  autoTransitionsEnabled: boolean
  configuredBy: string | null
  analyticsSprintLengthWeeks: number | null
  analyticsLastSprintEndDate: string | null
  analyticsTimezone: string | null
  connectionSource: GitHubConnectionSource | null
  createdAt: string
  updatedAt: string
}

export type GitHubAnalyticsSettings = {
  sprintLengthWeeks: number
  lastSprintEndDate: string
  timezone: string
}

export type GitHubProjectCard = {
  id: string
  title: string
  projectCardNumber: number | null
}

export type GitHubLinkedCard = GitHubProjectCard & {
  linkType: 'auto' | 'manual'
}

export type GitHubRepository = {
  id: string
  projectId: string
  connectionSourceId: string
  githubRepoId: number
  fullName: string
  name: string
  defaultBranch: string
  isPrivate: boolean
  colorIndex: number
  historyBackfilledAt: string | null
  lastSyncedAt: string | null
  createdAt: string
}

export type GitHubPullRequest = {
  id: string
  repoId: string
  githubPrId: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  authorLogin: string | null
  authorAvatarUrl: string | null
  headRef: string | null
  baseRef: string | null
  additions: number
  deletions: number
  reviewState: 'approved' | 'changes_requested' | 'review_requested' | null
  reviewers: GitHubReviewer[]
  checksStatus: 'success' | 'failure' | 'pending' | null
  linkedCards: GitHubLinkedCard[]
  htmlUrl: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  firstReviewSubmittedAt: string | null
  lastReviewSubmittedAt: string | null
  reviewCount: number
  approvalCount: number
  changesRequestedCount: number
  syncedAt: string
}

export type GitHubAnalyticsPullRequest = {
  id: string
  repoId: string
  githubPrId: number
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  authorLogin: string | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  reviewState: GitHubPullRequest['reviewState']
  firstReviewSubmittedAt: string | null
  lastReviewSubmittedAt: string | null
  reviewCount: number
  approvalCount: number
  changesRequestedCount: number
}

export type GitHubReviewer = {
  login: string
  avatarUrl: string | null
  state: 'approved' | 'changes_requested' | 'pending' | 'dismissed'
}

export type CardGitHubLink = {
  id: string
  cardId: string
  pullRequestId: string
  linkType: 'auto' | 'manual'
  createdAt: string
}

export type GitHubEvent = {
  id: string
  repoId: string
  eventType: GitHubEventType
  actorLogin: string | null
  actorAvatarUrl: string | null
  pullRequestId: string | null
  payload: Record<string, unknown>
  githubCreatedAt: string
  createdAt: string
}

export type GitHubReviewEvent = {
  id: string
  repoId: string
  actorLogin: string | null
  actorAvatarUrl: string | null
  pullRequestId: string | null
  payload: Record<string, unknown>
  githubCreatedAt: string
}

export type GitHubEventType =
  | 'pr_opened'
  | 'pr_merged'
  | 'pr_closed'
  | 'pr_edited'
  | 'pr_draft'
  | 'pr_ready'
  | 'review_submitted'
  | 'push'

export type GitHubBoardSummary = {
  openCount: number
  needsReviewCount: number
  staleCount: number
  mergedThisWeek: number
  avgReviewHours: number
}

export type GitHubBoardRepoMode = 'all' | 'selected' | 'unconfigured'

export type GitHubBoardConfig = {
  repoMode: GitHubBoardRepoMode
  selectedRepoId: string | null
}

export type GitHubIdentityCandidate = {
  githubLogin: string
  lastSeenAt: string | null
  prCount: number
  reviewCount: number
}

export type GitHubTeamCardSummary = {
  id: string
  linkedPullRequests: {
    htmlUrl: string
    id: string
    number: number
    reviewState: GitHubPullRequest['reviewState']
    state: GitHubPullRequest['state']
    title: string
    updatedAt: string
  }[]
  projectCardNumber: number | null
  statusCategory: 'not_started' | 'started' | 'completed' | null
  title: string
}

export type GitHubTeamMemberSnapshot = {
  assignedCards: GitHubTeamCardSummary[]
  assignedDoneCount: number
  assignedTotalCount: number
  authoredOpenPullRequests: {
    htmlUrl: string
    id: string
    number: number
    reviewState: GitHubPullRequest['reviewState']
    state: GitHubPullRequest['state']
    title: string
    updatedAt: string
  }[]
  cycleTimeDeltaHours: number | null
  cycleTimeHours: number | null
  cycleTimeSeries: Array<number | null>
  githubLogin: string | null
  inReviewCount: number
  memberId: string
  memberName: string
  mergedCount: number
  openCount: number
  reviewTurnaroundDeltaHours: number | null
  reviewTurnaroundHours: number | null
  reviewsGiven: number
  reviewsReceived: number
  staleCount: number
  wipCount: number
}

export type GitHubTeamSnapshot = {
  activeSprint: {
    endDate: string | null
    id: string
    name: string
    startDate: string | null
  } | null
  members: GitHubTeamMemberSnapshot[]
  unmappedContributors: GitHubIdentityCandidate[]
}

export type GitHubHealthMetricKey =
  | 'review_turnaround'
  | 'cycle_time'
  | 'stale_work'
  | 'throughput'

export type GitHubHealthBreakdownRow = {
  githubLogin: string | null
  isUnmapped: boolean
  label: string
  sampleCount: number
  value: number | null
}

export type GitHubHealthMetricSnapshot = {
  currentValue: number | null
  delta: number | null
  detailRows: GitHubHealthBreakdownRow[]
  isInsufficient: boolean
  key: GitHubHealthMetricKey
  label: string
  sampleCount: number
  series: Array<number | null>
  summary: string
}

export type GitHubHealthSnapshot = {
  earliestHistoryAt: string | null
  isReady: boolean
  metrics: GitHubHealthMetricSnapshot[]
  readinessReason: string | null
  unmappedContributors: GitHubIdentityCandidate[]
}

export type PRLifecycleState =
  | 'draft'
  | 'open'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'merged'
  | 'closed'

export function derivePRLifecycleState(
  pr: GitHubPullRequest,
): PRLifecycleState {
  if (pr.mergedAt !== null) return 'merged'
  if (pr.state === 'closed') return 'closed'
  if (pr.draft) return 'draft'
  if (pr.reviewState === 'approved') return 'approved'
  if (pr.reviewState === 'changes_requested') return 'changes_requested'
  if (pr.reviewState === 'review_requested') return 'in_review'
  return 'open'
}

export type PRKanbanColumn =
  | 'draft'
  | 'open'
  | 'in_review'
  | 'approved'
  | 'merged'

export function prLifecycleToKanbanColumn(
  state: PRLifecycleState,
): PRKanbanColumn {
  switch (state) {
    case 'draft':
      return 'draft'
    case 'open':
      return 'open'
    case 'in_review':
    case 'changes_requested':
      return 'in_review'
    case 'approved':
      return 'approved'
    case 'merged':
      return 'merged'
    case 'closed':
      return 'merged'
  }
}

export const PR_KANBAN_COLUMNS: { key: PRKanbanColumn; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'open', label: 'Open' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'merged', label: 'Merged' },
]

export type GitHubBoardTab = 'prs' | 'activity' | 'team' | 'health' | 'settings'

// -- Historical sprint analytics types --

export type GitHubSprintWindow = {
  label: string
  startDate: string
  endDate: string
}

export type GitHubSprintActivityBadge =
  | 'opened'
  | 'reviewed'
  | 'merged'
  | 'closed'
  | 'carry-over'

export type GitHubSprintPR = {
  id: string
  repoId: string
  repoName: string
  number: number
  title: string
  authorLogin: string | null
  htmlUrl: string
  state: 'open' | 'closed' | 'merged'
  createdAt: string
  mergedAt: string | null
  closedAt: string | null
  cycleTimeHours: number | null
  firstReviewTimeHours: number | null
  badges: GitHubSprintActivityBadge[]
}

export type GitHubSprintContributor = {
  login: string
  isUnmapped: boolean
  prsMerged: number
  reviewsSubmitted: number
}

export type GitHubSprintDelta = {
  metric: string
  direction: 'up' | 'down' | 'same'
  value: string
  label: string
}

export type GitHubSprintSummary = {
  window: GitHubSprintWindow
  commits: number
  prsOpened: number
  prsMerged: number
  reviewsSubmitted: number
  medianCycleTimeHours: number | null
  medianFirstReviewTimeHours: number | null
  activeContributors: number
  carryOverCount: number
  delta: GitHubSprintDelta | null
  contributors: GitHubSprintContributor[]
  pullRequests: GitHubSprintPR[]
}

export type GitHubCommitDataPoint = {
  date: string
  count: number
}

export type GitHubHistoricalTeamSnapshot = {
  settings: GitHubAnalyticsSettings
  sprintWindows: GitHubSprintWindow[]
  commitSeries: GitHubCommitDataPoint[]
  sprints: GitHubSprintSummary[]
  unmappedContributors: GitHubIdentityCandidate[]
}

export type GitHubCommitDailyRollup = {
  id: string
  repoId: string
  activityDate: string
  commitCount: number
  computedTimezone: string
}

export type GitHubPRFilters = {
  repoIds: string[]
  authorLogins: string[]
  search: string
}

export const emptyGitHubPRFilters: GitHubPRFilters = {
  repoIds: [],
  authorLogins: [],
  search: '',
}
