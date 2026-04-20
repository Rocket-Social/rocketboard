/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ProjectAccessSection} from './ProjectAccessSection'

const addProjectAccessMutate = vi.fn()
const createProjectInviteMutate = vi.fn()
const removeProjectAccessMutate = vi.fn()
const setProjectAccessRoleMutate = vi.fn()
const setProjectVisibilityMutate = vi.fn()
const toastMock = vi.fn()

const searchResultsState: {
  data: Array<{email: string; name: string; orgRole: 'admin' | 'member' | 'guest'; userId: string}>
  isLoading: boolean
} = {
  data: [],
  isLoading: false,
}

vi.mock('../auth/session.queries', () => ({
  useSessionQuery: () => ({
    data: {
      status: 'authenticated',
      user: {id: 'user-1', name: 'Alex Lane'},
    },
  }),
}))

vi.mock('./access.queries', () => ({
  useAddProjectAccessMutation: () => ({mutate: addProjectAccessMutate}),
  useCreateProjectInviteMutation: () => ({isPending: false, mutate: createProjectInviteMutate}),
  useRemoveProjectAccessMutation: () => ({mutate: removeProjectAccessMutate}),
  useSearchWorkspaceMembersQuery: () => searchResultsState,
  useSetProjectAccessRoleMutation: () => ({mutate: setProjectAccessRoleMutate}),
  useSetProjectVisibilityMutation: () => ({mutate: setProjectVisibilityMutate}),
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    confirmDialogProps: null,
  }),
}))

afterEach(() => {
  cleanup()
  addProjectAccessMutate.mockReset()
  createProjectInviteMutate.mockReset()
  removeProjectAccessMutate.mockReset()
  setProjectAccessRoleMutate.mockReset()
  setProjectVisibilityMutate.mockReset()
  toastMock.mockReset()
  searchResultsState.data = []
  searchResultsState.isLoading = false
})

describe('ProjectAccessSection', () => {
  it('shows only admin and member add actions for org members', () => {
    searchResultsState.data = [
      {
        email: 'jordan@example.com',
        name: 'Jordan Kim',
        orgRole: 'member',
        userId: 'user-3',
      },
    ]

    render(
      <ProjectAccessSection
        currentUserId='user-1'
        projectId='project-1'
        projectName='Secret Launch'
        snapshot={{
          canEditProject: true,
          canManageProject: true,
          collaborators: [],
          currentOrgRole: 'admin',
          directAccess: [],
          pendingInvites: [],
          projectAccess: 'private',
          workspaceAccess: 'private',
        }}
        workspaceId='workspace-1'
        workspaceName='Executive Team'
      />,
    )

    fireEvent.change(
      screen.getByPlaceholderText('Search organization users or enter an email'),
      {target: {value: 'jordan'}},
    )

    expect(screen.getByText('Org admins and members can only be project admins or members.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Add as admin'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Add as member'})).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Add as guest'})).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: 'Add as admin'}))

    expect(addProjectAccessMutate).toHaveBeenCalledWith(
      {role: 'admin', userId: 'user-3'},
      expect.any(Object),
    )
  })

  it('shows an existing-member state instead of the external guest invite CTA', () => {
    render(
      <ProjectAccessSection
        currentUserId='user-1'
        projectId='project-1'
        projectName='Secret Launch'
        snapshot={{
          canEditProject: true,
          canManageProject: true,
          collaborators: [],
          currentOrgRole: 'admin',
          directAccess: [
            {
              canEdit: true,
              canManage: true,
              effectiveRole: 'member',
              email: 'alex@example.com',
              githubLogin: null,
              id: 'user-2',
              name: 'Alex Lane',
              orgRole: 'member',
              scopeRole: 'member',
            },
          ],
          pendingInvites: [],
          projectAccess: 'private',
          workspaceAccess: 'private',
        }}
        workspaceId='workspace-1'
        workspaceName='Executive Team'
      />,
    )

    fireEvent.change(
      screen.getByPlaceholderText('Search organization users or enter an email'),
      {target: {value: 'alex@example.com'}},
    )

    expect(screen.getByText('Alex Lane already has explicit project access.')).toBeInTheDocument()
    expect(screen.getByText(/use the role picker in the explicit member list below/i)).toBeInTheDocument()
    expect(screen.queryByText('Invite as guest')).not.toBeInTheDocument()
  })

  it('describes open-workspace project invites without implying a workspace guest row', () => {
    render(
      <ProjectAccessSection
        currentUserId='user-1'
        projectId='project-1'
        projectName='Secret Launch'
        snapshot={{
          canEditProject: true,
          canManageProject: true,
          collaborators: [],
          currentOrgRole: 'admin',
          directAccess: [],
          pendingInvites: [],
          projectAccess: 'private',
          workspaceAccess: 'open',
        }}
        workspaceId='workspace-1'
        workspaceName='Executive Team'
      />,
    )

    fireEvent.change(
      screen.getByPlaceholderText('Search organization users or enter an email'),
      {target: {value: 'guest@example.com'}},
    )

    expect(screen.getByText('No organization user matched guest@example.com.')).toBeInTheDocument()
    expect(screen.getByText('External project invites create organization guests and project guests.')).toBeInTheDocument()
  })

  it('hides add and invite controls for read-only project viewers', () => {
    render(
      <ProjectAccessSection
        currentUserId='user-1'
        projectId='project-1'
        projectName='Secret Launch'
        snapshot={{
          canEditProject: false,
          canManageProject: false,
          collaborators: [],
          currentOrgRole: 'guest',
          directAccess: [],
          pendingInvites: [],
          projectAccess: 'open',
          workspaceAccess: 'open',
        }}
        workspaceId='workspace-1'
        workspaceName='Executive Team'
      />,
    )

    expect(screen.queryByPlaceholderText('Search organization users or enter an email')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Invite as guest'})).not.toBeInTheDocument()
  })

  it('disables the last explicit project admin row from demotion or removal', () => {
    render(
      <ProjectAccessSection
        currentUserId='user-1'
        projectId='project-1'
        projectName='Secret Launch'
        snapshot={{
          canEditProject: true,
          canManageProject: true,
          collaborators: [],
          currentOrgRole: 'admin',
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
          pendingInvites: [],
          projectAccess: 'private',
          workspaceAccess: 'private',
        }}
        workspaceId='workspace-1'
        workspaceName='Executive Team'
      />,
    )

    expect(screen.getByLabelText('Local role for Alex Lane')).toBeDisabled()
    expect(screen.getByLabelText('Remove Alex Lane from project access')).toBeDisabled()
    expect(screen.getByText('At least one project admin is required.')).toBeInTheDocument()
    expect(screen.queryByRole('option', {name: 'Project guest'})).not.toBeInTheDocument()
  })
})
