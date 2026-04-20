/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ProjectViewTabs} from './ProjectViewTabs'
import {TaskModeMenu} from './TaskModeMenu'
import {ToolbarPortal, ToolbarPortalProvider} from './ToolbarSlot'
import type {WorkspaceProjectSummary} from '../projects/project-shell.types'

function makeProject(overrides: Partial<WorkspaceProjectSummary> = {}): WorkspaceProjectSummary {
  return {
    access: 'open',
    builtinOptionLabels: {},
    builtinFieldLabels: {},
    defaultProjectViewId: 'table',
    icon: '🚀',
    id: 'project-1',
    lastUpdatedLabel: 'just now',
    memberCount: 3,
    name: 'Launchpad',
    projectViews: [
      {
        id: 'overview',
        isDefault: false,
        isHidden: false,
        name: 'Overview',
        position: 0,
        viewType: 'overview',
      },
      {
        id: 'table',
        isDefault: true,
        isHidden: false,
        name: 'Table',
        position: 1,
        viewType: 'table',
      },
      {
        id: 'gantt',
        isDefault: false,
        isHidden: false,
        name: 'Gantt',
        position: 2,
        viewType: 'gantt',
      },
    ],
    slug: 'launchpad',
    priorityOptions: [],
    statusOptions: [],
    taskCount: 12,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function renderProjectViewTabs(options: {
  activeViewId?: string
  canEditProject?: boolean
  project?: WorkspaceProjectSummary
} = {}) {
  const callbacks = {
    onAddView: vi.fn(),
    onHideView: vi.fn(),
    onRenameView: vi.fn(),
    onReorderViews: vi.fn(),
    onRestoreView: vi.fn(),
    onSelectView: vi.fn(),
    onSetDefaultView: vi.fn(),
  }

  render(
    <ProjectViewTabs
      activeViewId={options.activeViewId ?? 'table'}
      canEditProject={options.canEditProject ?? true}
      onAddView={callbacks.onAddView}
      onHideView={callbacks.onHideView}
      onRenameView={callbacks.onRenameView}
      onReorderViews={callbacks.onReorderViews}
      onRestoreView={callbacks.onRestoreView}
      onSelectView={callbacks.onSelectView}
      onSetDefaultView={callbacks.onSetDefaultView}
      project={options.project ?? makeProject()}
    />,
  )

  return callbacks
}

describe('ProjectViewTabs', () => {
  it('shows the default star as a passive indicator and removes extra tab action buttons', () => {
    renderProjectViewTabs()

    expect(screen.getByRole('img', {name: 'Table is the default board'})).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Table is the default board'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('opens the board menu on right click and routes actions to the clicked board', async () => {
    const user = userEvent.setup()
    const callbacks = renderProjectViewTabs()

    fireEvent.contextMenu(screen.getByRole('button', {name: 'Gantt'}), {
      clientX: 120,
      clientY: 240,
    })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Rename board')).toBeInTheDocument()
    expect(within(menu).getByText('Set as default')).toBeInTheDocument()
    expect(within(menu).getByText('Hide board')).toBeInTheDocument()

    await user.click(within(menu).getByText('Rename board'))

    const dialog = await screen.findByRole('alertdialog', {name: 'Rename board'})
    const nameInput = within(dialog).getByRole('textbox')
    expect(nameInput).toHaveValue('Gantt')
    await user.clear(nameInput)
    await user.type(nameInput, 'Roadmap')
    await user.click(within(dialog).getByRole('button', {name: 'Rename'}))
    expect(callbacks.onRenameView).toHaveBeenCalledWith('gantt', 'Roadmap')

    fireEvent.contextMenu(screen.getByRole('button', {name: 'Gantt'}), {
      clientX: 120,
      clientY: 240,
    })

    await user.click(await screen.findByText('Set as default'))
    expect(callbacks.onSetDefaultView).toHaveBeenCalledWith('gantt')

    fireEvent.contextMenu(screen.getByRole('button', {name: 'Gantt'}), {
      clientX: 120,
      clientY: 240,
    })

    await user.click(await screen.findByText('Hide board'))
    expect(callbacks.onHideView).toHaveBeenCalledWith('gantt')
  })

  it('opens the board menu on touch long press without triggering board selection', () => {
    vi.useFakeTimers()
    const callbacks = renderProjectViewTabs()
    const ganttButton = screen.getByRole('button', {name: 'Gantt'})
    const ganttTab = ganttButton.parentElement

    expect(ganttTab).not.toBeNull()

    fireEvent.pointerDown(ganttTab!, {
      clientX: 96,
      clientY: 144,
      pointerId: 1,
      pointerType: 'touch',
    })

    act(() => {
      vi.advanceTimersByTime(460)
    })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Rename board')).toBeInTheDocument()

    fireEvent.pointerUp(ganttTab!, {
      clientX: 96,
      clientY: 144,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.click(ganttButton)

    expect(callbacks.onSelectView).not.toHaveBeenCalled()
  })

  it('routes Set as default to the active GitHub board', async () => {
    const user = userEvent.setup()
    const callbacks = renderProjectViewTabs({
      activeViewId: 'github',
      project: makeProject({
        projectViews: [
          {
            id: 'overview',
            isDefault: false,
            isHidden: false,
            name: 'Overview',
            position: 0,
            viewType: 'overview',
          },
          {
            id: 'table',
            isDefault: true,
            isHidden: false,
            name: 'Table',
            position: 1,
            viewType: 'table',
          },
          {
            id: 'github',
            isDefault: false,
            isHidden: false,
            name: 'GitHub',
            position: 2,
            viewType: 'github',
          },
        ],
      }),
    })

    fireEvent.contextMenu(screen.getByRole('button', {name: 'GitHub'}), {
      clientX: 160,
      clientY: 240,
    })

    await user.click(await screen.findByText('Set as default'))

    expect(callbacks.onSetDefaultView).toHaveBeenCalledWith('github')
  })

  it('disables board management actions for read-only users', async () => {
    const user = userEvent.setup()
    const callbacks = renderProjectViewTabs({canEditProject: false})

    expect(screen.getByRole('button', {name: 'Add board'})).toBeDisabled()

    fireEvent.contextMenu(screen.getByRole('button', {name: 'Gantt'}), {
      clientX: 120,
      clientY: 240,
    })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Rename board')).toHaveAttribute('data-disabled')
    expect(within(menu).getByText('Set as default')).toHaveAttribute('data-disabled')
    expect(within(menu).getByText('Hide board')).toHaveAttribute('data-disabled')

    await user.click(within(menu).getByText('Hide board'))
    expect(callbacks.onHideView).not.toHaveBeenCalled()
    expect(callbacks.onRenameView).not.toHaveBeenCalled()
    expect(callbacks.onSetDefaultView).not.toHaveBeenCalled()
  })

  it('lets writers restore hidden boards from the board menu', async () => {
    const user = userEvent.setup()
    const callbacks = renderProjectViewTabs({
      project: makeProject({
        projectViews: [
          {
            id: 'overview',
            isDefault: false,
            isHidden: false,
            name: 'Overview',
            position: 0,
            viewType: 'overview',
          },
          {
            id: 'table',
            isDefault: true,
            isHidden: false,
            name: 'Table',
            position: 1,
            viewType: 'table',
          },
          {
            id: 'doc',
            isDefault: false,
            isHidden: true,
            name: 'Specs',
            position: 2,
            viewType: 'document',
          },
        ],
      }),
    })

    await user.click(screen.getByRole('button', {name: 'Add board'}))

    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByText('Show Specs'))

    expect(callbacks.onRestoreView).toHaveBeenCalledWith('doc')
  })

  it('keeps the add board control in the same horizontal row as the board tabs', () => {
    renderProjectViewTabs()

    expect(screen.getByTestId('project-view-tabs-row')).toContainElement(screen.getByRole('button', {name: 'Add board'}))
  })

  it('renders the task mode control in the shared header utility slot when provided', async () => {
    render(
      <ToolbarPortalProvider>
        <ProjectViewTabs
          activeViewId='table'
          canEditProject
          onAddView={vi.fn()}
          onHideView={vi.fn()}
          onRenameView={vi.fn()}
          onReorderViews={vi.fn()}
          onRestoreView={vi.fn()}
          onSelectView={vi.fn()}
          onSetDefaultView={vi.fn()}
          project={makeProject()}
        />
        <ToolbarPortal slot='view-tabs-trailing'>
          <TaskModeMenu onTaskModeChange={vi.fn()} taskMode='standard'/>
        </ToolbarPortal>
      </ToolbarPortalProvider>,
    )

    expect(await screen.findByRole('button', {name: /standard/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Add board'})).toBeInTheDocument()
  })

  it('keeps GitHub addable until the project already has ten GitHub boards', async () => {
    const user = userEvent.setup()

    renderProjectViewTabs({
      project: makeProject({
        projectViews: [
          {
            id: 'overview',
            isDefault: false,
            isHidden: false,
            name: 'Overview',
            position: 0,
            viewType: 'overview',
          },
          {
            id: 'table',
            isDefault: true,
            isHidden: false,
            name: 'Table',
            position: 1,
            viewType: 'table',
          },
          {
            id: 'github-1',
            isDefault: false,
            isHidden: false,
            name: 'GitHub',
            position: 2,
            viewType: 'github',
          },
          {
            id: 'github-2',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 2',
            position: 3,
            viewType: 'github',
          },
          {
            id: 'github-3',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 3',
            position: 4,
            viewType: 'github',
          },
          {
            id: 'github-4',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 4',
            position: 5,
            viewType: 'github',
          },
          {
            id: 'github-5',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 5',
            position: 6,
            viewType: 'github',
          },
          {
            id: 'github-6',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 6',
            position: 7,
            viewType: 'github',
          },
          {
            id: 'github-7',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 7',
            position: 8,
            viewType: 'github',
          },
          {
            id: 'github-8',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 8',
            position: 9,
            viewType: 'github',
          },
          {
            id: 'github-9',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 9',
            position: 10,
            viewType: 'github',
          },
        ],
      }),
    })

    await user.click(screen.getAllByRole('button').at(-1)!)
    const addBoardMenu = await screen.findByRole('menu')
    expect(within(addBoardMenu).getByText('GitHub')).toBeInTheDocument()

    cleanup()

    renderProjectViewTabs({
      project: makeProject({
        projectViews: [
          {
            id: 'overview',
            isDefault: false,
            isHidden: false,
            name: 'Overview',
            position: 0,
            viewType: 'overview',
          },
          {
            id: 'table',
            isDefault: true,
            isHidden: false,
            name: 'Table',
            position: 1,
            viewType: 'table',
          },
          {
            id: 'github-1',
            isDefault: false,
            isHidden: false,
            name: 'GitHub',
            position: 2,
            viewType: 'github',
          },
          {
            id: 'github-2',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 2',
            position: 3,
            viewType: 'github',
          },
          {
            id: 'github-3',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 3',
            position: 4,
            viewType: 'github',
          },
          {
            id: 'github-4',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 4',
            position: 5,
            viewType: 'github',
          },
          {
            id: 'github-5',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 5',
            position: 6,
            viewType: 'github',
          },
          {
            id: 'github-6',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 6',
            position: 7,
            viewType: 'github',
          },
          {
            id: 'github-7',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 7',
            position: 8,
            viewType: 'github',
          },
          {
            id: 'github-8',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 8',
            position: 9,
            viewType: 'github',
          },
          {
            id: 'github-9',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 9',
            position: 10,
            viewType: 'github',
          },
          {
            id: 'github-10',
            isDefault: false,
            isHidden: false,
            name: 'GitHub 10',
            position: 11,
            viewType: 'github',
          },
        ],
      }),
    })

    await user.click(screen.getAllByRole('button').at(-1)!)
    const cappedAddBoardMenu = await screen.findByRole('menu')
    expect(within(cappedAddBoardMenu).queryByText('GitHub')).not.toBeInTheDocument()
  })
})
