/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

const {
  openOrganizationAccessSpy,
  openProjectAccessSpy,
  openWorkspaceAccessSpy,
  projectViewTabsSpy,
  preloadRouteSpy,
} = vi.hoisted(() => ({
  openOrganizationAccessSpy: vi.fn(),
  openProjectAccessSpy: vi.fn(),
  openWorkspaceAccessSpy: vi.fn(),
  projectViewTabsSpy: vi.fn((_props?: unknown) => <div data-testid='project-view-tabs'/>),
  preloadRouteSpy: vi.fn(() => Promise.resolve()),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    preloadRoute: preloadRouteSpy,
  }),
}))

vi.mock('./project/ProjectChromeContext', () => ({
  useProjectChrome: () => ({
    canEditProject: true,
    currentOrgRole: 'member',
    project: {
      icon: '🚀',
      memberCount: 3,
      name: 'Document Directory',
      projectViews: [
        {id: 'overview', isDefault: false, isHidden: false, name: 'Overview', position: 0, viewType: 'overview'},
        {id: 'doc', isDefault: false, isHidden: false, name: 'Document', position: 1, viewType: 'document'},
      ],
      taskCount: 1,
      lastUpdatedLabel: '1m ago',
      slug: 'document-directory',
    },
    workspace: {
      organizationId: 'org-1',
      organizationName: 'Acme Inc',
      name: 'Work',
      slug: 'work',
    },
  }),
}))

vi.mock('./project/ProjectDialogContext', () => ({
  useProjectDialogs: () => ({
    openOrganizationAccess: openOrganizationAccessSpy,
    openProjectAccess: openProjectAccessSpy,
    openWorkspaceAccess: openWorkspaceAccessSpy,
  }),
}))

vi.mock('./ProjectViewTabs', () => ({
  ProjectViewTabs: projectViewTabsSpy,
}))

import {ProjectShellHeader} from './ProjectShellHeader'

describe('ProjectShellHeader', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps board management enabled when only the table view backend is unavailable', () => {
    render(
      <ProjectShellHeader
        activeAutomationCount={0}
        activeViewId='doc'
        onAddView={vi.fn()}
        onAutomationManagerOpen={vi.fn()}
        onHideView={vi.fn()}
        onMobileSidebarOpen={vi.fn()}
        onOpenCommandPalette={vi.fn()}
        onRenameProject={vi.fn()}
        onRenameView={vi.fn()}
        onReorderViews={vi.fn()}
        onRestoreView={vi.fn()}
        onSelectView={vi.fn()}
        onSetDefaultView={vi.fn()}
      />,
    )

    expect(screen.getByTestId('project-view-tabs')).toBeInTheDocument()
    expect(projectViewTabsSpy).toHaveBeenCalledTimes(1)

    const projectViewTabsProps = projectViewTabsSpy.mock.calls[0]?.[0] as {
      canEditProject?: boolean
      configurationDisabled?: boolean
    }

    expect(projectViewTabsProps.canEditProject).toBe(true)
    expect(projectViewTabsProps.configurationDisabled).toBeUndefined()
  })

  it('renders the canonical access action', () => {
    render(
      <ProjectShellHeader
        activeAutomationCount={0}
        activeViewId='doc'
        onAddView={vi.fn()}
        onAutomationManagerOpen={vi.fn()}
        onHideView={vi.fn()}
        onMobileSidebarOpen={vi.fn()}
        onOpenCommandPalette={vi.fn()}
        onRenameProject={vi.fn()}
        onRenameView={vi.fn()}
        onReorderViews={vi.fn()}
        onRestoreView={vi.fn()}
        onSelectView={vi.fn()}
        onSetDefaultView={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', {name: 'Access'})).toBeInTheDocument()
  })

  it('shows all invite targets from the header action', async () => {
    const user = userEvent.setup()

    render(
      <ProjectShellHeader
        activeAutomationCount={0}
        activeViewId='doc'
        onAddView={vi.fn()}
        onAutomationManagerOpen={vi.fn()}
        onHideView={vi.fn()}
        onMobileSidebarOpen={vi.fn()}
        onOpenCommandPalette={vi.fn()}
        onRenameProject={vi.fn()}
        onRenameView={vi.fn()}
        onReorderViews={vi.fn()}
        onRestoreView={vi.fn()}
        onSelectView={vi.fn()}
        onSetDefaultView={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Access'}))

    expect(screen.getByRole('menuitem', {name: 'Invite to Organization'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem', {name: 'Invite to Workspace'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem', {name: 'Invite to Project'})).toBeInTheDocument()
  })

  it('opens organization access from the header menu', async () => {
    const user = userEvent.setup()

    render(
      <ProjectShellHeader
        activeAutomationCount={0}
        activeViewId='doc'
        onAddView={vi.fn()}
        onAutomationManagerOpen={vi.fn()}
        onHideView={vi.fn()}
        onMobileSidebarOpen={vi.fn()}
        onOpenCommandPalette={vi.fn()}
        onRenameProject={vi.fn()}
        onRenameView={vi.fn()}
        onReorderViews={vi.fn()}
        onRestoreView={vi.fn()}
        onSelectView={vi.fn()}
        onSetDefaultView={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Access'}))
    await user.click(screen.getByRole('menuitem', {name: 'Invite to Organization'}))

    expect(openOrganizationAccessSpy).toHaveBeenCalledTimes(1)
  })

  it('opens workspace access from the header menu', async () => {
    const user = userEvent.setup()

    render(
      <ProjectShellHeader
        activeAutomationCount={0}
        activeViewId='doc'
        onAddView={vi.fn()}
        onAutomationManagerOpen={vi.fn()}
        onHideView={vi.fn()}
        onMobileSidebarOpen={vi.fn()}
        onOpenCommandPalette={vi.fn()}
        onRenameProject={vi.fn()}
        onRenameView={vi.fn()}
        onReorderViews={vi.fn()}
        onRestoreView={vi.fn()}
        onSelectView={vi.fn()}
        onSetDefaultView={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Access'}))
    await user.click(screen.getByRole('menuitem', {name: 'Invite to Workspace'}))

    expect(openWorkspaceAccessSpy).toHaveBeenCalledTimes(1)
  })

  it('opens project access from the header menu', async () => {
    const user = userEvent.setup()

    render(
      <ProjectShellHeader
        activeAutomationCount={0}
        activeViewId='doc'
        onAddView={vi.fn()}
        onAutomationManagerOpen={vi.fn()}
        onHideView={vi.fn()}
        onMobileSidebarOpen={vi.fn()}
        onOpenCommandPalette={vi.fn()}
        onRenameProject={vi.fn()}
        onRenameView={vi.fn()}
        onReorderViews={vi.fn()}
        onRestoreView={vi.fn()}
        onSelectView={vi.fn()}
        onSetDefaultView={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Access'}))
    await user.click(screen.getByRole('menuitem', {name: 'Invite to Project'}))

    expect(openProjectAccessSpy).toHaveBeenCalledTimes(1)
  })
})
