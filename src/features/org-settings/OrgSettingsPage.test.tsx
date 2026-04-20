// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {OrgSettingsPage} from './OrgSettingsPage'
import type {OrganizationEntitlements} from '../billing/entitlement.types'

const navigateMock = vi.fn()
const confirmMock = vi.fn().mockResolvedValue(false)

function buildEntitlements(overrides: Partial<OrganizationEntitlements> = {}): OrganizationEntitlements {
  return {
    adminGrantEndsAt: null,
    adminGrantPlan: null,
    billingPeriod: 'monthly',
    hasBillingCustomer: true,
    limits: {members: -1, projects: -1, storage_mb: -1, workspaces: -1},
    plan: 'pro',
    planStatus: 'active',
    planEndsAt: null,
    storageUsedBytes: 0,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <OrgSettingsPage/>
    </QueryClientProvider>,
  )
}

const state = {
  orgRouteQuery: {
    data: {
      id: 'org-1',
      name: 'Acme Inc',
      slug: 'acme-inc',
    },
    isPending: false,
  },
  search: {tab: 'members'},
  entitlementsQuery: {
    data: buildEntitlements(),
  },
  membersQuery: {
    data: {
      canManage: true,
      invitations: [] as Array<{
        createdAt: string
        email: string
        emailSentAt: string | null
        id: string
        role: string
      }>,
      members: [
        {
          createdAt: '2026-04-01T12:00:00.000Z',
          email: 'admin@acme.com',
          githubLogin: 'testuser',
          invitedByName: null,
          lastActiveAt: '2026-04-08T12:00:00.000Z',
          name: 'Test User',
          role: 'admin',
          seatStatus: 'paid',
          userId: 'user-1',
        },
        {
          createdAt: '2026-03-15T12:00:00.000Z',
          email: 'member@acme.com',
          githubLogin: null,
          invitedByName: 'Test User',
          lastActiveAt: '2026-03-20T12:00:00.000Z',
          name: 'Ava Stone',
          role: 'member',
          seatStatus: 'paid',
          userId: 'user-2',
        },
      ],
      organization: {
        allowedDomains: ['acme.com'],
        icon: '',
        id: 'org-1',
        inviteLinkEnabled: true,
        inviteLinkToken: 'token-123',
        name: 'Acme Inc',
        plan: 'pro',
        slug: 'acme-inc',
        timezone: 'America/Los_Angeles',
      },
    },
    isPending: false,
  },
  sessionQuery: {
    data: {
      status: 'authenticated' as const,
      user: {
        id: 'user-1',
        name: 'Test User',
      },
    },
  },
  workspaceSummariesQuery: {
    data: [],
  },
}

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({orgSlug: 'acme-inc'}),
    useSearch: () => state.search,
  }),
  useNavigate: () => navigateMock,
  useParams: () => ({orgSlug: 'acme-inc'}),
  useSearch: () => state.search,
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({toast: vi.fn()}),
}))

vi.mock('../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    confirmDialogProps: null,
  }),
}))

vi.mock('../auth/session.queries', () => ({
  useSessionQuery: () => state.sessionQuery,
}))

vi.mock('../projects/project-shell.queries', () => ({
  useWorkspaceSummariesQuery: () => state.workspaceSummariesQuery,
}))

vi.mock('../billing/entitlement.queries', () => ({
  useOrgEntitlementsQuery: () => state.entitlementsQuery,
  useOrgUsageQuery: () => ({
    data: null,
    isPending: false,
  }),
}))

vi.mock('./org-route.queries', () => ({
  useOrganizationRouteContextQuery: () => state.orgRouteQuery,
}))

vi.mock('./org-settings.queries', () => ({
  useCreateOrgInviteMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useOrgMembersQuery: () => state.membersQuery,
  useRemoveOrgMemberMutation: () => ({
    mutate: vi.fn(),
  }),
  useRevokeOrgInviteMutation: () => ({
    mutate: vi.fn(),
  }),
  useSetAllowedDomainsMutation: () => ({
    mutate: vi.fn(),
  }),
  useSetOrgMemberRoleMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useSetOrgTimezoneMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}))

describe('OrgSettingsPage Access tab', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T17:00:00.000Z'))
    navigateMock.mockReset()
    confirmMock.mockClear()
    state.orgRouteQuery.data = {
      id: 'org-1',
      name: 'Acme Inc',
      slug: 'acme-inc',
    }
    state.orgRouteQuery.isPending = false
    state.search = {tab: 'members'}
    state.entitlementsQuery.data = buildEntitlements()
    state.membersQuery.data.organization.plan = 'pro'
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders the stacked invite controls and access table columns', () => {
    renderPage()

    expect(screen.getByText('Invite by email')).toBeInTheDocument()
    expect(screen.getByText('Invite link')).toBeInTheDocument()
    expect(screen.getByText('Allowed domains')).toBeInTheDocument()

    expect(screen.getByRole('columnheader', {name: 'Name'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Email'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'User role'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Status'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Joined'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Invited by'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: 'Last active'})).toBeInTheDocument()
    expect(screen.getByRole('columnheader', {name: '2FA'})).toBeInTheDocument()

    expect(screen.getAllByText('Test User')).toHaveLength(2)
    expect(screen.getByText('(you)')).toBeInTheDocument()
    expect(screen.getByText('Ava Stone')).toBeInTheDocument()
    expect(screen.getByText('admin@acme.com')).toBeInTheDocument()
    expect(screen.getByText('member@acme.com')).toBeInTheDocument()
    expect(screen.getByText('Apr 1, 2026')).toBeInTheDocument()
    expect(screen.getByText('Mar 15, 2026')).toBeInTheDocument()
    expect(screen.getByText('Mar 20, 2026')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('acme.com')).toBeInTheDocument()

    expect(screen.getByRole('columnheader', {name: 'Name'})).toHaveClass('sticky')
    expect(screen.getByText('(you)').closest('td')).toHaveClass('sticky')
  })

  it('keeps the current user role control disabled and exposes actions for other members', () => {
    renderPage()

    const comboboxes = screen.getAllByRole('combobox')

    expect(comboboxes).toHaveLength(3)
    expect(comboboxes[1]).toBeDisabled()
    expect(comboboxes[2]).toBeEnabled()
    expect(screen.queryByRole('button', {name: 'Manage Test User'})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Manage Ava Stone'})).toBeInTheDocument()
  })

  it('shows the billing setup checklist item for free organizations', () => {
    state.search = {tab: 'overview'}
    state.entitlementsQuery.data = buildEntitlements({
      hasBillingCustomer: false,
      plan: 'free',
    })
    state.membersQuery.data.organization.plan = 'free'

    renderPage()

    expect(screen.getByRole('button', {name: 'Set up billing'})).toBeInTheDocument()
  })

  it('hides the billing setup checklist item once the organization is on Pro', () => {
    state.search = {tab: 'overview'}

    renderPage()

    expect(screen.queryByRole('button', {name: 'Set up billing'})).not.toBeInTheDocument()
  })
})
