import {describe, expect, it} from 'vitest'

import type {ProjectMember} from '../access/access.types'
import type {GitHubPullRequest} from './github.types'
import {
  ALL_STATS_CONTRIBUTORS,
  buildGitHubStatsSummary,
  buildGitHubStatsTeamRows,
  filterGitHubStatsPullRequests,
  getGitHubStatsContributors,
  getGitHubStatsTopPullRequests,
} from './github.stats'

const projectMembers: ProjectMember[] = [
  {
    email: 'alice@example.com',
    githubLogin: 'alice',
    id: 'user-alice',
    name: 'Alice',
    role: 'member',
  },
  {
    email: 'bob@example.com',
    githubLogin: null,
    id: 'user-bob',
    name: 'Bob',
    role: 'member',
  },
]

function createPullRequest(
  overrides: Partial<GitHubPullRequest> = {},
): GitHubPullRequest {
  return {
    additions: 10,
    approvalCount: 0,
    authorAvatarUrl: null,
    authorLogin: 'alice',
    baseRef: 'main',
    body: null,
    changedFiles: 2,
    commentCount: 3,
    changesRequestedCount: 0,
    checksStatus: null,
    closedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
    deletions: 4,
    draft: false,
    firstReviewSubmittedAt: null,
    githubPrId: 1001,
    headRef: 'feature/test',
    htmlUrl: 'https://github.com/acme/repo/pull/1',
    id: 'pr-1',
    lastReviewSubmittedAt: null,
    linkedCards: [],
    mergedAt: null,
    number: 1,
    repoId: 'repo-1',
    reviewCount: 0,
    reviewState: null,
    reviewers: [],
    state: 'open',
    syncedAt: '2026-04-01T00:00:00Z',
    title: 'First PR',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  }
}

describe('github stats helpers', () => {
  it('builds contributors from mapped members and unmapped PR authors', () => {
    const contributors = getGitHubStatsContributors({
      projectMembers,
      pullRequests: [
        createPullRequest(),
        createPullRequest({authorLogin: 'outsider', id: 'pr-2'}),
      ],
    })

    expect(contributors.map((contributor) => contributor.value)).toEqual([
      'alice',
      'outsider',
    ])
    expect(contributors[0]).toMatchObject({
      displayName: 'Alice',
      label: 'Alice (@alice)',
      memberId: 'user-alice',
    })
  })

  it('computes summary metrics for the selected contributor', () => {
    const pullRequests = [
      createPullRequest({
        closedAt: '2026-04-02T12:00:00Z',
        commentCount: 5,
      }),
      createPullRequest({
        additions: 30,
        authorLogin: 'alice',
        changedFiles: 4,
        commentCount: 1,
        deletions: 10,
        id: 'pr-2',
        mergedAt: '2026-04-03T00:00:00Z',
        number: 2,
      }),
      createPullRequest({
        authorLogin: 'outsider',
        id: 'pr-3',
        number: 3,
      }),
    ]

    const selected = filterGitHubStatsPullRequests(pullRequests, 'alice')
    expect(filterGitHubStatsPullRequests(pullRequests, ALL_STATS_CONTRIBUTORS))
      .toHaveLength(3)
    expect(buildGitHubStatsSummary(selected)).toEqual({
      averageCommentsPerPr: 3,
      averageDurationHours: 42,
      filesTouched: 6,
      netLines: 26,
      prsOpened: 2,
      totalAdditions: 40,
      totalDeletions: 14,
    })
  })

  it('sorts top PRs by churn and exposes unavailable Jira team fields', () => {
    const pullRequests = [
      createPullRequest({additions: 5, deletions: 5, number: 1}),
      createPullRequest({additions: 20, deletions: 1, id: 'pr-2', number: 2}),
      createPullRequest({additions: 9, deletions: 10, id: 'pr-3', number: 3}),
    ]
    const contributors = getGitHubStatsContributors({
      projectMembers,
      pullRequests,
    })

    expect(getGitHubStatsTopPullRequests(pullRequests).map((pr) => pr.number))
      .toEqual([2, 3, 1])
    expect(buildGitHubStatsTeamRows(contributors)).toEqual([
      {
        contributorId: '@alice',
        contributorName: 'Alice',
        loggedHours: null,
        reopenedBugs: null,
        resolvedBugs: null,
      },
    ])
  })

  it('uses synced Jira rows when team bug and worklog metrics are available', () => {
    expect(buildGitHubStatsTeamRows([], [
      {
        computedAt: '2026-05-01T00:00:00Z',
        connectionSourceId: 'source-1',
        contributorEmail: 'alice@example.com',
        contributorName: 'Alice',
        id: 'jira-stat-1',
        jiraAccountId: 'jira-alice',
        loggedSeconds: 5400,
        projectId: 'project-1',
        reopenedBugs: 2,
        resolvedBugs: 5,
        windowEndDate: '2026-05-01',
        windowStartDate: '2026-04-01',
      },
    ])).toEqual([
      {
        contributorId: 'alice@example.com',
        contributorName: 'Alice',
        loggedHours: 1.5,
        reopenedBugs: 2,
        resolvedBugs: 5,
      },
    ])
  })

  it('merges Jira metrics onto GitHub contributors without dropping PR-only contributors', () => {
    const contributors = getGitHubStatsContributors({
      projectMembers,
      pullRequests: [
        createPullRequest(),
        createPullRequest({authorLogin: 'outsider', id: 'pr-2'}),
      ],
    })

    expect(buildGitHubStatsTeamRows(contributors, [
      {
        computedAt: '2026-05-01T00:00:00Z',
        connectionSourceId: 'source-1',
        contributorEmail: 'alice@example.com',
        contributorName: 'Alice Jira',
        id: 'jira-stat-1',
        jiraAccountId: 'jira-alice',
        loggedSeconds: 7200,
        projectId: 'project-1',
        reopenedBugs: 1,
        resolvedBugs: 3,
        windowEndDate: '2026-05-01',
        windowStartDate: '2026-04-01',
      },
    ])).toEqual([
      {
        contributorId: '@alice',
        contributorName: 'Alice',
        loggedHours: 2,
        reopenedBugs: 1,
        resolvedBugs: 3,
      },
      {
        contributorId: '@outsider',
        contributorName: 'outsider',
        loggedHours: null,
        reopenedBugs: null,
        resolvedBugs: null,
      },
    ])
  })
})
