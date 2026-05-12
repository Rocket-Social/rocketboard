// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../../test/queryClient'
import type {GitHubAppSetupStatus} from '../github.connect'
import {OrganizationGitHubSettings} from './OrganizationGitHubSettings'

const {
  initiateGitHubAppInstallMock,
  listAvailableGitHubReposMock,
  toastMock,
  state,
} = vi.hoisted(() => ({
  initiateGitHubAppInstallMock: vi.fn(),
  listAvailableGitHubReposMock: vi.fn().mockResolvedValue([]),
  state: {
    allowedRepos: [] as Array<{githubRepoId: number}>,
    identityCandidates: [] as Array<{
      githubLogin: string
      lastSeenAt: string | null
      prCount: number
      reviewCount: number
    }>,
    members: [] as Array<{githubLogin: string | null; name: string; userId: string}>,
    sources: [] as Array<{
      accountLogin: string
      authType: 'github_app' | 'pat'
      id: string
      lastValidatedAt: string | null
    }>,
    status: {
      can_manage: true,
      config: {
        installable: false,
        invalid_secrets: [],
        missing_secrets: ['GITHUB_APP_SLUG'],
        present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET'],
      },
      connected: false,
      derived: {
        callback_url: 'https://app.example.com/integrations/github/callback',
        homepage_url: 'https://app.example.com',
        setup_url: 'https://example.supabase.co/functions/v1/github-install',
        webhook_url: 'https://example.supabase.co/functions/v1/github-webhook',
      },
      installation: null,
      requirements: {
        events: ['pull_request', 'pull_request_review', 'issue_comment', 'pull_request_review_comment', 'push', 'installation'],
        permissions: ['Pull requests: Read', 'Issues: Read', 'Contents: Read', 'Metadata: Read'],
      },
    } as GitHubAppSetupStatus,
  },
  toastMock: vi.fn(),
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../../org-settings/org-settings.queries', () => ({
  useOrgMembersQuery: () => ({
    data: {members: state.members},
  }),
}))

vi.mock('../github.connect', () => ({
  disconnectGitHub: vi.fn(),
  initiateGitHubAppInstall: initiateGitHubAppInstallMock,
  listAvailableGitHubRepos: listAvailableGitHubReposMock,
  validateAndSaveGitHubToken: vi.fn(),
}))

vi.mock('../github.queries', () => ({
  organizationGitHubAppSetupStatusQueryOptions: (organizationId: string) => ({
    queryFn: () => Promise.resolve(state.status),
    queryKey: ['github-app-setup-status', organizationId],
  }),
  organizationGitHubIdentityCandidatesQueryOptions: (organizationId: string) => ({
    queryFn: () => Promise.resolve(state.identityCandidates),
    queryKey: ['github-identity-candidates', organizationId],
  }),
  organizationGitHubSourcesQueryOptions: (organizationId: string) => ({
    queryFn: () => Promise.resolve(state.sources),
    queryKey: ['github-org-sources', organizationId],
  }),
  sourceAllowedRepositoriesQueryOptions: (sourceId: string | null) => ({
    queryFn: () => Promise.resolve(sourceId ? state.allowedRepos : []),
    queryKey: ['github-source-allowed-repos', sourceId],
  }),
  useAllowRepositoryForSource: () => ({
    mutateAsync: vi.fn(),
  }),
  useRemoveAllowedRepositoryFromSource: () => ({
    mutateAsync: vi.fn(),
  }),
  useSetProfileGitHubLoginMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}))

function renderSettings(canManage = true) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      mutations: {retry: false},
      queries: {retry: false},
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationGitHubSettings canManage={canManage} orgId="org-1" />
    </QueryClientProvider>,
  )
}

describe('OrganizationGitHubSettings', () => {
  beforeEach(() => {
    initiateGitHubAppInstallMock.mockReset()
    initiateGitHubAppInstallMock.mockResolvedValue(undefined)
    listAvailableGitHubReposMock.mockReset()
    listAvailableGitHubReposMock.mockResolvedValue([])
    toastMock.mockReset()

    state.allowedRepos = []
    state.identityCandidates = []
    state.members = []
    state.sources = []
    state.status = {
      can_manage: true,
      config: {
        installable: false,
        invalid_secrets: [],
        missing_secrets: ['GITHUB_APP_SLUG'],
        present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET'],
      },
      connected: false,
      derived: {
        callback_url: 'https://app.example.com/integrations/github/callback',
        homepage_url: 'https://app.example.com',
        setup_url: 'https://example.supabase.co/functions/v1/github-install',
        webhook_url: 'https://example.supabase.co/functions/v1/github-webhook',
      },
      installation: null,
      requirements: {
        events: ['pull_request', 'pull_request_review', 'issue_comment', 'pull_request_review_comment', 'push', 'installation'],
        permissions: ['Pull requests: Read', 'Issues: Read', 'Contents: Read', 'Metadata: Read'],
      },
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('renders equal-weight PAT and GitHub App entry cards', async () => {
    renderSettings()

    expect(await screen.findByText('GitHub App setup assistant')).toBeInTheDocument()
    expect(screen.getAllByText('GitHub App').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', {name: /Organization PAT/i})).toBeInTheDocument()
  })

  it('switches to the PAT setup when the PAT method is selected', async () => {
    renderSettings()
    await screen.findByText('GitHub App setup assistant')

    fireEvent.click(screen.getByRole('button', {name: /Organization PAT/i}))

    expect(screen.getByText('Save PAT')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ghp_xxxxxxxxxxxx')).toBeInTheDocument()
  })

  it('shows inline GitHub App blocking guidance and disables install until config is ready', async () => {
    renderSettings()

    expect(await screen.findByText('GitHub App setup assistant')).toBeInTheDocument()
    expect(screen.getByText('GITHUB_APP_SLUG')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Install GitHub App'})).toBeDisabled()
  })

  it('renders an installed summary and points the user toward repo allowlisting', async () => {
    state.sources = [{
      accountLogin: 'lila',
      authType: 'github_app',
      id: 'source-1',
      lastValidatedAt: '2026-04-02T02:00:00.000Z',
    }]
    state.status = {
      ...state.status,
      config: {
        installable: true,
        invalid_secrets: [],
        missing_secrets: [],
        present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_SLUG', 'GITHUB_WEBHOOK_SECRET'],
      },
      connected: true,
      installation: {
        account_avatar_url: null,
        account_login: 'lila',
        account_type: 'Organization',
        created_at: '2026-04-02T01:00:00.000Z',
        events: ['pull_request', 'pull_request_review', 'issue_comment', 'pull_request_review_comment', 'push', 'installation'],
        id: 'source-1',
        installation_id: 42,
        permissions: {
          contents: 'read',
          issues: 'read',
          metadata: 'read',
          pull_requests: 'read',
        },
        updated_at: '2026-04-02T02:00:00.000Z',
      },
    }

    renderSettings()

    expect(await screen.findByText('Installed on lila. Next, choose which repositories Rocketboard should expose to projects below.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Go to repo allowlist'})).toBeInTheDocument()
    expect(screen.getByText('Repository Allowlist')).toBeInTheDocument()
  })

  it('warns when an existing GitHub App install is missing required comment webhook access', async () => {
    state.status = {
      ...state.status,
      config: {
        installable: true,
        invalid_secrets: [],
        missing_secrets: [],
        present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_SLUG', 'GITHUB_WEBHOOK_SECRET'],
      },
      connected: true,
      installation: {
        account_avatar_url: null,
        account_login: 'lila',
        account_type: 'Organization',
        created_at: '2026-04-02T01:00:00.000Z',
        events: ['pull_request', 'pull_request_review', 'push', 'installation'],
        id: 'source-1',
        installation_id: 42,
        permissions: {
          contents: 'read',
          metadata: 'read',
          pull_requests: 'read',
        },
        updated_at: '2026-04-02T02:00:00.000Z',
      },
    }

    renderSettings()

    expect(await screen.findByText('Update required')).toBeInTheDocument()
    expect(screen.getByText('GitHub App update required')).toBeInTheDocument()
    expect(screen.getAllByText('Issues: Read').length).toBeGreaterThan(0)
    expect(screen.getAllByText('issue_comment').length).toBeGreaterThan(0)
    expect(screen.getAllByText('pull_request_review_comment').length).toBeGreaterThan(0)
  })

  it('shows GitHub App install errors inline instead of relying on a toast', async () => {
    state.status = {
      ...state.status,
      config: {
        installable: true,
        invalid_secrets: [],
        missing_secrets: [],
        present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_SLUG', 'GITHUB_WEBHOOK_SECRET'],
      },
    }
    initiateGitHubAppInstallMock.mockRejectedValue(new Error('GitHub App install is not configured. Missing Supabase secrets: GITHUB_APP_SLUG.'))

    renderSettings()
    await screen.findByText('GitHub App setup assistant')
    await waitFor(() => {
      expect(screen.getByRole('button', {name: 'Install GitHub App'})).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', {name: 'Install GitHub App'}))

    await waitFor(() => {
      expect(screen.getByText('Install blocked')).toBeInTheDocument()
    })
    expect(initiateGitHubAppInstallMock).toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('shows invalid deployment secrets separately from missing ones', async () => {
    state.status = {
      ...state.status,
      config: {
        installable: false,
        invalid_secrets: ['GITHUB_APP_PRIVATE_KEY'],
        missing_secrets: [],
        present_secrets: ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_WEBHOOK_SECRET'],
      },
    }

    renderSettings()

    expect(await screen.findByText('Needs valid deployment config')).toBeInTheDocument()
    expect(screen.getByText('Fix the invalid Supabase deployment secrets, then run the configuration check again before installing into GitHub.')).toBeInTheDocument()
    expect(screen.getByText('Invalid secrets')).toBeInTheDocument()
    expect(screen.getAllByText('Invalid').length).toBeGreaterThan(0)
  })

  it('hides the setup assistant for non-admin users', () => {
    renderSettings(false)

    expect(screen.getByText('Only organization admins can manage shared GitHub credentials and the repo allowlist.')).toBeInTheDocument()
    expect(screen.queryByText('GitHub App setup assistant')).not.toBeInTheDocument()
  })
})
