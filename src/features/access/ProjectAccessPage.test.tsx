/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ProjectAccessPage} from './ProjectAccessPage'

const defaultRouteContext = {
  canAccessProject: false,
  canManageProject: true,
  organizationId: 'org-1',
  organizationName: 'Rocketboard',
  organizationSlug: 'rocketboard',
  projectAccess: 'private' as const,
  projectId: 'project-1',
  projectName: 'Secret Launch',
  projectSlug: 'secret-launch',
  workspaceAccess: 'private' as const,
  workspaceId: 'workspace-1',
  workspaceName: 'Executive Team',
  workspaceSlug: 'executive-team',
}

const defaultSnapshot = {
  canEditProject: false,
  canManageProject: true,
  collaborators: [],
  currentOrgRole: 'admin' as const,
  directAccess: [],
  pendingInvites: [],
  projectAccess: 'private' as const,
  workspaceAccess: 'private' as const,
}

const routeContextState: {
  data: typeof defaultRouteContext | null
  isPending: boolean
} = {
  data: defaultRouteContext,
  isPending: false,
}

const snapshotState: {
  data: typeof defaultSnapshot | undefined
  isPending: boolean
} = {
  data: defaultSnapshot,
  isPending: false,
}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({
    orgSlug: 'rocketboard',
    projectSlug: 'secret-launch',
    workspaceSlug: 'executive-team',
  }),
}))

vi.mock('../auth/session.queries', () => ({
  useSessionQuery: () => ({
    data: {
      status: 'authenticated',
      user: {id: 'user-1', name: 'Alex Lane'},
    },
  }),
}))

vi.mock('./access.queries', () => ({
  useProjectAccessQuery: () => ({
    data: snapshotState.data,
    isPending: snapshotState.isPending,
  }),
  useProjectAccessRouteContextQuery: () => ({
    data: routeContextState.data,
    isPending: routeContextState.isPending,
  }),
}))

vi.mock('./ProjectAccessSection', () => ({
  ProjectAccessSection: ({projectName, workspaceName}: {projectName: string; workspaceName: string}) => (
    <div>Section: {projectName} in {workspaceName}</div>
  ),
}))

afterEach(() => {
  cleanup()
  routeContextState.data = defaultRouteContext
  routeContextState.isPending = false
  snapshotState.data = defaultSnapshot
  snapshotState.isPending = false
})

describe('ProjectAccessPage', () => {
  it('shows metadata-only admin copy for private projects', () => {
    render(<ProjectAccessPage/>)

    expect(screen.getByText('Secret Launch Access')).toBeInTheDocument()
    expect(screen.getByText('Metadata-only admin view')).toBeInTheDocument()
    expect(screen.getByText(/project content stays hidden until you are explicitly added/i)).toBeInTheDocument()
    expect(screen.getByText('Section: Secret Launch in Executive Team')).toBeInTheDocument()
  })

  it('describes the editor-only project membership controls accurately', () => {
    routeContextState.data = {
      ...defaultRouteContext,
      canAccessProject: true,
      canManageProject: false,
    }
    snapshotState.data = {
      ...defaultSnapshot,
      canEditProject: true,
      canManageProject: false,
    }

    render(<ProjectAccessPage/>)

    expect(
      screen.getByText(
        'You can add local members here, but only project, workspace, or organization admins can grant project admin access, change existing roles, or remove people.',
      ),
    ).toBeInTheDocument()
  })

  it('describes viewer-only project membership controls accurately', () => {
    routeContextState.data = {
      ...defaultRouteContext,
      canAccessProject: true,
      canManageProject: false,
    }
    snapshotState.data = {
      ...defaultSnapshot,
      canEditProject: false,
      canManageProject: false,
    }

    render(<ProjectAccessPage/>)

    expect(
      screen.getByText(
        'You can review project membership here, but only project editors or admins can add people, and only project, workspace, or organization admins can change existing roles or remove people.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the not-found state when route context is missing instead of spinning forever', () => {
    routeContextState.data = null
    snapshotState.data = undefined
    snapshotState.isPending = true

    render(<ProjectAccessPage/>)

    expect(screen.getByText('Project not found or you do not have access.')).toBeInTheDocument()
  })
})
