/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ActivityFeedView} from './ActivityFeedView'
import type {GitHubEvent} from '../github.types'

const {githubRepositoryMock} = vi.hoisted(() => ({
  githubRepositoryMock: {
    getEventsForProject: vi.fn(),
  },
}))

vi.mock('../github.repository', () => ({
  githubRepository: githubRepositoryMock,
}))

beforeEach(() => {
  githubRepositoryMock.getEventsForProject.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('ActivityFeedView', () => {
  it('renders GitHub activity as a linked table with time, contributor, action, and details', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    githubRepositoryMock.getEventsForProject.mockResolvedValue([
      buildEvent({
        actorLogin: 'alice',
        eventType: 'review_submitted',
        githubCreatedAt: oneHourAgo,
        payload: {
          pr_number: 42,
          pr_title: 'Fix activity table',
          repo_name: 'rocketboard',
          review_state: 'APPROVED',
        },
        pullRequestHtmlUrl: 'https://github.com/acme/rocketboard/pull/42',
      }),
    ])

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityFeedView projectId="project-1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('columnheader', {name: 'Time'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Contributor'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Action'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Details'})).toBeInTheDocument()
    expect(screen.getByText('1h')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Approved PR')).toBeInTheDocument()
    expect(screen.getByText(/Fix activity table/)).toBeInTheDocument()
    expect(screen.getByText(/rocketboard/)).toBeInTheDocument()
    expect(screen.getByRole('link', {name: /PR #42/})).toHaveAttribute(
      'href',
      'https://github.com/acme/rocketboard/pull/42',
    )
  })

  it('derives PR links from safe repo fields instead of rendering non-GitHub stored URLs', async () => {
    githubRepositoryMock.getEventsForProject.mockResolvedValue([
      buildEvent({
        eventType: 'pr_opened',
        payload: {
          pr_number: 42,
          pr_title: 'Validate activity links',
          repo_name: 'rocketboard',
        },
        pullRequestHtmlUrl: 'https://evil.example/acme/rocketboard/pull/42',
        repoFullName: 'acme/rocketboard',
      }),
    ])

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityFeedView projectId="project-1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('link', {name: /PR #42/})).toHaveAttribute(
      'href',
      'https://github.com/acme/rocketboard/pull/42',
    )
  })

  it('renders unlinked PR text when stored URL and repo full name are unsafe', async () => {
    githubRepositoryMock.getEventsForProject.mockResolvedValue([
      buildEvent({
        eventType: 'pr_opened',
        payload: {
          pr_number: 42,
          pr_title: 'Validate activity links',
          repo_name: 'rocketboard',
        },
        pullRequestHtmlUrl: 'javascript:alert(1)',
        repoFullName: 'acme/rocketboard/extra',
      }),
    ])

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityFeedView projectId="project-1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('PR #42')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: /PR #42/})).not.toBeInTheDocument()
  })

  it('falls back to one commit for malformed push counts', async () => {
    githubRepositoryMock.getEventsForProject.mockResolvedValue([
      buildEvent({
        eventType: 'push',
        payload: {
          branch: 'feature/activity',
          commit_count: 'not-a-number',
          repo_name: 'rocketboard',
        },
        pullRequestId: null,
      }),
    ])

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityFeedView projectId="project-1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Pushed Commit')).toBeInTheDocument()
    expect(screen.getByText(/1 commit to feature\/activity/)).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })
})

function buildEvent(overrides: Partial<GitHubEvent> = {}): GitHubEvent {
  return {
    actorAvatarUrl: null,
    actorLogin: null,
    createdAt: '2026-05-02T19:00:00Z',
    eventType: 'pr_opened',
    githubCreatedAt: '2026-05-02T19:00:00Z',
    id: 'event-1',
    payload: {},
    pullRequestHtmlUrl: null,
    pullRequestId: 'pr-1',
    pullRequestNumber: 42,
    pullRequestTitle: 'Fix activity table',
    repoFullName: 'acme/rocketboard',
    repoId: 'repo-1',
    ...overrides,
  }
}
