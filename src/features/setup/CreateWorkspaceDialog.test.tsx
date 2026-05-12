/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CreateWorkspaceDialog} from './CreateWorkspaceDialog'

const {
  addWorkspaceAccessSpy,
  getQueryDataMock,
  mutateAsyncSpy,
  toastSpy,
  useOrgMembersQueryMock,
} = vi.hoisted(() => ({
  addWorkspaceAccessSpy: vi.fn(),
  getQueryDataMock: vi.fn(),
  mutateAsyncSpy: vi.fn(),
  toastSpy: vi.fn(),
  useOrgMembersQueryMock: vi.fn(),
}))

const ROUTE = {
  orgSlug: 'rocketboard',
  projectSlug: 'product-ops-board',
  viewId: 'view-1',
  workspaceSlug: 'product-ops',
}

const WORKSPACE = {
  canManageWorkspace: true,
  colorToken: 'blue',
  defaultProjectSlug: 'product-ops-board',
  icon: 'P',
  id: 'workspace-1',
  name: 'Product Ops',
  organizationId: 'org-1',
  organizationName: 'Rocketboard',
  organizationSlug: 'rocketboard',
  projects: [],
  slug: 'product-ops',
  timezone: 'America/Los_Angeles',
}

const ORG_MEMBERS = [
  {
    createdAt: '2026-04-20T00:00:00Z',
    email: 'alex@example.com',
    githubLogin: 'alex',
    invitedByName: null,
    lastActiveAt: null,
    name: 'Alex Morgan',
    role: 'member',
    seatStatus: 'active',
    userId: 'user-2',
  },
  {
    createdAt: '2026-04-20T00:00:00Z',
    email: 'sam@example.com',
    githubLogin: 'sam',
    invitedByName: null,
    lastActiveAt: null,
    name: 'Sam Rivera',
    role: 'admin',
    seatStatus: 'active',
    userId: 'user-3',
  },
  {
    createdAt: '2026-04-20T00:00:00Z',
    email: 'casey@example.com',
    githubLogin: 'casey',
    invitedByName: null,
    lastActiveAt: null,
    name: 'Casey Guest',
    role: 'guest',
    seatStatus: 'active',
    userId: 'user-4',
  },
]

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: getQueryDataMock,
  }),
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({toast: toastSpy}),
}))

vi.mock('../access/access.repository', () => ({
  accessRepository: {
    addWorkspaceAccess: addWorkspaceAccessSpy,
  },
}))

vi.mock('../auth/session.queries', () => ({
  useSessionQuery: () => ({
    data: {
      status: 'authenticated',
      user: {
        id: 'user-1',
        name: 'Alex Carter',
      },
    },
  }),
}))

vi.mock('../org-settings/org-settings.queries', () => ({
  useOrgMembersQuery: useOrgMembersQueryMock,
}))

vi.mock('../projects/project-shell.queries', () => ({
  workspaceSummariesQueryOptions: () => ({queryKey: ['workspaces']}),
}))

vi.mock('./setup.queries', () => ({
  useCreateWorkspaceMutation: () => ({
    mutateAsync: mutateAsyncSpy,
  }),
}))

describe('CreateWorkspaceDialog', () => {
  beforeEach(() => {
    addWorkspaceAccessSpy.mockResolvedValue(undefined)
    getQueryDataMock.mockReturnValue([WORKSPACE])
    mutateAsyncSpy.mockResolvedValue(ROUTE)
    useOrgMembersQueryMock.mockReturnValue({
      data: {
        canManage: true,
        invitations: [],
        members: ORG_MEMBERS,
        organization: {
          allowedDomains: [],
          icon: 'R',
          id: 'org-1',
          inviteLinkEnabled: false,
          inviteLinkToken: 'token',
          name: 'Rocketboard',
          plan: 'pro',
          slug: 'rocketboard',
          timezone: 'America/Los_Angeles',
        },
      },
      isError: false,
      isPending: false,
    })
  })

  afterEach(() => {
    cleanup()
    addWorkspaceAccessSpy.mockReset()
    getQueryDataMock.mockReset()
    mutateAsyncSpy.mockReset()
    toastSpy.mockReset()
    useOrgMembersQueryMock.mockReset()
  })

  function renderDialog(
    onCreated = vi.fn(),
    overrides: Partial<Parameters<typeof CreateWorkspaceDialog>[0]> = {},
  ) {
    render(
      <CreateWorkspaceDialog
        canCreateWorkspace={true}
        isOpen
        onClose={vi.fn()}
        onCreated={onCreated}
        organizationId='org-1'
        {...overrides}
      />,
    )

    return {onCreated}
  }

  it('renders visibility and organization member picker fields instead of the starter project form', () => {
    renderDialog()

    expect(screen.getByText('Start a new workspace')).toBeInTheDocument()
    expect(
      screen.getByText('Rocketboard creates the workspace and its first board automatically. Choose who can see it, then optionally add organization members right away.'),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Product Ops')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Public workspace/})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Private workspace/})).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search organization members by name')).toBeInTheDocument()
    expect(screen.queryByText('Starter project')).not.toBeInTheDocument()
    expect(screen.queryByText('Invite teammates')).not.toBeInTheDocument()
  })

  it('submits the workspace visibility choice with the workspace name and organization id', async () => {
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Product Ops'), {
      target: {value: 'Product Ops'},
    })
    fireEvent.click(screen.getByRole('button', {name: /Private workspace/}))
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}))

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledWith({
        access: 'private',
        organizationId: 'org-1',
        workspaceName: 'Product Ops',
      })
    })
  })

  it('adds selected organization members after workspace creation succeeds', async () => {
    const {onCreated} = renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Product Ops'), {
      target: {value: 'Product Ops'},
    })
    fireEvent.change(screen.getByPlaceholderText('Search organization members by name'), {
      target: {value: 'Alex'},
    })
    fireEvent.click(screen.getByRole('button', {name: /Alex Morgan/i}))
    fireEvent.change(screen.getByPlaceholderText('Search organization members by name'), {
      target: {value: 'Sam'},
    })
    fireEvent.click(screen.getByRole('button', {name: /Sam Rivera/i}))
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}))

    await waitFor(() => {
      expect(addWorkspaceAccessSpy).toHaveBeenCalledTimes(2)
    })
    expect(addWorkspaceAccessSpy).toHaveBeenCalledWith({
      role: 'member',
      userId: 'user-2',
      workspaceId: 'workspace-1',
    })
    expect(addWorkspaceAccessSpy).toHaveBeenCalledWith({
      role: 'member',
      userId: 'user-3',
      workspaceId: 'workspace-1',
    })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(ROUTE)
    })
    expect(toastSpy).not.toHaveBeenCalled()
  })

  it('filters organization guests out of the member picker', () => {
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Search organization members by name'), {
      target: {value: 'Casey'},
    })

    expect(screen.queryByRole('button', {name: /Casey Guest/i})).not.toBeInTheDocument()
    expect(
      screen.getByText('No organization admins or members matched that name. Organization guests can be added later from Workspace Access with guest access.'),
    ).toBeInTheDocument()
  })

  it('warns when the workspace is created before member adds can resolve the new workspace id', async () => {
    getQueryDataMock.mockReturnValue([])
    const {onCreated} = renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Product Ops'), {
      target: {value: 'Product Ops'},
    })
    fireEvent.change(screen.getByPlaceholderText('Search organization members by name'), {
      target: {value: 'Alex'},
    })
    fireEvent.click(screen.getByRole('button', {name: /Alex Morgan/i}))
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}))

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith({
        description: 'We created the workspace, but could not add the selected organization members automatically. Open Workspace Access to add them there.',
        title: 'Workspace created',
      })
    })
    expect(addWorkspaceAccessSpy).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(ROUTE)
    })
  })

  it('keeps the submit button disabled while organization members are still being added', async () => {
    let resolveMemberAdd!: () => void
    addWorkspaceAccessSpy.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveMemberAdd = resolve
      }),
    )
    const {onCreated} = renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Product Ops'), {
      target: {value: 'Product Ops'},
    })
    fireEvent.change(screen.getByPlaceholderText('Search organization members by name'), {
      target: {value: 'Alex'},
    })
    fireEvent.click(screen.getByRole('button', {name: /Alex Morgan/i}))
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}))

    await waitFor(() => {
      expect(screen.getByRole('button', {name: 'Creating…'})).toBeDisabled()
    })
    expect(onCreated).not.toHaveBeenCalled()

    resolveMemberAdd()

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(ROUTE)
    })
  })

  it('blocks workspace creation when the user cannot create workspaces for the organization', () => {
    renderDialog(vi.fn(), {canCreateWorkspace: false})

    expect(
      screen.getByText('Only organization admins can create workspaces in this organization. Ask an organization admin to create the workspace or upgrade your organization role.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Create workspace'})).toBeDisabled()
  })
})
