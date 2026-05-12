import {describe, expect, it} from 'vitest'

import type {CardRecord, ProjectStatusOption} from '../cards/card.types'
import type {ProjectMember} from '../access/access.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import type {GitHubAnalyticsPullRequest, GitHubPullRequest, GitHubRepository, GitHubReviewEvent} from './github.types'
import {buildGitHubHealthSnapshot, buildGitHubTeamSnapshot} from './github.analytics'

const statusOptions: ProjectStatusOption[] = [
  {category: 'not_started', color: null, id: 'status-todo', isDefault: true, key: 'todo', label: 'To do', position: 0},
  {category: 'started', color: null, id: 'status-in-progress', isDefault: false, key: 'in_progress', label: 'In progress', position: 1},
  {category: 'completed', color: null, id: 'status-done', isDefault: false, key: 'done', label: 'Done', position: 2},
]

const projectMembers: ProjectMember[] = [
  {email: 'alice@example.com', githubLogin: 'alice', id: 'user-alice', name: 'Alice', role: 'member'},
  {email: 'bob@example.com', githubLogin: 'bob', id: 'user-bob', name: 'Bob', role: 'member'},
]

function createSprint(overrides: Partial<ProjectSprintRecord> = {}): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-03-01T00:00:00Z',
    endDate: '2026-03-24',
    goal: null,
    id: 'sprint-active',
    name: 'Sprint 12',
    position: 0,
    projectId: 'project-1',
    startDate: '2026-03-10',
    status: 'active',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function createCard(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Alice',
    assigneeUserId: 'user-alice',
    bodyJson: {} as CardRecord['bodyJson'],
    bodyMd: '',
    cardRef: 'RB-42',
    completedAt: null,
    createdAt: '2026-03-01T00:00:00Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectCardNumber: 42,
    projectId: 'project-1',
    projectKey: 'RB',
    sprintId: 'sprint-active',
    startAt: null,
    statusOptionId: 'status-in-progress',
    statusPosition: 0,
    tags: [],
    title: 'Ship GitHub board',
    ...overrides,
  }
}

function createPullRequest(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    additions: 10,
    approvalCount: 0,
    authorAvatarUrl: null,
    authorLogin: 'alice',
    baseRef: 'main',
    body: null,
    changedFiles: 2,
    commentCount: 0,
    changesRequestedCount: 0,
    checksStatus: null,
    closedAt: null,
    createdAt: '2026-03-12T12:00:00Z',
    deletions: 3,
    draft: false,
    firstReviewSubmittedAt: null,
    githubPrId: 1001,
    headRef: 'feature/rb-42',
    htmlUrl: 'https://github.com/acme/repo/pull/1',
    id: 'pr-1',
    lastReviewSubmittedAt: null,
    linkedCards: [],
    mergedAt: null,
    number: 1,
    repoId: 'repo-1',
    reviewCount: 0,
    reviewers: [],
    reviewState: null,
    state: 'open',
    syncedAt: '2026-03-12T12:00:00Z',
    title: 'Implement GitHub board',
    updatedAt: '2026-03-12T12:00:00Z',
    ...overrides,
  }
}

function createAnalyticsPullRequest(overrides: Partial<GitHubAnalyticsPullRequest> = {}): GitHubAnalyticsPullRequest {
  return {
    approvalCount: 0,
    authorLogin: 'alice',
    changesRequestedCount: 0,
    closedAt: null,
    createdAt: '2026-03-12T12:00:00Z',
    draft: false,
    firstReviewSubmittedAt: null,
    githubPrId: 1001,
    htmlUrl: 'https://github.com/acme/repo/pull/1',
    id: 'pr-1',
    lastReviewSubmittedAt: null,
    mergedAt: null,
    number: 1,
    repoId: 'repo-1',
    reviewCount: 0,
    reviewState: null,
    state: 'open',
    title: 'Implement GitHub board',
    updatedAt: '2026-03-12T12:00:00Z',
    ...overrides,
  }
}

function createReviewEvent(overrides: Partial<GitHubReviewEvent> = {}): GitHubReviewEvent {
  return {
    actorAvatarUrl: null,
    actorLogin: 'bob',
    githubCreatedAt: '2026-03-14T10:00:00Z',
    id: 'review-1',
    payload: {},
    pullRequestId: 'pr-1',
    repoId: 'repo-1',
    ...overrides,
  }
}

function createRepository(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return {
    colorIndex: 0,
    connectionSourceId: 'source-1',
    createdAt: '2026-02-01T00:00:00Z',
    defaultBranch: 'main',
    fullName: 'acme/repo',
    githubRepoId: 2001,
    historyBackfilledAt: '2026-03-01T00:00:00Z',
    id: 'repo-1',
    isPrivate: true,
    lastSyncedAt: '2026-03-31T12:00:00Z',
    name: 'repo',
    projectId: 'project-1',
    ...overrides,
  }
}

describe('buildGitHubTeamSnapshot', () => {
  it('returns an empty snapshot when there is no active sprint', () => {
    const snapshot = buildGitHubTeamSnapshot({
      allPullRequests: [],
      analyticsPullRequests: [],
      cards: [],
      now: new Date('2026-03-20T12:00:00Z'),
      projectMembers,
      projectSprints: [createSprint({id: 'planned-1', status: 'planned'})],
      reviewEvents: [],
      statusOptions,
    })

    expect(snapshot.activeSprint).toBeNull()
    expect(snapshot.members).toEqual([])
    expect(snapshot.unmappedContributors).toEqual([])
  })

  it('builds active-sprint member rows, stale work counts, and unmapped contributors', () => {
    const cards = [
      createCard({id: 'card-1', projectCardNumber: 42, statusOptionId: 'status-in-progress'}),
      createCard({id: 'card-2', projectCardNumber: 43, statusOptionId: 'status-done'}),
    ]

    const allPullRequests = [
      createPullRequest({
        id: 'pr-open-stale',
        linkedCards: [{id: 'card-1', linkType: 'manual', projectCardNumber: 42, title: 'Ship GitHub board'}],
        reviewState: 'review_requested',
        updatedAt: '2026-03-14T09:00:00Z',
      }),
      createPullRequest({
        closedAt: '2026-03-18T11:00:00Z',
        id: 'pr-merged',
        mergedAt: '2026-03-18T11:00:00Z',
        number: 2,
        state: 'merged',
        title: 'Polish GitHub board',
        updatedAt: '2026-03-18T11:00:00Z',
      }),
      createPullRequest({
        authorLogin: 'outsider',
        id: 'pr-outsider',
        number: 3,
        title: 'External contribution',
        updatedAt: '2026-03-19T09:00:00Z',
      }),
    ]

    const analyticsPullRequests = [
      createAnalyticsPullRequest({
        firstReviewSubmittedAt: '2026-03-14T10:00:00Z',
        id: 'pr-open-stale',
        reviewCount: 1,
        reviewState: 'review_requested',
        updatedAt: '2026-03-14T09:00:00Z',
      }),
      createAnalyticsPullRequest({
        closedAt: '2026-03-18T11:00:00Z',
        firstReviewSubmittedAt: '2026-03-16T12:00:00Z',
        id: 'pr-merged',
        mergedAt: '2026-03-18T11:00:00Z',
        number: 2,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        title: 'Polish GitHub board',
        updatedAt: '2026-03-18T11:00:00Z',
      }),
      createAnalyticsPullRequest({
        authorLogin: 'outsider',
        createdAt: '2026-03-13T15:00:00Z',
        id: 'pr-outsider',
        number: 3,
        title: 'External contribution',
        updatedAt: '2026-03-19T09:00:00Z',
      }),
      createAnalyticsPullRequest({
        authorLogin: 'alice',
        closedAt: '2026-02-28T12:00:00Z',
        createdAt: '2026-02-26T12:00:00Z',
        firstReviewSubmittedAt: '2026-02-27T12:00:00Z',
        id: 'baseline-cycle-a',
        mergedAt: '2026-02-28T12:00:00Z',
        number: 10,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        title: 'Baseline cycle A',
        updatedAt: '2026-02-28T12:00:00Z',
      }),
      createAnalyticsPullRequest({
        authorLogin: 'alice',
        closedAt: '2026-03-03T12:00:00Z',
        createdAt: '2026-03-01T12:00:00Z',
        firstReviewSubmittedAt: '2026-03-02T12:00:00Z',
        id: 'baseline-cycle-b',
        mergedAt: '2026-03-03T12:00:00Z',
        number: 11,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        title: 'Baseline cycle B',
        updatedAt: '2026-03-03T12:00:00Z',
      }),
      createAnalyticsPullRequest({
        authorLogin: 'alice',
        closedAt: '2026-03-07T12:00:00Z',
        createdAt: '2026-03-05T12:00:00Z',
        firstReviewSubmittedAt: '2026-03-06T12:00:00Z',
        id: 'baseline-cycle-c',
        mergedAt: '2026-03-07T12:00:00Z',
        number: 12,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        title: 'Baseline cycle C',
        updatedAt: '2026-03-07T12:00:00Z',
      }),
    ]

    const snapshot = buildGitHubTeamSnapshot({
      allPullRequests,
      analyticsPullRequests,
      cards,
      now: new Date('2026-03-20T12:00:00Z'),
      projectMembers,
      projectSprints: [createSprint()],
      reviewEvents: [createReviewEvent({pullRequestId: 'pr-open-stale'})],
      statusOptions,
    })

    expect(snapshot.activeSprint?.id).toBe('sprint-active')
    expect(snapshot.members.map((member) => member.memberId)).toEqual(['user-alice', 'user-bob'])
    expect(snapshot.members[0]).toMatchObject({
      assignedDoneCount: 1,
      assignedTotalCount: 2,
      inReviewCount: 1,
      mergedCount: 1,
      staleCount: 1,
      reviewsReceived: 1,
      wipCount: 1,
    })
    expect(snapshot.members[0]?.assignedCards[0]?.projectCardNumber).toBe(42)
    expect(snapshot.members[1]).toMatchObject({
      assignedTotalCount: 0,
      reviewsGiven: 1,
      staleCount: 0,
    })
    expect(snapshot.unmappedContributors.map((candidate) => candidate.githubLogin)).toEqual(['outsider'])
  })

  it('counts reviews received on older authored PRs that are still active during the sprint', () => {
    const olderOpenPullRequest = createPullRequest({
      createdAt: '2026-03-05T12:00:00Z',
      id: 'pr-older-open',
      number: 8,
      title: 'Carry older work into sprint',
      updatedAt: '2026-03-15T09:00:00Z',
    })

    const snapshot = buildGitHubTeamSnapshot({
      allPullRequests: [olderOpenPullRequest],
      analyticsPullRequests: [
        createAnalyticsPullRequest({
          createdAt: '2026-03-05T12:00:00Z',
          id: 'pr-older-open',
          number: 8,
          title: 'Carry older work into sprint',
          updatedAt: '2026-03-15T09:00:00Z',
        }),
      ],
      cards: [],
      now: new Date('2026-03-20T12:00:00Z'),
      projectMembers,
      projectSprints: [createSprint()],
      reviewEvents: [
        createReviewEvent({
          githubCreatedAt: '2026-03-14T11:00:00Z',
          id: 'review-older-open',
          pullRequestId: 'pr-older-open',
        }),
      ],
      statusOptions,
    })

    expect(snapshot.members.map((member) => member.memberId)).toContain('user-alice')
    expect(snapshot.members.find((member) => member.memberId === 'user-alice')?.reviewsReceived).toBe(1)
  })
})

describe('buildGitHubHealthSnapshot', () => {
  it('requires all attached repositories to finish history backfill', () => {
    const snapshot = buildGitHubHealthSnapshot({
      allPullRequests: [],
      analyticsPullRequests: [
        createAnalyticsPullRequest({
          closedAt: '2026-03-10T12:00:00Z',
          createdAt: '2026-03-01T12:00:00Z',
          firstReviewSubmittedAt: '2026-03-02T12:00:00Z',
          mergedAt: '2026-03-10T12:00:00Z',
          state: 'merged',
        }),
      ],
      now: new Date('2026-03-31T12:00:00Z'),
      projectMembers,
      repositories: [createRepository({historyBackfilledAt: null})],
    })

    expect(snapshot.isReady).toBe(false)
    expect(snapshot.readinessReason).toContain('Backfill in progress')
  })

  it('requires at least 14 days of PR history before enabling the dashboard', () => {
    const snapshot = buildGitHubHealthSnapshot({
      allPullRequests: [],
      analyticsPullRequests: [
        createAnalyticsPullRequest({
          closedAt: '2026-03-28T12:00:00Z',
          createdAt: '2026-03-25T12:00:00Z',
          firstReviewSubmittedAt: '2026-03-26T12:00:00Z',
          mergedAt: '2026-03-28T12:00:00Z',
          state: 'merged',
        }),
      ],
      now: new Date('2026-03-31T12:00:00Z'),
      projectMembers,
      repositories: [createRepository()],
    })

    expect(snapshot.isReady).toBe(false)
    expect(snapshot.readinessReason).toContain('14 days')
  })

  it('builds health metrics, supports stale work, and groups unmatched contributors', () => {
    const analyticsPullRequests = [
      createAnalyticsPullRequest({
        closedAt: '2026-03-05T12:00:00Z',
        createdAt: '2026-03-01T12:00:00Z',
        firstReviewSubmittedAt: '2026-03-02T00:00:00Z',
        id: 'current-alice-a',
        mergedAt: '2026-03-05T12:00:00Z',
        number: 21,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        updatedAt: '2026-03-05T12:00:00Z',
      }),
      createAnalyticsPullRequest({
        closedAt: '2026-03-12T18:00:00Z',
        createdAt: '2026-03-10T06:00:00Z',
        firstReviewSubmittedAt: '2026-03-11T06:00:00Z',
        id: 'current-alice-b',
        mergedAt: '2026-03-12T18:00:00Z',
        number: 22,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        updatedAt: '2026-03-12T18:00:00Z',
      }),
      createAnalyticsPullRequest({
        authorLogin: 'outsider',
        closedAt: '2026-03-20T12:00:00Z',
        createdAt: '2026-03-18T00:00:00Z',
        firstReviewSubmittedAt: '2026-03-19T12:00:00Z',
        id: 'current-outsider',
        mergedAt: '2026-03-20T12:00:00Z',
        number: 23,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        title: 'External merge',
        updatedAt: '2026-03-20T12:00:00Z',
      }),
      createAnalyticsPullRequest({
        authorLogin: 'bob',
        createdAt: '2026-03-20T12:00:00Z',
        id: 'current-bob-open',
        number: 24,
        title: 'Needs review',
        updatedAt: '2026-03-24T10:00:00Z',
      }),
      createAnalyticsPullRequest({
        closedAt: '2026-01-25T12:00:00Z',
        createdAt: '2026-01-20T12:00:00Z',
        firstReviewSubmittedAt: '2026-01-22T12:00:00Z',
        id: 'previous-alice',
        mergedAt: '2026-01-25T12:00:00Z',
        number: 25,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        updatedAt: '2026-01-25T12:00:00Z',
      }),
    ]

    const allPullRequests = [
      createPullRequest({
        closedAt: '2026-03-05T12:00:00Z',
        createdAt: '2026-03-01T12:00:00Z',
        firstReviewSubmittedAt: '2026-03-02T00:00:00Z',
        id: 'current-alice-a',
        mergedAt: '2026-03-05T12:00:00Z',
        number: 21,
        reviewCount: 1,
        reviewState: 'approved',
        state: 'merged',
        updatedAt: '2026-03-05T12:00:00Z',
      }),
      createPullRequest({
        authorLogin: 'bob',
        createdAt: '2026-03-20T12:00:00Z',
        id: 'current-bob-open',
        number: 24,
        title: 'Needs review',
        updatedAt: '2026-03-24T10:00:00Z',
      }),
    ]

    const snapshot = buildGitHubHealthSnapshot({
      allPullRequests,
      analyticsPullRequests,
      now: new Date('2026-03-31T12:00:00Z'),
      projectMembers,
      repositories: [createRepository()],
    })

    expect(snapshot.isReady).toBe(true)
    expect(snapshot.metrics.map((metric) => metric.key)).toEqual([
      'review_turnaround',
      'cycle_time',
      'stale_work',
      'throughput',
    ])

    const reviewMetric = snapshot.metrics.find((metric) => metric.key === 'review_turnaround')
    const staleMetric = snapshot.metrics.find((metric) => metric.key === 'stale_work')
    const throughputMetric = snapshot.metrics.find((metric) => metric.key === 'throughput')

    expect(reviewMetric?.isInsufficient).toBe(false)
    expect(reviewMetric?.detailRows.some((row) => row.label === 'Unmapped contributors')).toBe(true)
    expect(staleMetric?.currentValue).toBe(1)
    expect(throughputMetric?.sampleCount).toBe(3)
    expect(snapshot.unmappedContributors.map((candidate) => candidate.githubLogin)).toEqual(['outsider'])
  })
})
