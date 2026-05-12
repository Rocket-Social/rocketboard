import type {
  GitHubBoardConfig,
  GitHubBoardSummary,
  GitHubPullRequest,
  GitHubRepository,
} from './github.types'

const DAY_MS = 24 * 60 * 60 * 1000

export function resolveGitHubBoardConfig(
  value?: Partial<GitHubBoardConfig> | Record<string, unknown> | null,
): GitHubBoardConfig {
  const repoMode = value?.repoMode
  const selectedRepoId =
    typeof value?.selectedRepoId === 'string' &&
    value.selectedRepoId.trim().length > 0
      ? value.selectedRepoId.trim()
      : null

  if (repoMode === 'all') {
    return {
      repoMode: 'all',
      selectedRepoId: null,
    }
  }

  if (repoMode === 'selected' && selectedRepoId) {
    return {
      repoMode: 'selected',
      selectedRepoId,
    }
  }

  return {
    repoMode: 'unconfigured',
    selectedRepoId: null,
  }
}

export function buildGitHubBoardConfig(input: {
  repoMode: 'all' | 'selected'
  selectedRepoId?: string | null
}): GitHubBoardConfig {
  if (input.repoMode === 'all') {
    return {
      repoMode: 'all',
      selectedRepoId: null,
    }
  }

  if (
    typeof input.selectedRepoId === 'string' &&
    input.selectedRepoId.trim().length > 0
  ) {
    return {
      repoMode: 'selected',
      selectedRepoId: input.selectedRepoId.trim(),
    }
  }

  return {
    repoMode: 'unconfigured',
    selectedRepoId: null,
  }
}

export function getGitHubBoardRepositories(input: {
  config: GitHubBoardConfig
  repositories: GitHubRepository[]
}) {
  if (input.config.repoMode === 'all') {
    return input.repositories
  }

  if (input.config.repoMode === 'selected' && input.config.selectedRepoId) {
    return input.repositories.filter(
      (repository) => repository.id === input.config.selectedRepoId,
    )
  }

  return []
}

export function buildGitHubBoardSummary(input: {
  now?: Date
  pullRequests: GitHubPullRequest[]
}): GitHubBoardSummary {
  const now = input.now ?? new Date()
  const reviewWindowStart = new Date(now.getTime() - 30 * DAY_MS)
  const weekStart = startOfWeek(now)

  const reviewDurations = input.pullRequests
    .filter(
      (pullRequest) =>
        pullRequest.firstReviewSubmittedAt !== null &&
        new Date(pullRequest.createdAt).getTime() >=
          reviewWindowStart.getTime(),
    )
    .map(
      (pullRequest) =>
        (new Date(pullRequest.firstReviewSubmittedAt!).getTime() -
          new Date(pullRequest.createdAt).getTime()) /
        (60 * 60 * 1000),
    )

  const averageReviewHours =
    reviewDurations.length > 0
      ? roundToSingleDecimal(
          reviewDurations.reduce((sum, value) => sum + value, 0) /
            reviewDurations.length,
        )
      : 0

  return {
    avgReviewHours: averageReviewHours,
    mergedThisWeek: input.pullRequests.filter(
      (pullRequest) =>
        pullRequest.mergedAt !== null &&
        new Date(pullRequest.mergedAt).getTime() >= weekStart.getTime(),
    ).length,
    needsReviewCount: input.pullRequests.filter(
      (pullRequest) =>
        pullRequest.state === 'open' &&
        pullRequest.reviewState === 'review_requested',
    ).length,
    openCount: input.pullRequests.filter(
      (pullRequest) => pullRequest.state === 'open',
    ).length,
    staleCount: input.pullRequests.filter(
      (pullRequest) =>
        pullRequest.state === 'open' &&
        new Date(pullRequest.updatedAt).getTime() < now.getTime() - 3 * DAY_MS,
    ).length,
  }
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10
}

function startOfWeek(date: Date) {
  const nextDate = new Date(date)
  const day = nextDate.getDay()
  const diff = day === 0 ? -6 : 1 - day

  nextDate.setDate(nextDate.getDate() + diff)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}
