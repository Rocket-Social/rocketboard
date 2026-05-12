/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubBoardPage } from './GitHubBoardPage'
import type { GitHubBoardConfig } from './github.types'

const {
  boardConfigState,
  githubRepositoryMock,
  jiraSyncMutationMock,
  toastMock,
} = vi.hoisted(() => {
  const boardConfigState: { value: GitHubBoardConfig } = {
    value: { repoMode: 'unconfigured', selectedRepoId: null },
  }
  const projectRepositories = [
    {
      colorIndex: 0,
      connectionSourceId: 'source-1',
      createdAt: '2026-04-02T00:00:00Z',
      defaultBranch: 'main',
      fullName: 'acme/repo-one',
      githubRepoId: 101,
      historyBackfilledAt: '2026-04-02T00:00:00Z',
      id: 'repo-1',
      isPrivate: true,
      lastSyncedAt: '2026-04-02T00:00:00Z',
      name: 'repo-one',
      projectId: 'project-1',
    },
  ]
  const projectSettings = {
    analyticsLastSprintEndDate: null,
    analyticsSprintLengthWeeks: null,
    analyticsTimezone: null,
    autoTransitionsEnabled: false,
    configuredBy: 'user-1',
    connectionSource: {
      accountAvatarUrl: null,
      accountLogin: 'acme',
      accountType: 'Organization',
      authType: 'github_app',
      createdAt: '2026-04-02T00:00:00Z',
      id: 'source-1',
      installationId: 101,
      installedBy: 'user-1',
      lastValidatedAt: '2026-04-02T00:00:00Z',
      organizationId: 'org-1',
      ownerUserId: null,
      scopeType: 'organization',
      status: 'active',
      updatedAt: '2026-04-02T00:00:00Z',
    },
    connectionSourceId: 'source-1',
    createdAt: '2026-04-02T00:00:00Z',
    projectId: 'project-1',
    updatedAt: '2026-04-02T00:00:00Z',
  }
  const githubRepositoryMock = {
    getCommitRollups: vi.fn(() => Promise.resolve([])),
    getGitHubBoardConfig: vi.fn(() =>
      Promise.resolve(boardConfigState.value),
    ),
    getProjectCards: vi.fn(() => Promise.resolve([])),
    getProjectGitHubAnalyticsPullRequests: vi.fn(() => Promise.resolve([])),
    getProjectGitHubReviewEvents: vi.fn(() => Promise.resolve([])),
    getProjectGitHubSettings: vi.fn(() => Promise.resolve(projectSettings)),
    getPullRequestsForProject: vi.fn(() => Promise.resolve([])),
    getRepositoriesForProject: vi.fn(() =>
      Promise.resolve(projectRepositories),
    ),
    setGitHubBoardConfig: vi.fn(
      async (_projectViewId: string, config: GitHubBoardConfig) => {
        boardConfigState.value = config
        return config
      },
    ),
    syncRepo: vi.fn(() => Promise.resolve({ linked: 0, synced: 0 })),
  }

  return {
    boardConfigState,
    githubRepositoryMock,
    jiraSyncMutationMock: vi.fn(() => Promise.resolve({
      contributors: 0,
      sourceId: 'jira-source-1',
      success: true,
      window: {from: '2026-04-01', to: '2026-05-01'},
    })),
    toastMock: vi.fn(),
  }
})

vi.mock('./github.repository', () => ({
  githubRepository: githubRepositoryMock,
}))

vi.mock('./github.realtime', () => ({
  useGitHubRealtime: vi.fn(),
}))

vi.mock('../jira/jira.queries', () => ({
  organizationJiraStatusQueryOptions: (organizationId: string) => ({
    queryFn: () => Promise.resolve({
      canManage: true,
      config: {
        configured: true,
        missingSecrets: [],
        redirectUri: 'https://example.test/functions/v1/jira-oauth',
        scopes: ['read:jira-work', 'read:jira-user', 'read:me', 'offline_access'],
      },
      sources: [],
    }),
    queryKey: ['jira-org-status', organizationId],
  }),
  projectJiraContributorStatsQueryOptions: (projectId: string) => ({
    queryFn: () => Promise.resolve([]),
    queryKey: ['jira-contributor-stats', projectId],
  }),
  projectJiraSettingsQueryOptions: (projectId: string) => ({
    queryFn: () => Promise.resolve(null),
    queryKey: ['jira-project-settings', projectId],
  }),
  useSetProjectJiraSource: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useSyncProjectJiraStats: () => ({
    isPending: false,
    mutateAsync: jiraSyncMutationMock,
  }),
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

beforeEach(() => {
  boardConfigState.value = { repoMode: 'unconfigured', selectedRepoId: null }
  toastMock.mockReset()
  for (const mock of Object.values(githubRepositoryMock)) {
    mock.mockClear()
  }
  jiraSyncMutationMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('GitHubBoardPage', () => {
  it('surfaces a blocking alert while the board is missing repo scope', async () => {
    renderBoard()

    const alert = await screen.findByRole('alert')

    expect(
      within(alert).getByText('GitHub board is blocked'),
    ).toBeInTheDocument()
    expect(alert).toHaveTextContent(
      'This board has attached project repos, but it still needs a repo scope',
    )
    expect(alert).toHaveTextContent(
      'Missing: choose All project repos or One repo for this board',
    )
    expect(githubRepositoryMock.getPullRequestsForProject).not.toHaveBeenCalled()
    expect(
      githubRepositoryMock.getProjectGitHubAnalyticsPullRequests,
    ).not.toHaveBeenCalled()
    expect(githubRepositoryMock.getCommitRollups).not.toHaveBeenCalled()
    expect(
      githubRepositoryMock.getProjectGitHubReviewEvents,
    ).not.toHaveBeenCalled()
  })

  it('opens the PR board after saving the missing repo scope', async () => {
    const user = userEvent.setup()
    renderBoard()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /All project repos/i }),
    )
    await user.click(screen.getByRole('button', { name: 'Save repo scope' }))

    await waitFor(() => {
      expect(githubRepositoryMock.setGitHubBoardConfig).toHaveBeenCalledWith(
        'view-1',
        { repoMode: 'all', selectedRepoId: null },
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    expect(screen.getAllByText('No PRs').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'PRs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument()
  })

  it('stays in Settings after later repo scope changes', async () => {
    const user = userEvent.setup()
    boardConfigState.value = { repoMode: 'all', selectedRepoId: null }
    renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(screen.getByText('GitHub Board Settings')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /One repo for this board/i }),
    )
    await user.selectOptions(screen.getByLabelText('Repository'), 'repo-1')
    await user.click(screen.getByRole('button', { name: 'Save repo scope' }))

    await waitFor(() => {
      expect(githubRepositoryMock.setGitHubBoardConfig).toHaveBeenCalledWith(
        'view-1',
        { repoMode: 'selected', selectedRepoId: 'repo-1' },
      )
    })

    expect(screen.getByText('GitHub Board Settings')).toBeInTheDocument()
    expect(screen.queryByText('No PRs')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Repo scope: acme\/repo-one/)).toBeInTheDocument()
    })
  })

  it('stays blocked when the saved config normalizes back to unconfigured', async () => {
    const user = userEvent.setup()
    githubRepositoryMock.setGitHubBoardConfig.mockResolvedValueOnce({
      repoMode: 'unconfigured',
      selectedRepoId: null,
    })
    renderBoard()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /All project repos/i }),
    )
    await user.click(screen.getByRole('button', { name: 'Save repo scope' }))

    await waitFor(() => {
      expect(githubRepositoryMock.setGitHubBoardConfig).toHaveBeenCalledWith(
        'view-1',
        { repoMode: 'all', selectedRepoId: null },
      )
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'GitHub board is blocked',
    )
    expect(screen.queryByText('No PRs')).not.toBeInTheDocument()
  })
})

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <GitHubBoardPage
        canEditProject
        canManageProject
        cards={[]}
        currentUserId="user-1"
        organizationId="org-1"
        organizationSlug="acme"
        projectId="project-1"
        projectMembers={[]}
        projectSprints={[]}
        projectViewId="view-1"
        statusOptions={[]}
      />
    </QueryClientProvider>,
  )

  return queryClient
}
