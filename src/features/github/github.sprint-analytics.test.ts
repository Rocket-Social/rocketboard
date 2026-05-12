import {describe, expect, it} from 'vitest'

import type {GitHubAnalyticsPullRequest, GitHubAnalyticsSettings, GitHubCommitDailyRollup, GitHubRepository, GitHubReviewEvent} from './github.types'
import {aggregateCommitSeries, buildHistoricalTeamSnapshot, deriveSprintWindows, getDefaultAnalyticsSettings, resolveAnalyticsSettings} from './github.analytics'

// ==========================================================================
// Helpers
// ==========================================================================

function makeSettings(overrides: Partial<GitHubAnalyticsSettings> = {}): GitHubAnalyticsSettings {
  return {
    sprintLengthWeeks: 2,
    lastSprintEndDate: '2026-03-28',
    timezone: 'America/Los_Angeles',
    ...overrides,
  }
}

function makePR(overrides: Partial<GitHubAnalyticsPullRequest> = {}): GitHubAnalyticsPullRequest {
  return {
    id: 'pr-1',
    repoId: 'repo-1',
    githubPrId: 100,
    number: 1,
    title: 'Test PR',
    state: 'merged',
    draft: false,
    authorLogin: 'alice',
    htmlUrl: 'https://github.com/test/repo/pull/1',
    createdAt: '2026-03-16T10:00:00Z',
    updatedAt: '2026-03-20T10:00:00Z',
    mergedAt: '2026-03-20T10:00:00Z',
    closedAt: null,
    reviewState: 'approved',
    firstReviewSubmittedAt: '2026-03-17T10:00:00Z',
    lastReviewSubmittedAt: '2026-03-17T10:00:00Z',
    reviewCount: 1,
    approvalCount: 1,
    changesRequestedCount: 0,
    ...overrides,
  }
}

function makeRollup(overrides: Partial<GitHubCommitDailyRollup> = {}): GitHubCommitDailyRollup {
  return {
    id: 'rollup-1',
    repoId: 'repo-1',
    activityDate: '2026-03-20',
    commitCount: 5,
    computedTimezone: 'UTC',
    ...overrides,
  }
}

function makeReviewEvent(overrides: Partial<GitHubReviewEvent> = {}): GitHubReviewEvent {
  return {
    id: 'ev-1',
    repoId: 'repo-1',
    actorLogin: 'bob',
    actorAvatarUrl: null,
    pullRequestId: 'pr-1',
    payload: {},
    githubCreatedAt: '2026-03-17T14:00:00Z',
    ...overrides,
  }
}

const repos: GitHubRepository[] = [{
  id: 'repo-1',
  projectId: 'project-1',
  connectionSourceId: 'src-1',
  githubRepoId: 12345,
  fullName: 'test/repo',
  name: 'repo',
  defaultBranch: 'main',
  isPrivate: false,
  colorIndex: 0,
  historyBackfilledAt: '2026-03-01T00:00:00Z',
  lastSyncedAt: '2026-03-28T00:00:00Z',
  createdAt: '2026-03-01T00:00:00Z',
}]

const members = [
  {userId: 'user-alice', displayName: 'Alice', githubLogin: 'alice'},
  {userId: 'user-bob', displayName: 'Bob', githubLogin: 'bob'},
]

// ==========================================================================
// getDefaultAnalyticsSettings
// ==========================================================================

describe('getDefaultAnalyticsSettings', () => {
  it('defaults to 2-week sprints', () => {
    const settings = getDefaultAnalyticsSettings()
    expect(settings.sprintLengthWeeks).toBe(2)
  })

  it('defaults to most recent Friday as last sprint end', () => {
    // Wednesday March 25, 2026
    const settings = getDefaultAnalyticsSettings(new Date('2026-03-25T12:00:00'))
    expect(settings.lastSprintEndDate).toBe('2026-03-20') // prev Friday
  })

  it('returns today if today is Friday', () => {
    // Friday March 27, 2026
    const settings = getDefaultAnalyticsSettings(new Date('2026-03-27T12:00:00'))
    expect(settings.lastSprintEndDate).toBe('2026-03-27')
  })

  it('returns yesterday if today is Saturday', () => {
    // Saturday March 28, 2026
    const settings = getDefaultAnalyticsSettings(new Date('2026-03-28T12:00:00'))
    expect(settings.lastSprintEndDate).toBe('2026-03-27')
  })
})

// ==========================================================================
// resolveAnalyticsSettings
// ==========================================================================

describe('resolveAnalyticsSettings', () => {
  it('uses defaults when projectSettings is null', () => {
    const result = resolveAnalyticsSettings(null)
    expect(result.sprintLengthWeeks).toBe(2)
  })

  it('uses saved values when available', () => {
    const result = resolveAnalyticsSettings({
      analyticsSprintLengthWeeks: 3,
      analyticsLastSprintEndDate: '2026-03-21',
      analyticsTimezone: 'Europe/Berlin',
    })
    expect(result.sprintLengthWeeks).toBe(3)
    expect(result.lastSprintEndDate).toBe('2026-03-21')
    expect(result.timezone).toBe('Europe/Berlin')
  })

  it('falls back to defaults for null fields', () => {
    const result = resolveAnalyticsSettings({
      analyticsSprintLengthWeeks: 4,
      analyticsLastSprintEndDate: null,
      analyticsTimezone: null,
    })
    expect(result.sprintLengthWeeks).toBe(4)
    expect(result.lastSprintEndDate).toBeTruthy() // defaults to a Friday
    expect(result.timezone).toBeTruthy() // defaults to browser TZ
  })
})

// ==========================================================================
// deriveSprintWindows
// ==========================================================================

describe('deriveSprintWindows', () => {
  it('returns empty array for count 0', () => {
    expect(deriveSprintWindows(makeSettings(), 0)).toEqual([])
  })

  it('returns single sprint for count 1', () => {
    const windows = deriveSprintWindows(makeSettings(), 1)
    expect(windows).toHaveLength(1)
    expect(windows[0]!.endDate).toBe('2026-03-28')
    expect(windows[0]!.startDate).toBe('2026-03-15')
  })

  it('derives 3 non-overlapping 2-week sprints', () => {
    const windows = deriveSprintWindows(makeSettings(), 3)
    expect(windows).toHaveLength(3)

    // Newest first
    expect(windows[0]!.endDate).toBe('2026-03-28')
    expect(windows[0]!.startDate).toBe('2026-03-15')

    expect(windows[1]!.endDate).toBe('2026-03-14')
    expect(windows[1]!.startDate).toBe('2026-03-01')

    expect(windows[2]!.endDate).toBe('2026-02-28')
    expect(windows[2]!.startDate).toBe('2026-02-15')
  })

  it('handles 1-week sprints', () => {
    const windows = deriveSprintWindows(makeSettings({sprintLengthWeeks: 1}), 2)
    expect(windows).toHaveLength(2)
    expect(windows[0]!.startDate).toBe('2026-03-22')
    expect(windows[0]!.endDate).toBe('2026-03-28')
    expect(windows[1]!.startDate).toBe('2026-03-15')
    expect(windows[1]!.endDate).toBe('2026-03-21')
  })

  it('handles 4-week sprints', () => {
    const windows = deriveSprintWindows(makeSettings({sprintLengthWeeks: 4}), 2)
    expect(windows).toHaveLength(2)
    // First sprint: 28 days back from Mar 28
    expect(windows[0]!.startDate).toBe('2026-03-01')
    expect(windows[0]!.endDate).toBe('2026-03-28')
  })

  it('generates labels with date range', () => {
    const windows = deriveSprintWindows(makeSettings(), 1)
    expect(windows[0]!.label).toContain('Sprint')
    expect(windows[0]!.label).toContain('–')
  })
})

// ==========================================================================
// aggregateCommitSeries
// ==========================================================================

describe('aggregateCommitSeries', () => {
  it('returns empty for no sprint windows', () => {
    expect(aggregateCommitSeries([], [])).toEqual([])
  })

  it('produces daily data points for short windows', () => {
    const windows = deriveSprintWindows(makeSettings(), 2) // 4 weeks = 28 days
    const rollups = [
      makeRollup({activityDate: '2026-03-20', commitCount: 5}),
      makeRollup({activityDate: '2026-03-21', commitCount: 3}),
    ]
    const series = aggregateCommitSeries(rollups, windows)
    expect(series.length).toBeGreaterThan(0)

    const mar20 = series.find((d) => d.date === '2026-03-20')
    expect(mar20?.count).toBe(5)

    const mar21 = series.find((d) => d.date === '2026-03-21')
    expect(mar21?.count).toBe(3)
  })

  it('fills missing dates with 0', () => {
    const windows = deriveSprintWindows(makeSettings(), 1) // 2 weeks
    const series = aggregateCommitSeries([], windows)
    expect(series.length).toBeGreaterThan(0)
    expect(series.every((d) => d.count === 0)).toBe(true)
  })

  it('aggregates across multiple repos', () => {
    const windows = deriveSprintWindows(makeSettings(), 1)
    const rollups = [
      makeRollup({repoId: 'repo-1', activityDate: '2026-03-20', commitCount: 5}),
      makeRollup({repoId: 'repo-2', activityDate: '2026-03-20', commitCount: 3}),
    ]
    const series = aggregateCommitSeries(rollups, windows)
    const mar20 = series.find((d) => d.date === '2026-03-20')
    expect(mar20?.count).toBe(8)
  })

  it('uses weekly buckets for windows > 56 days', () => {
    const windows = deriveSprintWindows(makeSettings(), 6) // 12 weeks = 84 days
    const series = aggregateCommitSeries([], windows)
    // Weekly buckets: ~12 points instead of ~84
    expect(series.length).toBeLessThan(20)
  })
})

// ==========================================================================
// buildHistoricalTeamSnapshot
// ==========================================================================

describe('buildHistoricalTeamSnapshot', () => {
  it('builds snapshot with basic PR data', () => {
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [makePR()],
      commitRollups: [makeRollup()],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [makeReviewEvent()],
      settings: makeSettings(),
      sprintCount: 3,
    })

    expect(snapshot.sprintWindows).toHaveLength(3)
    expect(snapshot.sprints).toHaveLength(3)
    expect(snapshot.settings.sprintLengthWeeks).toBe(2)
  })

  it('associates PR to sprint by created date', () => {
    const pr = makePR({createdAt: '2026-03-16T10:00:00Z', mergedAt: '2026-03-18T10:00:00Z'})
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [pr],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 3,
    })

    // Sprint 0 is Mar 15-28, PR created Mar 16 -> should be in sprint 0
    const sprint0 = snapshot.sprints[0]!
    expect(sprint0.pullRequests).toHaveLength(1)
    expect(sprint0.pullRequests[0]!.badges).toContain('opened')
    expect(sprint0.pullRequests[0]!.badges).toContain('merged')
  })

  it('shows carry-over PR spanning multiple sprints', () => {
    // PR created in sprint 2, merged in sprint 0
    const pr = makePR({
      createdAt: '2026-02-20T10:00:00Z',
      mergedAt: '2026-03-20T10:00:00Z',
      firstReviewSubmittedAt: '2026-03-05T10:00:00Z',
    })
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [pr],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 3,
    })

    // PR should appear in all 3 sprints
    expect(snapshot.sprints[0]!.pullRequests).toHaveLength(1) // merged here
    expect(snapshot.sprints[1]!.pullRequests).toHaveLength(1) // reviewed here + carry-over
    expect(snapshot.sprints[2]!.pullRequests).toHaveLength(1) // opened here

    // Check badges
    expect(snapshot.sprints[0]!.pullRequests[0]!.badges).toContain('merged')
    expect(snapshot.sprints[0]!.pullRequests[0]!.badges).toContain('carry-over')
    expect(snapshot.sprints[2]!.pullRequests[0]!.badges).toContain('opened')
  })

  it('computes PRs merged count correctly', () => {
    const prs = [
      makePR({id: 'pr-1', number: 1, mergedAt: '2026-03-18T10:00:00Z'}),
      makePR({id: 'pr-2', number: 2, mergedAt: '2026-03-20T10:00:00Z'}),
      makePR({id: 'pr-3', number: 3, mergedAt: null, state: 'open', closedAt: null}),
    ]
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: prs,
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 1,
    })

    expect(snapshot.sprints[0]!.prsMerged).toBe(2)
  })

  it('computes sprint delta comparing to previous sprint', () => {
    const prs = [
      makePR({id: 'pr-1', number: 1, createdAt: '2026-03-16T00:00:00Z', mergedAt: '2026-03-18T00:00:00Z'}),
      makePR({id: 'pr-2', number: 2, createdAt: '2026-03-16T00:00:00Z', mergedAt: '2026-03-20T00:00:00Z'}),
      // Previous sprint: only 1 PR
      makePR({id: 'pr-3', number: 3, createdAt: '2026-03-02T00:00:00Z', mergedAt: '2026-03-05T00:00:00Z'}),
    ]
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: prs,
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 2,
    })

    // Sprint 0 has 2 PRs merged, sprint 1 has 1 -> delta should show increase
    expect(snapshot.sprints[0]!.delta).not.toBeNull()
    expect(snapshot.sprints[0]!.delta!.label).toContain('PRs merged')
    expect(snapshot.sprints[0]!.delta!.direction).toBe('up')
  })

  it('shows null delta for the oldest sprint', () => {
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [makePR()],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 2,
    })

    // Oldest sprint (index 1) has no previous to compare
    expect(snapshot.sprints[1]!.delta).toBeNull()
  })

  it('identifies unmapped contributors', () => {
    const pr = makePR({authorLogin: 'charlie'}) // not in members
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [pr],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 1,
    })

    expect(snapshot.unmappedContributors).toHaveLength(1)
    expect(snapshot.unmappedContributors[0]!.githubLogin).toBe('charlie')
  })

  it('excludes bot accounts from contributors', () => {
    const pr = makePR({authorLogin: 'dependabot[bot]'})
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [pr],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 1,
    })

    expect(snapshot.unmappedContributors).toHaveLength(0)
    expect(snapshot.sprints[0]!.contributors).toHaveLength(0)
  })

  it('computes contributor breakdown with merged PRs and reviews', () => {
    const prs = [
      makePR({id: 'pr-1', authorLogin: 'alice', mergedAt: '2026-03-18T10:00:00Z'}),
      makePR({id: 'pr-2', authorLogin: 'bob', mergedAt: '2026-03-20T10:00:00Z'}),
    ]
    const reviews = [
      makeReviewEvent({actorLogin: 'bob', githubCreatedAt: '2026-03-17T10:00:00Z'}),
      makeReviewEvent({id: 'ev-2', actorLogin: 'bob', githubCreatedAt: '2026-03-19T10:00:00Z'}),
    ]
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: prs,
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: reviews,
      settings: makeSettings(),
      sprintCount: 1,
    })

    const contributors = snapshot.sprints[0]!.contributors
    const bob = contributors.find((c) => c.login === 'bob')
    expect(bob).toBeDefined()
    expect(bob!.prsMerged).toBe(1)
    expect(bob!.reviewsSubmitted).toBe(2)
  })

  it('handles empty data gracefully', () => {
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 3,
    })

    expect(snapshot.sprints).toHaveLength(3)
    snapshot.sprints.forEach((sprint) => {
      expect(sprint.prsMerged).toBe(0)
      expect(sprint.pullRequests).toHaveLength(0)
      expect(sprint.contributors).toHaveLength(0)
    })
  })

  it('computes cycle time for merged PRs', () => {
    // Created Mar 16, merged Mar 20 = 4 days = 96 hours
    const pr = makePR({createdAt: '2026-03-16T10:00:00Z', mergedAt: '2026-03-20T10:00:00Z'})
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [pr],
      commitRollups: [],
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 1,
    })

    expect(snapshot.sprints[0]!.medianCycleTimeHours).toBe(96)
    expect(snapshot.sprints[0]!.pullRequests[0]!.cycleTimeHours).toBe(96)
  })

  it('counts commits per sprint from rollups', () => {
    const rollups = [
      makeRollup({activityDate: '2026-03-16', commitCount: 3}),
      makeRollup({activityDate: '2026-03-20', commitCount: 7}),
      // Outside sprint window
      makeRollup({activityDate: '2026-03-05', commitCount: 100}),
    ]
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [],
      commitRollups: rollups,
      projectMembers: members,
      repositories: repos,
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 2,
    })

    // Sprint 0 (Mar 15-28): 3 + 7 = 10
    expect(snapshot.sprints[0]!.commits).toBe(10)
    // Sprint 1 (Mar 1-14): includes Mar 5 = 100
    expect(snapshot.sprints[1]!.commits).toBe(100)
  })

  it('validates sprint length bounds', () => {
    // count=0 should return no sprints
    const snapshot = buildHistoricalTeamSnapshot({
      analyticsPullRequests: [],
      commitRollups: [],
      projectMembers: [],
      repositories: [],
      reviewEvents: [],
      settings: makeSettings(),
      sprintCount: 0,
    })
    expect(snapshot.sprints).toHaveLength(0)
    expect(snapshot.sprintWindows).toHaveLength(0)
  })
})
