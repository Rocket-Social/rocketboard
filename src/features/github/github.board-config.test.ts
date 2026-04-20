import { describe, expect, it } from 'vitest'

import type { GitHubPullRequest, GitHubRepository } from './github.types'
import {
  buildGitHubBoardConfig,
  buildGitHubBoardSummary,
  getGitHubBoardRepositories,
  resolveGitHubBoardConfig,
} from './github.board-config'

function createRepository(
  overrides: Partial<GitHubRepository> = {},
): GitHubRepository {
  return {
    colorIndex: 0,
    connectionSourceId: 'source-1',
    createdAt: '2026-04-01T00:00:00Z',
    defaultBranch: 'main',
    fullName: 'acme/repo',
    githubRepoId: 1001,
    historyBackfilledAt: '2026-04-01T00:00:00Z',
    id: 'repo-1',
    isPrivate: true,
    lastSyncedAt: '2026-04-01T00:00:00Z',
    name: 'repo',
    projectId: 'project-1',
    ...overrides,
  }
}

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
    changesRequestedCount: 0,
    checksStatus: null,
    closedAt: null,
    createdAt: '2026-04-01T08:00:00Z',
    deletions: 2,
    draft: false,
    firstReviewSubmittedAt: null,
    githubPrId: 101,
    headRef: 'feature/test',
    htmlUrl: 'https://github.com/acme/repo/pull/101',
    id: 'pr-1',
    lastReviewSubmittedAt: null,
    linkedCards: [],
    mergedAt: null,
    number: 101,
    repoId: 'repo-1',
    reviewCount: 0,
    reviewState: null,
    reviewers: [],
    state: 'open',
    syncedAt: '2026-04-03T00:00:00Z',
    title: 'Test PR',
    updatedAt: '2026-04-03T00:00:00Z',
    ...overrides,
  }
}

describe('github board config helpers', () => {
  it('treats missing config as unconfigured', () => {
    expect(resolveGitHubBoardConfig(null)).toEqual({
      repoMode: 'unconfigured',
      selectedRepoId: null,
    })
  })

  it('normalizes repo mode and strips empty repo ids', () => {
    expect(
      resolveGitHubBoardConfig({
        repoMode: 'selected',
        selectedRepoId: '  ',
      }),
    ).toEqual({
      repoMode: 'unconfigured',
      selectedRepoId: null,
    })

    expect(
      buildGitHubBoardConfig({
        repoMode: 'selected',
        selectedRepoId: ' repo-2 ',
      }),
    ).toEqual({
      repoMode: 'selected',
      selectedRepoId: 'repo-2',
    })
  })

  it('filters repositories according to board config', () => {
    const repositories = [
      createRepository({ id: 'repo-1' }),
      createRepository({
        fullName: 'acme/repo-2',
        githubRepoId: 1002,
        id: 'repo-2',
        name: 'repo-2',
      }),
    ]

    expect(
      getGitHubBoardRepositories({
        config: { repoMode: 'all', selectedRepoId: null },
        repositories,
      }),
    ).toHaveLength(2)

    expect(
      getGitHubBoardRepositories({
        config: { repoMode: 'selected', selectedRepoId: 'repo-2' },
        repositories,
      }).map((repository) => repository.id),
    ).toEqual(['repo-2'])
  })

  it('builds a board summary from filtered pull requests', () => {
    const summary = buildGitHubBoardSummary({
      now: new Date('2026-04-10T12:00:00Z'),
      pullRequests: [
        createPullRequest({
          createdAt: '2026-04-08T09:00:00Z',
          firstReviewSubmittedAt: '2026-04-08T15:00:00Z',
          id: 'needs-review',
          reviewState: 'review_requested',
          updatedAt: '2026-04-09T12:00:00Z',
        }),
        createPullRequest({
          createdAt: '2026-04-03T09:00:00Z',
          firstReviewSubmittedAt: '2026-04-04T09:00:00Z',
          id: 'stale',
          updatedAt: '2026-04-05T09:00:00Z',
        }),
        createPullRequest({
          createdAt: '2026-04-07T10:00:00Z',
          firstReviewSubmittedAt: '2026-04-07T16:00:00Z',
          id: 'merged',
          mergedAt: '2026-04-09T18:00:00Z',
          state: 'merged',
          updatedAt: '2026-04-09T18:00:00Z',
        }),
      ],
    })

    expect(summary).toEqual({
      avgReviewHours: 12,
      mergedThisWeek: 1,
      needsReviewCount: 1,
      openCount: 2,
      staleCount: 1,
    })
  })
})
