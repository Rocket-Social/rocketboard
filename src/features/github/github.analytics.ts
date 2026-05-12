import {getStatusOptionCategory} from '../cards/card-view-mappers'
import type {CardRecord, ProjectStatusOption} from '../cards/card.types'
import type {ProjectMember} from '../access/access.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import type {
  GitHubAnalyticsPullRequest,
  GitHubAnalyticsSettings,
  GitHubCommitDailyRollup,
  GitHubCommitDataPoint,
  GitHubHealthBreakdownRow,
  GitHubHealthMetricSnapshot,
  GitHubHealthSnapshot,
  GitHubHistoricalTeamSnapshot,
  GitHubIdentityCandidate,
  GitHubPullRequest,
  GitHubRepository,
  GitHubReviewEvent,
  GitHubSprintActivityBadge,
  GitHubSprintContributor,
  GitHubSprintDelta,
  GitHubSprintPR,
  GitHubSprintSummary,
  GitHubSprintWindow,
  GitHubTeamCardSummary,
  GitHubTeamMemberSnapshot,
  GitHubTeamSnapshot,
} from './github.types'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

type TimeBucket = {
  end: Date
  start: Date
}

function normalizeGithubLogin(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized && normalized.length > 0 ? normalized : null
}

function isBotLogin(value: string | null | undefined) {
  return value ? /\[bot\]$/i.test(value) : false
}

function startOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(23, 59, 59, 999)
  return next
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function toDate(value: string | null | undefined) {
  return value ? new Date(value) : null
}

function toMs(value: string | null | undefined) {
  const date = toDate(value)
  return date ? date.getTime() : null
}

function isWithinRange(value: string | null | undefined, start: Date, end: Date) {
  const ms = toMs(value)
  if (ms === null) return false
  return ms >= start.getTime() && ms < end.getTime()
}

function roundToSingleDecimal(value: number | null) {
  if (value === null || Number.isNaN(value)) return null
  return Math.round(value * 10) / 10
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) {
    return roundToSingleDecimal(sorted[middle] ?? null)
  }

  return roundToSingleDecimal(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

function hoursBetween(startValue: string | null | undefined, endValue: string | null | undefined) {
  const start = toMs(startValue)
  const end = toMs(endValue)
  if (start === null || end === null || end < start) return null
  return (end - start) / HOUR_MS
}

function buildWeeklyBuckets(end: Date, count = 6): TimeBucket[] {
  const bucketStart = startOfDay(addDays(end, -(count * 7)))
  return Array.from({length: count}, (_unused, index) => {
    const start = addDays(bucketStart, index * 7)
    return {
      end: index === count - 1 ? new Date(end) : addDays(start, 7),
      start,
    }
  })
}

function resolveSprintWindow(activeSprint: ProjectSprintRecord, now: Date) {
  const fallbackStart = startOfDay(addDays(now, -14))
  const sprintStart = activeSprint.startDate ? new Date(`${activeSprint.startDate}T00:00:00`) : fallbackStart
  const rawSprintEnd = activeSprint.endDate ? endOfDay(new Date(`${activeSprint.endDate}T00:00:00`)) : now
  const sprintEnd = rawSprintEnd.getTime() > now.getTime() ? now : rawSprintEnd

  return {
    end: sprintEnd,
    start: sprintStart,
  }
}

function toMetricLoginBuckets<T>(
  items: T[],
  getLogin: (item: T) => string | null,
  projectMembersByLogin: Map<string, ProjectMember>,
) {
  const buckets = new Map<string, {items: T[]; login: string | null; member: ProjectMember | null}>()

  for (const item of items) {
    const login = normalizeGithubLogin(getLogin(item))
    const member = login ? projectMembersByLogin.get(login) ?? null : null
    const key = member ? member.id : 'unmapped'
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(item)
      continue
    }

    buckets.set(key, {
      items: [item],
      login,
      member,
    })
  }

  return [...buckets.values()]
}

function summarizeUnmappedContributors(
  logins: Array<{githubLogin: string | null; lastSeenAt: string | null; prDelta?: number; reviewDelta?: number}>,
  projectMembersByLogin: Map<string, ProjectMember>,
) {
  const contributors = new Map<string, GitHubIdentityCandidate>()

  for (const item of logins) {
    const normalized = normalizeGithubLogin(item.githubLogin)
    if (!normalized || isBotLogin(normalized) || projectMembersByLogin.has(normalized)) continue

    const current = contributors.get(normalized)
    const lastSeenAt = item.lastSeenAt
    if (current) {
      current.prCount += item.prDelta ?? 0
      current.reviewCount += item.reviewDelta ?? 0
      if (lastSeenAt && (!current.lastSeenAt || new Date(lastSeenAt).getTime() > new Date(current.lastSeenAt).getTime())) {
        current.lastSeenAt = lastSeenAt
      }
      continue
    }

    contributors.set(normalized, {
      githubLogin: normalized,
      lastSeenAt,
      prCount: item.prDelta ?? 0,
      reviewCount: item.reviewDelta ?? 0,
    })
  }

  return [...contributors.values()].sort((left, right) => {
    const leftTime = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0
    const rightTime = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0
    if (leftTime !== rightTime) {
      return rightTime - leftTime
    }
    return left.githubLogin.localeCompare(right.githubLogin)
  })
}

function getActiveSprint(projectSprints: ProjectSprintRecord[]) {
  return [...projectSprints]
    .filter((sprint) => sprint.status === 'active')
    .sort((left, right) => left.position - right.position)[0] ?? null
}

function getPlannedSprint(projectSprints: ProjectSprintRecord[]) {
  return [...projectSprints]
    .filter((sprint) => sprint.status === 'planned')
    .sort((left, right) => left.position - right.position)[0] ?? null
}

function buildTeamCardSummary(
  card: CardRecord,
  linkedPullRequests: GitHubPullRequest[],
  statusOptions: ProjectStatusOption[],
): GitHubTeamCardSummary {
  return {
    id: card.id,
    linkedPullRequests: linkedPullRequests
      .slice()
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .map((pullRequest) => ({
        htmlUrl: pullRequest.htmlUrl,
        id: pullRequest.id,
        number: pullRequest.number,
        reviewState: pullRequest.reviewState,
        state: pullRequest.state,
        title: pullRequest.title,
        updatedAt: pullRequest.updatedAt,
      })),
    projectCardNumber: card.projectCardNumber ?? null,
    statusCategory: getStatusOptionCategory(card.statusOptionId, statusOptions),
    title: card.title,
  }
}

function buildTimingBreakdownRows(
  pullRequests: GitHubAnalyticsPullRequest[],
  projectMembersByLogin: Map<string, ProjectMember>,
  getTimingHours: (pullRequest: GitHubAnalyticsPullRequest) => number | null,
): GitHubHealthBreakdownRow[] {
  return toMetricLoginBuckets(
    pullRequests.filter((pullRequest) => getTimingHours(pullRequest) !== null),
    (pullRequest) => pullRequest.authorLogin,
    projectMembersByLogin,
  )
    .map((bucket) => ({
      githubLogin: bucket.login,
      isUnmapped: bucket.member === null,
      label: bucket.member?.name ?? 'Unmapped contributors',
      sampleCount: bucket.items.length,
      value: median(bucket.items.map((pullRequest) => getTimingHours(pullRequest) ?? 0)),
    }))
    .sort((left, right) => {
      if (left.isUnmapped !== right.isUnmapped) {
        return left.isUnmapped ? 1 : -1
      }
      if ((left.value ?? Number.POSITIVE_INFINITY) !== (right.value ?? Number.POSITIVE_INFINITY)) {
        return (left.value ?? Number.POSITIVE_INFINITY) - (right.value ?? Number.POSITIVE_INFINITY)
      }
      return right.sampleCount - left.sampleCount
    })
}

function buildCountBreakdownRows(
  pullRequests: GitHubAnalyticsPullRequest[],
  projectMembersByLogin: Map<string, ProjectMember>,
): GitHubHealthBreakdownRow[] {
  return toMetricLoginBuckets(
    pullRequests,
    (pullRequest) => pullRequest.authorLogin,
    projectMembersByLogin,
  )
    .map((bucket) => ({
      githubLogin: bucket.login,
      isUnmapped: bucket.member === null,
      label: bucket.member?.name ?? 'Unmapped contributors',
      sampleCount: bucket.items.length,
      value: bucket.items.length,
    }))
    .sort((left, right) => {
      if ((right.value ?? 0) !== (left.value ?? 0)) {
        return (right.value ?? 0) - (left.value ?? 0)
      }
      return left.label.localeCompare(right.label)
    })
}

function buildStaleBreakdownRows(
  pullRequests: GitHubPullRequest[],
  projectMembersByLogin: Map<string, ProjectMember>,
): GitHubHealthBreakdownRow[] {
  return toMetricLoginBuckets(
    pullRequests,
    (pullRequest) => pullRequest.authorLogin,
    projectMembersByLogin,
  )
    .map((bucket) => ({
      githubLogin: bucket.login,
      isUnmapped: bucket.member === null,
      label: bucket.member?.name ?? 'Unmapped contributors',
      sampleCount: bucket.items.length,
      value: bucket.items.length,
    }))
    .sort((left, right) => {
      if ((right.value ?? 0) !== (left.value ?? 0)) {
        return (right.value ?? 0) - (left.value ?? 0)
      }
      return left.label.localeCompare(right.label)
    })
}

function buildMetricSeries(
  buckets: TimeBucket[],
  pullRequests: GitHubAnalyticsPullRequest[],
  filter: (pullRequest: GitHubAnalyticsPullRequest, bucket: TimeBucket) => boolean,
  summarize: (matchingPullRequests: GitHubAnalyticsPullRequest[]) => number | null,
) {
  return buckets.map((bucket) => summarize(pullRequests.filter((pullRequest) => filter(pullRequest, bucket))))
}

function buildTimingMetricSummary(label: string, sampleCount: number) {
  return sampleCount === 1 ? `${label} across 1 PR` : `${label} across ${sampleCount} PRs`
}

function buildOpenStalePullRequests(allPullRequests: GitHubPullRequest[], now: Date) {
  const threshold = now.getTime() - (72 * HOUR_MS)
  return allPullRequests.filter((pullRequest) => {
    if (pullRequest.state !== 'open') return false
    return new Date(pullRequest.updatedAt).getTime() <= threshold
  })
}

function buildStaleIncidentCount(
  pullRequests: GitHubAnalyticsPullRequest[],
  bucketStart: Date,
  bucketEnd: Date,
  now: Date,
) {
  return pullRequests.filter((pullRequest) => {
    if (!isWithinRange(pullRequest.createdAt, bucketStart, bucketEnd)) return false

    const firstExitAt = [pullRequest.firstReviewSubmittedAt, pullRequest.closedAt, pullRequest.mergedAt]
      .map((value) => toMs(value))
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)[0] ?? now.getTime()

    return firstExitAt - new Date(pullRequest.createdAt).getTime() > (72 * HOUR_MS)
  }).length
}

export function buildGitHubTeamSnapshot(input: {
  allPullRequests: GitHubPullRequest[]
  analyticsPullRequests: GitHubAnalyticsPullRequest[]
  cards: CardRecord[]
  now?: Date
  projectMembers: ProjectMember[]
  projectSprints: ProjectSprintRecord[]
  reviewEvents: GitHubReviewEvent[]
  statusOptions: ProjectStatusOption[]
}): GitHubTeamSnapshot {
  const now = input.now ?? new Date()
  const activeSprint = getActiveSprint(input.projectSprints)

  if (!activeSprint) {
    return {
      activeSprint: null,
      members: [],
      unmappedContributors: [],
    }
  }

  const sprintWindow = resolveSprintWindow(activeSprint, now)
  const baselineStart = addDays(sprintWindow.start, -42)
  const trendBuckets = buildWeeklyBuckets(now)
  const projectMembersByLogin = new Map(
    input.projectMembers
      .map((member) => [normalizeGithubLogin(member.githubLogin), member] as const)
      .filter((entry): entry is [string, ProjectMember] => entry[0] !== null),
  )

  const linkedPullRequestsByCardId = new Map<string, GitHubPullRequest[]>()
  for (const pullRequest of input.allPullRequests) {
    for (const linkedCard of pullRequest.linkedCards) {
      const existing = linkedPullRequestsByCardId.get(linkedCard.id)
      if (existing) {
        existing.push(pullRequest)
      } else {
        linkedPullRequestsByCardId.set(linkedCard.id, [pullRequest])
      }
    }
  }

  const sprintReviewEvents = input.reviewEvents.filter((event) => isWithinRange(event.githubCreatedAt, sprintWindow.start, sprintWindow.end))

  const teamCycleBaseline = median(
    input.analyticsPullRequests
      .filter((pullRequest) => isWithinRange(pullRequest.mergedAt, baselineStart, sprintWindow.start))
      .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt))
      .filter((value): value is number => value !== null),
  )

  const teamReviewBaseline = median(
    input.analyticsPullRequests
      .filter((pullRequest) => isWithinRange(pullRequest.createdAt, baselineStart, sprintWindow.start))
      .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt))
      .filter((value): value is number => value !== null),
  )

  const members: GitHubTeamMemberSnapshot[] = []

  for (const member of input.projectMembers) {
    const githubLogin = normalizeGithubLogin(member.githubLogin)
    const assignedCards = input.cards.filter((card) => card.sprintId === activeSprint.id && card.assigneeUserId === member.id)
    const authoredAnalytics = githubLogin
      ? input.analyticsPullRequests.filter((pullRequest) => normalizeGithubLogin(pullRequest.authorLogin) === githubLogin)
      : []
    const authoredPullRequests = githubLogin
      ? input.allPullRequests.filter((pullRequest) => normalizeGithubLogin(pullRequest.authorLogin) === githubLogin)
      : []

    const authoredSprintOpened = authoredAnalytics.filter((pullRequest) => isWithinRange(pullRequest.createdAt, sprintWindow.start, sprintWindow.end))
    const authoredSprintMerged = authoredAnalytics.filter((pullRequest) => isWithinRange(pullRequest.mergedAt, sprintWindow.start, sprintWindow.end))
    const authoredOpenPullRequests = authoredPullRequests.filter((pullRequest) => pullRequest.state === 'open')
    const authoredOpenSummary = authoredOpenPullRequests.filter((pullRequest) => pullRequest.reviewState === null && !pullRequest.draft).length
    const authoredInReviewSummary = authoredOpenPullRequests.filter((pullRequest) => pullRequest.reviewState !== null).length

    const cycleTimeHours = median(
      authoredSprintMerged
        .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt))
        .filter((value): value is number => value !== null),
    )
    const reviewTurnaroundHours = median(
      authoredSprintOpened
        .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt))
        .filter((value): value is number => value !== null),
    )

    const memberCycleBaselineSamples = authoredAnalytics
      .filter((pullRequest) => isWithinRange(pullRequest.mergedAt, baselineStart, sprintWindow.start))
      .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt))
      .filter((value): value is number => value !== null)
    const memberReviewBaselineSamples = authoredAnalytics
      .filter((pullRequest) => isWithinRange(pullRequest.createdAt, baselineStart, sprintWindow.start))
      .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt))
      .filter((value): value is number => value !== null)

    const cycleBaseline = memberCycleBaselineSamples.length >= 3 ? median(memberCycleBaselineSamples) : teamCycleBaseline
    const reviewBaseline = memberReviewBaselineSamples.length >= 3 ? median(memberReviewBaselineSamples) : teamReviewBaseline

    const linkedStalePullRequests = assignedCards.flatMap((card) => linkedPullRequestsByCardId.get(card.id) ?? [])
    const stalePullRequestIds = new Set<string>()
    for (const pullRequest of [...authoredOpenPullRequests, ...linkedStalePullRequests]) {
      if (pullRequest.state !== 'open') continue
      if (new Date(pullRequest.updatedAt).getTime() > now.getTime() - (72 * HOUR_MS)) continue
      stalePullRequestIds.add(pullRequest.id)
    }

    const reviewsGiven = githubLogin
      ? sprintReviewEvents.filter((event) => normalizeGithubLogin(event.actorLogin) === githubLogin).length
      : 0
    const authoredPullRequestIds = new Set(authoredPullRequests.map((pullRequest) => pullRequest.id))
    const reviewsReceived = sprintReviewEvents.filter((event) => event.pullRequestId && authoredPullRequestIds.has(event.pullRequestId)).length

    const hasMatchedGitHubActivity = authoredSprintOpened.length > 0 || authoredSprintMerged.length > 0 || reviewsGiven > 0 || reviewsReceived > 0
    if (assignedCards.length === 0 && !hasMatchedGitHubActivity) {
      continue
    }

    members.push({
      assignedCards: assignedCards.map((card) =>
        buildTeamCardSummary(card, linkedPullRequestsByCardId.get(card.id) ?? [], input.statusOptions),
      ),
      assignedDoneCount: assignedCards.filter((card) => getStatusOptionCategory(card.statusOptionId, input.statusOptions) === 'completed').length,
      assignedTotalCount: assignedCards.length,
      authoredOpenPullRequests: authoredOpenPullRequests
        .slice()
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .map((pullRequest) => ({
          htmlUrl: pullRequest.htmlUrl,
          id: pullRequest.id,
          number: pullRequest.number,
          reviewState: pullRequest.reviewState,
          state: pullRequest.state,
          title: pullRequest.title,
          updatedAt: pullRequest.updatedAt,
        })),
      cycleTimeDeltaHours: cycleTimeHours !== null && cycleBaseline !== null ? roundToSingleDecimal(cycleTimeHours - cycleBaseline) : null,
      cycleTimeHours,
      cycleTimeSeries: trendBuckets.map((bucket) => median(
        authoredAnalytics
          .filter((pullRequest) => isWithinRange(pullRequest.mergedAt, bucket.start, bucket.end))
          .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt))
          .filter((value): value is number => value !== null),
      )),
      githubLogin,
      inReviewCount: authoredInReviewSummary,
      memberId: member.id,
      memberName: member.name,
      mergedCount: authoredSprintMerged.length,
      openCount: authoredOpenSummary,
      reviewTurnaroundDeltaHours: reviewTurnaroundHours !== null && reviewBaseline !== null ? roundToSingleDecimal(reviewTurnaroundHours - reviewBaseline) : null,
      reviewTurnaroundHours,
      reviewsGiven,
      reviewsReceived,
      staleCount: stalePullRequestIds.size,
      wipCount: assignedCards.filter((card) => getStatusOptionCategory(card.statusOptionId, input.statusOptions) === 'started').length,
    })
  }

  const unmappedContributors = summarizeUnmappedContributors([
    ...input.analyticsPullRequests
      .filter((pullRequest) =>
        isWithinRange(pullRequest.createdAt, sprintWindow.start, sprintWindow.end)
        || isWithinRange(pullRequest.mergedAt, sprintWindow.start, sprintWindow.end),
      )
      .map((pullRequest) => ({
        githubLogin: pullRequest.authorLogin,
        lastSeenAt: pullRequest.mergedAt ?? pullRequest.updatedAt,
        prDelta: 1,
      })),
    ...sprintReviewEvents.map((event) => ({
      githubLogin: event.actorLogin,
      lastSeenAt: event.githubCreatedAt,
      reviewDelta: 1,
    })),
  ], projectMembersByLogin)

  return {
    activeSprint: {
      endDate: activeSprint.endDate,
      id: activeSprint.id,
      name: activeSprint.name,
      startDate: activeSprint.startDate,
    },
    members: members.sort((left, right) => {
      if (left.staleCount !== right.staleCount) {
        return right.staleCount - left.staleCount
      }
      if (left.wipCount !== right.wipCount) {
        return right.wipCount - left.wipCount
      }
      return left.memberName.localeCompare(right.memberName)
    }),
    unmappedContributors,
  }
}

export function buildGitHubHealthSnapshot(input: {
  allPullRequests: GitHubPullRequest[]
  analyticsPullRequests: GitHubAnalyticsPullRequest[]
  now?: Date
  projectMembers: ProjectMember[]
  repositories: GitHubRepository[]
}): GitHubHealthSnapshot {
  const now = input.now ?? new Date()
  const currentWindowStart = startOfDay(addDays(now, -42))
  const previousWindowStart = startOfDay(addDays(currentWindowStart, -42))
  const currentBuckets = buildWeeklyBuckets(now)
  const projectMembersByLogin = new Map(
    input.projectMembers
      .map((member) => [normalizeGithubLogin(member.githubLogin), member] as const)
      .filter((entry): entry is [string, ProjectMember] => entry[0] !== null),
  )

  const earliestHistoryAt = input.analyticsPullRequests
    .map((pullRequest) => pullRequest.createdAt)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null
  const allRepositoriesBackfilled = input.repositories.length > 0 && input.repositories.every((repository) => repository.historyBackfilledAt !== null)
  const hasMinimumHistory = earliestHistoryAt !== null && now.getTime() - new Date(earliestHistoryAt).getTime() >= (14 * DAY_MS)

  if (!allRepositoriesBackfilled || !hasMinimumHistory) {
    return {
      earliestHistoryAt,
      isReady: false,
      metrics: [],
      readinessReason: !allRepositoriesBackfilled
        ? 'Backfill in progress for one or more attached repositories.'
        : 'Health metrics appear after at least 14 days of pull request history.',
      unmappedContributors: [],
    }
  }

  const currentReviewPullRequests = input.analyticsPullRequests.filter((pullRequest) =>
    isWithinRange(pullRequest.createdAt, currentWindowStart, now)
    && pullRequest.firstReviewSubmittedAt !== null,
  )
  const previousReviewPullRequests = input.analyticsPullRequests.filter((pullRequest) =>
    isWithinRange(pullRequest.createdAt, previousWindowStart, currentWindowStart)
    && pullRequest.firstReviewSubmittedAt !== null,
  )
  const currentMergedPullRequests = input.analyticsPullRequests.filter((pullRequest) =>
    isWithinRange(pullRequest.mergedAt, currentWindowStart, now),
  )
  const previousMergedPullRequests = input.analyticsPullRequests.filter((pullRequest) =>
    isWithinRange(pullRequest.mergedAt, previousWindowStart, currentWindowStart),
  )
  const currentOpenStalePullRequests = buildOpenStalePullRequests(input.allPullRequests, now)
  const currentStaleIncidents = buildStaleIncidentCount(input.analyticsPullRequests, currentWindowStart, now, now)
  const previousStaleIncidents = buildStaleIncidentCount(input.analyticsPullRequests, previousWindowStart, currentWindowStart, currentWindowStart)

  const reviewTurnaroundMetric: GitHubHealthMetricSnapshot = {
    currentValue: median(currentReviewPullRequests.map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt)).filter((value): value is number => value !== null)),
    delta: previousReviewPullRequests.length > 0
      ? roundToSingleDecimal(
        (median(currentReviewPullRequests.map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt)).filter((value): value is number => value !== null)) ?? 0)
          - (median(previousReviewPullRequests.map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt)).filter((value): value is number => value !== null)) ?? 0),
      )
      : null,
    detailRows: buildTimingBreakdownRows(
      currentReviewPullRequests,
      projectMembersByLogin,
      (pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt),
    ),
    isInsufficient: currentReviewPullRequests.length < 3,
    key: 'review_turnaround',
    label: 'Review turnaround',
    sampleCount: currentReviewPullRequests.length,
    series: buildMetricSeries(
      currentBuckets,
      input.analyticsPullRequests,
      (pullRequest, bucket) => isWithinRange(pullRequest.createdAt, bucket.start, bucket.end) && pullRequest.firstReviewSubmittedAt !== null,
      (pullRequests) => median(
        pullRequests
          .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.firstReviewSubmittedAt))
          .filter((value): value is number => value !== null),
      ),
    ),
    summary: buildTimingMetricSummary('Median hours to first review', currentReviewPullRequests.length),
  }

  const cycleTimeMetric: GitHubHealthMetricSnapshot = {
    currentValue: median(currentMergedPullRequests.map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt)).filter((value): value is number => value !== null)),
    delta: previousMergedPullRequests.length > 0
      ? roundToSingleDecimal(
        (median(currentMergedPullRequests.map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt)).filter((value): value is number => value !== null)) ?? 0)
          - (median(previousMergedPullRequests.map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt)).filter((value): value is number => value !== null)) ?? 0),
      )
      : null,
    detailRows: buildTimingBreakdownRows(
      currentMergedPullRequests,
      projectMembersByLogin,
      (pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt),
    ),
    isInsufficient: currentMergedPullRequests.length < 3,
    key: 'cycle_time',
    label: 'Cycle time',
    sampleCount: currentMergedPullRequests.length,
    series: buildMetricSeries(
      currentBuckets,
      input.analyticsPullRequests,
      (pullRequest, bucket) => isWithinRange(pullRequest.mergedAt, bucket.start, bucket.end),
      (pullRequests) => median(
        pullRequests
          .map((pullRequest) => hoursBetween(pullRequest.createdAt, pullRequest.mergedAt))
          .filter((value): value is number => value !== null),
      ),
    ),
    summary: buildTimingMetricSummary('Median hours from PR open to merge', currentMergedPullRequests.length),
  }

  const throughputMetric: GitHubHealthMetricSnapshot = {
    currentValue: currentMergedPullRequests.length,
    delta: currentMergedPullRequests.length - previousMergedPullRequests.length,
    detailRows: buildCountBreakdownRows(currentMergedPullRequests, projectMembersByLogin),
    isInsufficient: currentMergedPullRequests.length < 3,
    key: 'throughput',
    label: 'Throughput',
    sampleCount: currentMergedPullRequests.length,
    series: buildMetricSeries(
      currentBuckets,
      input.analyticsPullRequests,
      (pullRequest, bucket) => isWithinRange(pullRequest.mergedAt, bucket.start, bucket.end),
      (pullRequests) => pullRequests.length,
    ),
    summary: currentMergedPullRequests.length === 1 ? '1 PR merged in the last 6 weeks' : `${currentMergedPullRequests.length} PRs merged in the last 6 weeks`,
  }

  const staleWorkMetric: GitHubHealthMetricSnapshot = {
    currentValue: currentOpenStalePullRequests.length,
    delta: currentStaleIncidents - previousStaleIncidents,
    detailRows: buildStaleBreakdownRows(currentOpenStalePullRequests, projectMembersByLogin),
    isInsufficient: false,
    key: 'stale_work',
    label: 'Stale work',
    sampleCount: currentOpenStalePullRequests.length,
    series: currentBuckets.map((bucket) => buildStaleIncidentCount(input.analyticsPullRequests, bucket.start, bucket.end, now)),
    summary: currentOpenStalePullRequests.length === 1 ? '1 currently open stale PR' : `${currentOpenStalePullRequests.length} currently open stale PRs`,
  }

  const unmappedContributors = summarizeUnmappedContributors(
    input.analyticsPullRequests
      .filter((pullRequest) =>
        isWithinRange(pullRequest.createdAt, currentWindowStart, now)
        || isWithinRange(pullRequest.mergedAt, currentWindowStart, now),
      )
      .map((pullRequest) => ({
        githubLogin: pullRequest.authorLogin,
        lastSeenAt: pullRequest.mergedAt ?? pullRequest.updatedAt,
        prDelta: 1,
      })),
    projectMembersByLogin,
  )

  return {
    earliestHistoryAt,
    isReady: true,
    metrics: [
      reviewTurnaroundMetric,
      cycleTimeMetric,
      staleWorkMetric,
      throughputMetric,
    ],
    readinessReason: null,
    unmappedContributors,
  }
}

export function getGitHubPlannedSprint(projectSprints: ProjectSprintRecord[]) {
  return getPlannedSprint(projectSprints)
}

// ==========================================================================
// Historical Sprint Analytics
// ==========================================================================

function getMostRecentFriday(now: Date): string {
  const d = new Date(now)
  const day = d.getDay()
  const diff = day >= 5 ? day - 5 : day + 2
  d.setDate(d.getDate() - diff)
  return d.toISOString().split('T')[0]!
}

export function getDefaultAnalyticsSettings(now?: Date): GitHubAnalyticsSettings {
  const ref = now ?? new Date()
  return {
    sprintLengthWeeks: 2,
    lastSprintEndDate: getMostRecentFriday(ref),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

export function resolveAnalyticsSettings(
  projectSettings: {
    analyticsSprintLengthWeeks: number | null
    analyticsLastSprintEndDate: string | null
    analyticsTimezone: string | null
  } | null,
): GitHubAnalyticsSettings {
  const defaults = getDefaultAnalyticsSettings()
  if (!projectSettings) return defaults
  return {
    sprintLengthWeeks: projectSettings.analyticsSprintLengthWeeks ?? defaults.sprintLengthWeeks,
    lastSprintEndDate: projectSettings.analyticsLastSprintEndDate ?? defaults.lastSprintEndDate,
    timezone: projectSettings.analyticsTimezone ?? defaults.timezone,
  }
}

export function deriveSprintWindows(settings: GitHubAnalyticsSettings, count: number): GitHubSprintWindow[] {
  if (count <= 0) return []

  const sprintDays = settings.sprintLengthWeeks * 7
  // Use noon UTC to avoid timezone day-boundary shifts
  const anchorEnd = new Date(`${settings.lastSprintEndDate}T12:00:00Z`)
  const windows: GitHubSprintWindow[] = []

  for (let i = 0; i < count; i++) {
    const endDate = addDays(anchorEnd, -(i * sprintDays))
    const startDate = addDays(endDate, -(sprintDays - 1))

    const fmt = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'})
    const label = `Sprint · ${fmt.format(startDate)} – ${fmt.format(endDate)}`

    windows.push({
      label,
      startDate: endDate.toISOString().split('T')[0] === startDate.toISOString().split('T')[0]
        ? startDate.toISOString().split('T')[0]!
        : startDate.toISOString().split('T')[0]!,
      endDate: endDate.toISOString().split('T')[0]!,
    })
  }

  return windows
}

function computeSprintBadges(
  pr: GitHubAnalyticsPullRequest,
  windowStart: Date,
  windowEnd: Date,
): GitHubSprintActivityBadge[] {
  const badges: GitHubSprintActivityBadge[] = []

  const created = toDate(pr.createdAt)
  const merged = toDate(pr.mergedAt)
  const closed = toDate(pr.closedAt)
  const firstReview = toDate(pr.firstReviewSubmittedAt)

  if (created && created >= windowStart && created < windowEnd) {
    badges.push('opened')
  }

  if (firstReview && firstReview >= windowStart && firstReview < windowEnd) {
    badges.push('reviewed')
  } else if (pr.reviewCount > 0) {
    const lastReview = toDate(pr.lastReviewSubmittedAt)
    if (lastReview && lastReview >= windowStart && lastReview < windowEnd) {
      badges.push('reviewed')
    }
  }

  if (merged && merged >= windowStart && merged < windowEnd) {
    badges.push('merged')
  }

  if (closed && !merged && closed >= windowStart && closed < windowEnd) {
    badges.push('closed')
  }

  // Carry-over: PR was open at sprint start but not opened in this sprint
  if (created && created < windowStart) {
    const resolvedAt = merged ?? closed
    if (!resolvedAt || resolvedAt >= windowStart) {
      badges.push('carry-over')
    }
  }

  return badges
}

function prBelongsInSprint(
  pr: GitHubAnalyticsPullRequest,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  // Any lifecycle event in window
  if (isWithinRange(pr.createdAt, windowStart, windowEnd)) return true
  if (isWithinRange(pr.mergedAt, windowStart, windowEnd)) return true
  if (isWithinRange(pr.closedAt, windowStart, windowEnd)) return true
  if (isWithinRange(pr.firstReviewSubmittedAt, windowStart, windowEnd)) return true
  if (isWithinRange(pr.lastReviewSubmittedAt, windowStart, windowEnd)) return true

  // Open throughout the sprint (carry-over with no events in this window)
  const created = toDate(pr.createdAt)
  if (created && created < windowStart) {
    const resolvedAt = toDate(pr.mergedAt) ?? toDate(pr.closedAt)
    if (!resolvedAt || resolvedAt >= windowStart) return true
  }

  return false
}

function buildSprintPR(
  pr: GitHubAnalyticsPullRequest,
  repoMap: Map<string, string>,
  windowStart: Date,
  windowEnd: Date,
): GitHubSprintPR {
  return {
    id: pr.id,
    repoId: pr.repoId,
    repoName: repoMap.get(pr.repoId) ?? '',
    number: pr.number,
    title: pr.title,
    authorLogin: pr.authorLogin,
    htmlUrl: pr.htmlUrl,
    state: pr.state,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    cycleTimeHours: pr.mergedAt ? roundToSingleDecimal(hoursBetween(pr.createdAt, pr.mergedAt)) : null,
    firstReviewTimeHours: pr.firstReviewSubmittedAt ? roundToSingleDecimal(hoursBetween(pr.createdAt, pr.firstReviewSubmittedAt)) : null,
    badges: computeSprintBadges(pr, windowStart, windowEnd),
  }
}

function computeSprintDelta(
  current: GitHubSprintSummary,
  previous: GitHubSprintSummary | null,
): GitHubSprintDelta | null {
  if (!previous) return null

  const candidates: {metric: string; pctChange: number; value: string; label: string}[] = []

  if (previous.prsMerged > 0) {
    const pct = ((current.prsMerged - previous.prsMerged) / previous.prsMerged) * 100
    candidates.push({
      metric: 'prsMerged',
      pctChange: Math.abs(pct),
      value: `${Math.abs(Math.round(pct))}%`,
      label: `PRs merged ${pct >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(pct))}% vs previous sprint`,
    })
  }

  if (previous.medianCycleTimeHours !== null && current.medianCycleTimeHours !== null) {
    const diff = current.medianCycleTimeHours - previous.medianCycleTimeHours
    const diffDays = Math.abs(diff) / 24
    if (diffDays >= 0.1) {
      candidates.push({
        metric: 'cycleTime',
        pctChange: previous.medianCycleTimeHours > 0
          ? Math.abs(diff / previous.medianCycleTimeHours) * 100
          : 0,
        value: `${diffDays.toFixed(1)}d`,
        label: `Cycle time ${diff > 0 ? 'up' : 'down'} ${diffDays.toFixed(1)}d vs previous sprint`,
      })
    }
  }

  if (current.carryOverCount > 0) {
    candidates.push({
      metric: 'carryOver',
      pctChange: current.carryOverCount * 10,
      value: `${current.carryOverCount}`,
      label: `${current.carryOverCount} carry-over PR${current.carryOverCount === 1 ? '' : 's'} from last sprint`,
    })
  }

  if (candidates.length === 0) return null

  const best = candidates.sort((a, b) => b.pctChange - a.pctChange)[0]!
  return {
    metric: best.metric,
    direction: best.label.includes(' up ') ? 'up' : best.label.includes(' down ') ? 'down' : 'same',
    value: best.value,
    label: best.label,
  }
}

export function aggregateCommitSeries(
  rollups: GitHubCommitDailyRollup[],
  sprintWindows: GitHubSprintWindow[],
): GitHubCommitDataPoint[] {
  const byDate = new Map<string, number>()

  for (const rollup of rollups) {
    const existing = byDate.get(rollup.activityDate) ?? 0
    byDate.set(rollup.activityDate, existing + rollup.commitCount)
  }

  if (sprintWindows.length === 0) return []

  const oldest = sprintWindows[sprintWindows.length - 1]!
  const newest = sprintWindows[0]!
  const start = new Date(`${oldest.startDate}T00:00:00`)
  const end = new Date(`${newest.endDate}T23:59:59`)

  const totalDays = Math.ceil((end.getTime() - start.getTime()) / DAY_MS)
  const useWeekly = totalDays > 56

  if (useWeekly) {
    const weeklyPoints: GitHubCommitDataPoint[] = []
    let weekStart = new Date(start)
    while (weekStart < end) {
      const weekEnd = addDays(weekStart, 7)
      let count = 0
      for (let d = new Date(weekStart); d < weekEnd && d <= end; d = addDays(d, 1)) {
        const key = d.toISOString().split('T')[0]!
        count += byDate.get(key) ?? 0
      }
      weeklyPoints.push({date: weekStart.toISOString().split('T')[0]!, count})
      weekStart = weekEnd
    }
    return weeklyPoints
  }

  const dailyPoints: GitHubCommitDataPoint[] = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = d.toISOString().split('T')[0]!
    dailyPoints.push({date: key, count: byDate.get(key) ?? 0})
  }
  return dailyPoints
}

export function buildHistoricalTeamSnapshot(input: {
  analyticsPullRequests: GitHubAnalyticsPullRequest[]
  commitRollups: GitHubCommitDailyRollup[]
  projectMembers: {userId: string; displayName: string; githubLogin: string | null}[]
  repositories: GitHubRepository[]
  reviewEvents: GitHubReviewEvent[]
  settings: GitHubAnalyticsSettings
  sprintCount: number
}): GitHubHistoricalTeamSnapshot {
  const {analyticsPullRequests, commitRollups, projectMembers, repositories, reviewEvents, settings, sprintCount} = input

  const sprintWindows = deriveSprintWindows(settings, sprintCount)
  const commitSeries = aggregateCommitSeries(commitRollups, sprintWindows)
  const repoMap = new Map(repositories.map((r) => [r.id, r.name]))

  // Build member login map
  const memberLoginMap = new Map<string, {userId: string; displayName: string}>()
  for (const m of projectMembers) {
    const login = normalizeGithubLogin(m.githubLogin)
    if (login) memberLoginMap.set(login, {userId: m.userId, displayName: m.displayName})
  }

  // Collect unmapped contributors
  const allLogins = new Set<string>()
  for (const pr of analyticsPullRequests) {
    const login = normalizeGithubLogin(pr.authorLogin)
    if (login && !isBotLogin(login)) allLogins.add(login)
  }
  for (const ev of reviewEvents) {
    const login = normalizeGithubLogin(ev.actorLogin)
    if (login && !isBotLogin(login)) allLogins.add(login)
  }
  const unmappedContributors: GitHubIdentityCandidate[] = []
  for (const login of allLogins) {
    if (!memberLoginMap.has(login)) {
      unmappedContributors.push({githubLogin: login, lastSeenAt: null, prCount: 0, reviewCount: 0})
    }
  }

  // Build sprints
  const sprints: GitHubSprintSummary[] = []

  for (let i = 0; i < sprintWindows.length; i++) {
    const window = sprintWindows[i]!
    const windowStart = new Date(`${window.startDate}T00:00:00`)
    const windowEnd = new Date(`${window.endDate}T23:59:59.999`)

    // Filter PRs for this sprint
    const sprintPRs = analyticsPullRequests.filter((pr) => prBelongsInSprint(pr, windowStart, windowEnd))
    const mappedPRs = sprintPRs.map((pr) => buildSprintPR(pr, repoMap, windowStart, windowEnd))

    // Compute metrics
    const prsOpened = sprintPRs.filter((pr) => isWithinRange(pr.createdAt, windowStart, windowEnd)).length
    const prsMerged = sprintPRs.filter((pr) => isWithinRange(pr.mergedAt, windowStart, windowEnd)).length
    const carryOverCount = mappedPRs.filter((pr) => pr.badges.includes('carry-over')).length

    // Count reviews in this sprint window
    const sprintReviews = reviewEvents.filter((ev) => isWithinRange(ev.githubCreatedAt, windowStart, windowEnd))
    const reviewsSubmitted = sprintReviews.length

    // Cycle time for PRs merged in this window
    const cycleTimesHours = sprintPRs
      .filter((pr) => isWithinRange(pr.mergedAt, windowStart, windowEnd))
      .map((pr) => hoursBetween(pr.createdAt, pr.mergedAt!))
      .filter((h): h is number => h !== null)

    const firstReviewTimesHours = sprintPRs
      .filter((pr) => pr.firstReviewSubmittedAt !== null)
      .map((pr) => hoursBetween(pr.createdAt, pr.firstReviewSubmittedAt!))
      .filter((h): h is number => h !== null)

    // Contributor breakdowns
    const contributorMap = new Map<string, {prsMerged: number; reviewsSubmitted: number}>()

    for (const pr of sprintPRs) {
      const login = normalizeGithubLogin(pr.authorLogin)
      if (!login || isBotLogin(login)) continue
      if (isWithinRange(pr.mergedAt, windowStart, windowEnd)) {
        const entry = contributorMap.get(login) ?? {prsMerged: 0, reviewsSubmitted: 0}
        entry.prsMerged++
        contributorMap.set(login, entry)
      }
    }

    for (const ev of sprintReviews) {
      const login = normalizeGithubLogin(ev.actorLogin)
      if (!login || isBotLogin(login)) continue
      const entry = contributorMap.get(login) ?? {prsMerged: 0, reviewsSubmitted: 0}
      entry.reviewsSubmitted++
      contributorMap.set(login, entry)
    }

    const contributors: GitHubSprintContributor[] = Array.from(contributorMap.entries())
      .map(([login, stats]) => ({
        login,
        isUnmapped: !memberLoginMap.has(login),
        prsMerged: stats.prsMerged,
        reviewsSubmitted: stats.reviewsSubmitted,
      }))
      .sort((a, b) => (b.prsMerged + b.reviewsSubmitted) - (a.prsMerged + a.reviewsSubmitted))

    // Commit count for this sprint window
    const sprintCommits = commitRollups
      .filter((r) => r.activityDate >= window.startDate && r.activityDate <= window.endDate)
      .reduce((sum, r) => sum + r.commitCount, 0)

    const summary: GitHubSprintSummary = {
      window,
      commits: sprintCommits,
      prsOpened,
      prsMerged,
      reviewsSubmitted,
      medianCycleTimeHours: median(cycleTimesHours),
      medianFirstReviewTimeHours: median(firstReviewTimesHours),
      activeContributors: contributorMap.size,
      carryOverCount,
      delta: null,
      contributors,
      pullRequests: mappedPRs,
    }

    sprints.push(summary)
  }

  // Compute deltas (compare each sprint to the next older one)
  for (let i = 0; i < sprints.length - 1; i++) {
    sprints[i]!.delta = computeSprintDelta(sprints[i]!, sprints[i + 1]!)
  }
  // First tracked sprint (oldest)
  if (sprints.length > 0 && sprints[sprints.length - 1]!.delta === null) {
    // Leave null — the UI shows "First tracked sprint" for null delta
  }

  return {
    settings,
    sprintWindows,
    commitSeries,
    sprints,
    unmappedContributors,
  }
}
