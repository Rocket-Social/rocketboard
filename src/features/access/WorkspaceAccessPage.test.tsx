/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {WorkspaceAccessRouteContext, WorkspaceAccessSnapshot} from './access.types'
import {WorkspaceAccessPage} from './WorkspaceAccessPage'

const addWorkspaceAccessMutate = vi.fn()
const confirmMock = vi.fn(() => Promise.resolve(false))
const createWorkspaceInviteMutate = vi.fn()
const navigateMock = vi.fn()
const toastMock = vi.fn()

const defaultRouteContext = {
  canAccessWorkspace: true,
  canManageWorkspace: true,
  organizationId: 'org-1',
  organizationName: 'Rocketboard',
  organizationSlug: 'rocketboard',
  workspaceAccess: 'open' as const,
  workspaceId: 'workspace-1',
  workspaceName: 'Executive Team',
  workspaceSlug: 'executive-team',
}

const defaultSnapshot = {
  canEditWorkspace: true,
  canManageWorkspace: true,
  collaborators: [],
  currentOrgRole: 'admin' as const,
  directAccess: [
    {
      canEdit: true,
      canManage: false,
      effectiveRole: 'member' as const,
      email: 'alex@example.com',
      githubLogin: null,
      id: 'user-2',
      name: 'Alex Lane',
      orgRole: 'member' as const,
      scopeRole: 'member' as const,
    },
  ],
  pendingInvites: [],
  workspaceAccess: 'open' as const,
}

const routeContextState: {
  data: WorkspaceAccessRouteContext | null
  isPending: boolean
} = {
  data: defaultRouteContext,
  isPending: false,
}

const snapshotState: {
  data: WorkspaceAccessSnapshot | undefined
  isPending: boolean
} = {
  data: defaultSnapshot,
  isPending: false,
}

const searchResultsState: {
  data: Array<{email: string; name: string; orgRole: 'admin' | 'member' | 'guest'; userId: string}>
  isLoading: boolean
} = {
  data: [],
  isLoading: false,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({
    orgSlug: 'rocketboard',
    workspaceSlug: 'executive-team',
  }),
}))

vi.mock('../auth/session.queries', () => ({
  useSessionQuery: () => ({
    data: {
      status: 'authenticated',
      user: {id: 'user-1', name: 'Morgan Lee'},
    },
  }),
}))

vi.mock('./access.queries', () => ({
  useAddWorkspaceAccessMutation: () => ({mutate: addWorkspaceAccessMutate}),
  useCreateWorkspaceInviteMutation: () => ({isPending: false, mutate: createWorkspaceInviteMutate}),
  useRemoveWorkspaceAccessMutation: () => ({mutate: vi.fn()}),
  useSearchWorkspaceMembersQuery: () => searchResultsState,
  useSetWorkspaceAccessRoleMutation: () => ({mutate: vi.fn()}),
  useSetWorkspaceVisibilityMutation: () => ({mutate: vi.fn()}),
  useWorkspaceAccessProjectsQuery: () => ({data: [], isPending: false}),
  useWorkspaceAccessQuery: () => snapshotState,
  useWorkspaceAccessRouteContextQuery: () => routeContextState,
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    confirmDialogProps: null,
  }),
}))

afterEach(() => {
  cleanup()
  addWorkspaceAccessMutate.mockReset()
  confirmMock.mockClear()
  createWorkspaceInviteMutate.mockReset()
  navigateMock.mockClear()
  routeContextState.data = defaultRouteContext
  routeContextState.isPending = false
  searchResultsState.data = []
  searchResultsState.isLoading = false
  snapshotState.data = defaultSnapshot
  snapshotState.isPending = false
  toastMock.mockReset()
})

describe('WorkspaceAccessPage', () => {
  it('shows only admin and member add actions for org members', () => {
    searchResultsState.data = [
      {
        email: 'jordan@example.com',
        name: 'Jordan Kim',
        orgRole: 'member',
        userId: 'user-3',
      },
    ]

    render(<WorkspaceAccessPage/>)

    fireEvent.change(
      screen.getByPlaceholderText('Search organization users or enter an email'),
      {target: {value: 'jordan'}},
    )

    expect(screen.getByText('Org admins and members can only be local admins or members.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Add as admin'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Add as member'})).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Add as guest'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Add as admin'}))

    expect(addWorkspaceAccessMutate).toHaveBeenCalledWith(
      {role: 'admin', userId: 'user-3'},
      expect.any(Object),
    )
  })

  it('describes open-workspace removal as removing only the explicit workspace row', async () => {
    render(<WorkspaceAccessPage/>)

    expect(screen.getByText(/removing someone here only removes the explicit workspace row/i)).toBeInTheDocument()
    expect(screen.getByText(/it does not revoke inherited open-workspace access or change explicit project memberships/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Remove from workspace list'))

    await waitFor(() => {
        expect(confirmMock).toHaveBeenCalledWith(
          expect.objectContaining({
            confirmLabel: 'Remove from list',
            description: 'This removes only the explicit workspace row. They may still inherit access to open workspace content, and any explicit project memberships stay in place.',
            title: 'Remove Alex Lane from the explicit workspace list?',
            variant: 'destructive',
          }),
        )
    })
  })

  it('shows an existing-member state instead of an add action for explicit workspace members', () => {
    snapshotState.data = {
      ...defaultSnapshot,
      canManageWorkspace: false,
      currentOrgRole: 'member',
    }
    searchResultsState.data = [
      {
        email: 'alex@example.com',
        name: 'Alex Lane',
        orgRole: 'member',
        userId: 'user-2',
      },
    ]

    render(<WorkspaceAccessPage/>)

    fireEvent.change(
      screen.getByPlaceholderText('Search organization users or enter an email'),
      {target: {value: 'alex@example.com'}},
    )

    expect(screen.getByText('Alex Lane already has explicit workspace access.')).toBeInTheDocument()
    expect(screen.getByText(/use the role picker in the explicit member list below/i)).toBeInTheDocument()
    expect(screen.queryByText('Invite as guest')).not.toBeInTheDocument()
    expect(addWorkspaceAccessMutate).not.toHaveBeenCalled()
  })

  it('disables the last explicit workspace admin row from demotion or removal', () => {
    snapshotState.data = {
      ...defaultSnapshot,
      directAccess: [
        {
          canEdit: true,
          canManage: true,
          effectiveRole: 'admin',
          email: 'alex@example.com',
          githubLogin: null,
          id: 'user-2',
          name: 'Alex Lane',
          orgRole: 'member',
          scopeRole: 'admin',
        },
      ],
    }

    render(<WorkspaceAccessPage/>)

    expect(screen.getByLabelText('Local role for Alex Lane')).toBeDisabled()
    expect(screen.getByLabelText('Remove Alex Lane from workspace list')).toBeDisabled()
    expect(screen.getByText('At least one workspace admin is required.')).toBeInTheDocument()
    expect(screen.queryByRole('option', {name: 'Workspace guest'})).not.toBeInTheDocument()
  })
})
