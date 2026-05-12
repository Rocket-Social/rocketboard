// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {emptyShellRoutePath} from '../projects/project-shell.routes'
import {buildProjectRouteHref} from '../search/workspace-palette-navigation'
import {AccountSettingsPage} from './AccountSettingsPage'

const navigateMock = vi.fn()

const sessionQueryState: {
  data: {status: 'authenticated'; user: {email: string; githubLogin: string | null; id: string; initials: string; isInternalAdmin: boolean; name: string; weekStartsOn: 'sunday' | 'monday'}} | {status: 'anonymous'} | undefined
  isPending: boolean
} = {
  data: {
    status: 'authenticated',
    user: {
      email: 'user@example.com',
      githubLogin: 'octocat',
      id: 'user-1',
      initials: 'TU',
      isInternalAdmin: false,
      name: 'Test User',
      weekStartsOn: 'sunday',
    },
  },
  isPending: false,
}

const workspaceSummariesQueryState: {
  data: any[] | undefined
  isPending: boolean
} = {
  data: undefined,
  isPending: false,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../projects/project-shell.queries', () => ({
  useWorkspaceSummariesQuery: () => workspaceSummariesQueryState,
}))

vi.mock('./session.queries', () => ({
  useSessionQuery: () => sessionQueryState,
}))

vi.mock('./AccountSettingsDialog', () => ({
  AccountSettingsDialog: (props: {currentUser: {name: string}; onClose: () => void}) => (
    <div>
      <p>{props.currentUser.name}</p>
      <button onClick={props.onClose} type='button'>
        Close profile
      </button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  navigateMock.mockReset()
  sessionQueryState.isPending = false
  sessionQueryState.data = {
    status: 'authenticated',
    user: {
      email: 'user@example.com',
      githubLogin: 'octocat',
      id: 'user-1',
      initials: 'TU',
      isInternalAdmin: false,
      name: 'Test User',
      weekStartsOn: 'sunday',
    },
  }
  workspaceSummariesQueryState.isPending = false
  workspaceSummariesQueryState.data = undefined
})

describe('AccountSettingsPage', () => {
  it('closes back to the default project route when a workspace exists', async () => {
    const user = userEvent.setup()

    workspaceSummariesQueryState.data = [
      {
        canManageWorkspace: false,
        colorToken: 'slate',
        defaultProjectSlug: 'main-project',
        icon: 'R',
        id: 'workspace-1',
        name: 'Workspace Alpha',
        organizationId: 'org-1',
        organizationName: 'Rocketboard',
        organizationSlug: 'rocketboard',
        projects: [
          {
            access: 'open',
            builtinFieldLabels: {},
            builtinOptionLabels: {},
            defaultProjectViewId: 'table-view',
            icon: 'P',
            id: 'project-1',
            lastUpdatedLabel: 'now',
            memberCount: 1,
            name: 'Main project',
            priorityOptions: [],
            projectViews: [
              {
                id: 'table-view',
                isDefault: true,
                isHidden: false,
                name: 'Table',
                position: 0,
                viewType: 'table',
              },
            ],
            slug: 'main-project',
            statusOptions: [],
            taskCount: 0,
          },
        ],
        slug: 'workspace-alpha',
        timezone: 'America/Los_Angeles',
      },
    ]

    render(<AccountSettingsPage/>)

    expect(screen.getByText('Test User')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Close profile'}))

    expect(navigateMock).toHaveBeenCalledWith({
      href: buildProjectRouteHref({
        orgSlug: 'rocketboard',
        projectSlug: 'main-project',
        viewId: 'table-view',
        viewType: 'table',
        workspaceSlug: 'workspace-alpha',
      }),
    })
  })

  it('falls back to onboarding when the user has no workspace yet', async () => {
    const user = userEvent.setup()

    workspaceSummariesQueryState.data = []

    render(<AccountSettingsPage/>)

    expect(screen.getByText('Test User')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Close profile'}))

    expect(navigateMock).toHaveBeenCalledWith({to: emptyShellRoutePath})
  })
})
