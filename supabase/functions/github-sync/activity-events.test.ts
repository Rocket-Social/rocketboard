import { describe, expect, it } from 'vitest'

import {
  buildBackfillEventsForPullRequest,
  buildBackfillEventsForStoredPullRequest,
} from './activity-events'

describe('github-sync activity event backfill', () => {
  it('builds PR lifecycle and review events from fetched pull request data', () => {
    const events = buildBackfillEventsForPullRequest({
      pr: {
        closed_at: '2026-04-04T16:00:00Z',
        created_at: '2026-04-01T12:00:00Z',
        merged: true,
        merged_at: '2026-04-04T16:00:00Z',
        merged_by: {
          avatar_url: 'https://avatars.example.com/maintainer.png',
          login: 'maintainer',
        },
        number: 42,
        title: 'Fix board activity',
        user: {
          avatar_url: 'https://avatars.example.com/author.png',
          login: 'author',
        },
      },
      pullRequestId: 'pr-record-id',
      repoId: 'repo-id',
      repoName: 'rocketboard',
      reviews: [
        {
          state: 'APPROVED',
          submitted_at: '2026-04-03T10:00:00Z',
          user: {
            avatar_url: 'https://avatars.example.com/reviewer.png',
            login: 'reviewer',
          },
        },
        {
          state: 'COMMENTED',
          user: {
            login: 'missing-date',
          },
        },
      ],
    })

    expect(events).toHaveLength(3)
    expect(events.map((event) => event.event_type)).toEqual([
      'pr_opened',
      'pr_merged',
      'review_submitted',
    ])
    expect(events).not.toContainEqual(expect.objectContaining({ event_type: 'pr_closed' }))
    expect(events[0]).toMatchObject({
      actor_avatar_url: 'https://avatars.example.com/author.png',
      actor_login: 'author',
      github_created_at: '2026-04-01T12:00:00Z',
      payload: {
        pr_number: 42,
        pr_title: 'Fix board activity',
        repo_name: 'rocketboard',
        source: 'github-sync',
      },
      pull_request_id: 'pr-record-id',
      repo_id: 'repo-id',
    })
    expect(events[1]).toMatchObject({
      actor_login: 'maintainer',
      event_type: 'pr_merged',
      github_created_at: '2026-04-04T16:00:00Z',
    })
    expect(events[2]).toMatchObject({
      actor_login: 'reviewer',
      event_type: 'review_submitted',
      github_created_at: '2026-04-03T10:00:00Z',
      payload: {
        review_state: 'APPROVED',
      },
    })
  })

  it('builds closed events only for unmerged closed pull requests', () => {
    const events = buildBackfillEventsForPullRequest({
      pr: {
        closed_at: '2026-04-05T16:00:00Z',
        created_at: '2026-04-01T12:00:00Z',
        merged: false,
        merged_at: null,
        number: 43,
        title: 'Close without merge',
        user: {
          login: 'author',
        },
      },
      pullRequestId: 'closed-pr-record-id',
      repoId: 'repo-id',
      repoName: 'rocketboard',
      reviews: [],
    })

    expect(events.map((event) => event.event_type)).toEqual(['pr_opened', 'pr_closed'])
    expect(events[1]).toMatchObject({
      actor_login: 'author',
      github_created_at: '2026-04-05T16:00:00Z',
    })
  })

  it('builds lifecycle events from already stored pull request rows', () => {
    const events = buildBackfillEventsForStoredPullRequest({
      pr: {
        author_avatar_url: 'https://avatars.example.com/author.png',
        author_login: 'author',
        closed_at: '2026-04-04T16:00:00Z',
        created_at: '2026-04-01T12:00:00Z',
        id: 'stored-pr-id',
        merged_at: '2026-04-04T16:00:00Z',
        number: 99,
        title: 'Stored PR',
      },
      repoId: 'repo-id',
      repoName: 'rocketboard',
    })

    expect(events.map((event) => event.event_type)).toEqual(['pr_opened', 'pr_merged'])
    expect(events[0]).toMatchObject({
      actor_login: 'author',
      github_created_at: '2026-04-01T12:00:00Z',
      payload: {
        pr_number: 99,
        pr_title: 'Stored PR',
        repo_name: 'rocketboard',
      },
      pull_request_id: 'stored-pr-id',
      repo_id: 'repo-id',
    })
  })
})
