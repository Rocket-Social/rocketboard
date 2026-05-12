// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen, within} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {OrgSettingsPage} from './OrgSettingsPage'
import type {OrganizationEntitlements} from '../billing/entitlement.types'
import type {OrgMember} from './org-settings.types'

const navigateMock = vi.fn()
const confirmMock = vi.fn().mockResolvedValue(false)

function buildEntitlements(overrides: Partial<OrganizationEntitlements> = {}): OrganizationEntitlements {
  return {
    adminGrantEndsAt: null,
    adminGrantPlan: null,
    adminGrantStartsAt: null,
    billingPeriod: 'monthly',
    hasBillingCustomer: true,
    limits: {members: -1, projects: -1, storage_mb: -1, workspaces: -1},
    plan: 'pro',
    planStatus: 'active',
    planEndsAt: null,
    storageUsedBytes: 0,
    vipCanceledSubscriptionId: null,
    vipCancellationManaged: false,
    ...overrides,
  }
}

function buildMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    createdAt: '2026-03-15T12:00:00.000Z',
    email: 'member@acme.com',
    githubLogin: null,
    invitedByName: 'Test User',
    lastActiveAt: '2026-03-20T12:00:00.000Z',
    name: 'Ava Stone',
    role: 'member',
    seatStatus: 'paid',
    userId: 'user-2',
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
  search: {tab: 'members'} as {invoiceHistory?: '1'; tab: string},
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
        buildMember({
          createdAt: '2026-04-01T12:00:00.000Z',
          email: 'admin@acme.com',
          githubLogin: 'testuser',
          invitedByName: null,
          lastActiveAt: '2026-04-08T12:00:00.000Z',
          name: 'Test User',
          role: 'admin',
          userId: 'user-1',
        }),
        buildMember(),
      ],
      organization: {
        aiWorkspaceGuidance: null as string | null,
        allowedDomains: ['acme.com'],
        driftWatcherEnabled: false,
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
  inviteRequestsQuery: {
    data: [] as Array<{
      createdAt: string
      declineReason: string | null
      email: string
      expiresAt: string
      id: string
      requestedByEmail: string | null
      requestedByName: string
      requestedByUserId: string
      requestedRole: string
      status: string
    }>,
    isPending: false,
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

vi.mock('./BillingTab', () => ({
  BillingTab: () => <div>Billing Tab</div>,
}))

vi.mock('./InvoicesTab', () => ({
  InvoicesTab: () => <div>Invoices Tab</div>,
}))

vi.mock('./org-settings.queries', () => ({
  useApproveOrgInviteRequestMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useCreateOrgInviteMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useCreateOrgInviteRequestMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useDeclineOrgInviteRequestMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useInviteRequestsQuery: () => state.inviteRequestsQuery,
  useOrgMembersQuery: () => state.membersQuery,
  useRemoveOrgMemberMutation: () => ({
    mutate: vi.fn(),
  }),
  useRevokeOrgInviteMutation: () => ({
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
  useSetOrgAiSettingsMutation: () => ({
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
    state.membersQuery.data.members = [
      buildMember({
        createdAt: '2026-04-01T12:00:00.000Z',
        email: 'admin@acme.com',
        githubLogin: 'testuser',
        invitedByName: null,
        lastActiveAt: '2026-04-08T12:00:00.000Z',
        name: 'Test User',
        role: 'admin',
        userId: 'user-1',
      }),
      buildMember(),
    ]
    state.membersQuery.data.organization.plan = 'pro'
    state.membersQuery.data.organization.driftWatcherEnabled = false
    state.membersQuery.data.organization.aiWorkspaceGuidance = null
    state.membersQuery.data.canManage = true
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders the stacked invite controls and access table columns', () => {
    renderPage()

    expect(screen.getByText('Invites')).toBeInTheDocument()
    expect(screen.getByText('Invite link')).toBeInTheDocument()
    expect(screen.queryByText('Allowed domains')).not.toBeInTheDocument()

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

  it('shows the scheduled VIP chip in the settings header for admins', () => {
    state.search = {tab: 'overview'}
    state.entitlementsQuery.data = buildEntitlements({
      adminGrantPlan: 'pro',
      adminGrantStartsAt: new Date('2026-05-05T12:00:00.000Z').getTime(),
      plan: 'pro',
      planEndsAt: new Date('2026-05-05T12:00:00.000Z').getTime(),
      planStatus: 'canceled',
    })

    renderPage()

    expect(screen.getByText(/VIP starts/)).toBeInTheDocument()
  })

  it('shows the VIP on hold chip when a scheduled grant is blocked by an active paid term', () => {
    state.search = {tab: 'overview'}
    state.entitlementsQuery.data = buildEntitlements({
      adminGrantPlan: 'pro',
      adminGrantStartsAt: new Date('2026-05-05T12:00:00.000Z').getTime(),
      plan: 'pro',
      planEndsAt: null,
      planStatus: 'active',
    })

    renderPage()

    expect(screen.getByText('VIP On Hold')).toBeInTheDocument()
  })

  it('counts only non-guests in the overview Members card and setup checklist', () => {
    state.search = {tab: 'overview'}
    state.entitlementsQuery.data = buildEntitlements({
      hasBillingCustomer: false,
      plan: 'free',
    })
    state.membersQuery.data.organization.plan = 'free'
    state.membersQuery.data.members = [
      buildMember({
        createdAt: '2026-04-01T12:00:00.000Z',
        email: 'admin@acme.com',
        githubLogin: 'testuser',
        invitedByName: null,
        lastActiveAt: '2026-04-08T12:00:00.000Z',
        name: 'Test User',
        role: 'admin',
        userId: 'user-1',
      }),
      buildMember(),
      buildMember({
        email: 'guest-1@acme.com',
        name: 'Guest One',
        role: 'guest',
        seatStatus: 'free',
        userId: 'user-3',
      }),
      buildMember({
        email: 'guest-2@acme.com',
        name: 'Guest Two',
        role: 'guest',
        seatStatus: 'free',
        userId: 'user-4',
      }),
    ]

    renderPage()

    const membersCard = screen.getByText('Members').closest('div')
    expect(membersCard).not.toBeNull()
    expect(within(membersCard!).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Get started')).toBeInTheDocument()
  })

  it('keeps the access tab header as a people count, including guests', () => {
    state.search = {tab: 'members'}
    state.membersQuery.data.members = [
      buildMember({
        createdAt: '2026-04-01T12:00:00.000Z',
        email: 'admin@acme.com',
        githubLogin: 'testuser',
        invitedByName: null,
        lastActiveAt: '2026-04-08T12:00:00.000Z',
        name: 'Test User',
        role: 'admin',
        userId: 'user-1',
      }),
      buildMember(),
      buildMember({
        email: 'guest-1@acme.com',
        name: 'Guest One',
        role: 'guest',
        seatStatus: 'free',
        userId: 'user-3',
      }),
      buildMember({
        email: 'guest-2@acme.com',
        name: 'Guest Two',
        role: 'guest',
        seatStatus: 'free',
        userId: 'user-4',
      }),
    ]

    renderPage()

    expect(screen.getByText('People with access (4)')).toBeInTheDocument()
  })

  it('renders the AI agents toggle and guidance prefilled from the snapshot', () => {
    state.search = {tab: 'overview'}
    state.membersQuery.data!.organization.driftWatcherEnabled = true
    state.membersQuery.data!.organization.aiWorkspaceGuidance = 'We ship daily.'

    renderPage()

    const driftToggle = screen.getByRole('checkbox', {name: /Watch for quality drift/i})
    expect(driftToggle).toBeChecked()

    const guidance = screen.getByLabelText('Workspace agent guidance') as HTMLTextAreaElement
    expect(guidance.value).toBe('We ship daily.')

    // Save button is gated until the form is dirty.
    const saveButton = screen.getByRole('button', {name: /Save AI settings/i}) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
  })

  it('shows a read-only AI agents summary for non-admins', () => {
    state.search = {tab: 'overview'}
    state.membersQuery.data!.canManage = false
    state.membersQuery.data!.organization.driftWatcherEnabled = true

    renderPage()

    expect(screen.getByText('Drift Watcher: On')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', {name: /Watch for quality drift/i})).not.toBeInTheDocument()
  })

  it('hides billing tabs once VIP is active and shows the overview notice', () => {
    state.search = {tab: 'overview'}
    state.entitlementsQuery.data = buildEntitlements({
      adminGrantPlan: 'pro',
      plan: 'free',
      planStatus: 'canceled',
    })

    renderPage()

    expect(screen.queryByRole('button', {name: 'Billing'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Invoices'})).not.toBeInTheDocument()
    expect(screen.getByText('VIP is now active.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'View billing records'})).toBeInTheDocument()
  })

  it('allows admins to open invoice history from the hidden invoices route', () => {
    state.search = {invoiceHistory: '1', tab: 'invoices'}
    state.entitlementsQuery.data = buildEntitlements({
      adminGrantPlan: 'pro',
      plan: 'free',
      planStatus: 'canceled',
    })

    renderPage()

    expect(screen.getByText('Invoices Tab')).toBeInTheDocument()
  })
})
