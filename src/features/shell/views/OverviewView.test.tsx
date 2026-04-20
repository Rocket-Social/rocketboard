/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import type {ComponentProps} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {plainTextToRichTextDocument} from '../../rich-text/rich-text'
import type {CardRecord, ProjectStatusOption} from '../../cards/card.types'
import type {ProjectAccessSnapshot} from '../../access/access.types'
import {OverviewView} from './OverviewView'

vi.mock('../../access/ProjectAccessSection', () => ({
  ProjectAccessSection: ({snapshot}: {snapshot: ProjectAccessSnapshot}) => (
    <section>
      <h3>Project Access</h3>
      <input
        aria-label='Search organization users or enter an email'
        placeholder='Search organization users or enter an email'
      />
      {snapshot.canManageProject ? (
        <>
          <div>Actions</div>
          <select defaultValue='admin'>
            <option value='admin'>Project admin</option>
          </select>
        </>
      ) : (
        <div>Explicit project members</div>
      )}
    </section>
  ),
}))

afterEach(() => {
  cleanup()
})

const statusOptions: ProjectStatusOption[] = [
  {
    category: 'not_started',
    color: null,
    id: 'status-todo',
    isDefault: true,
    key: 'todo',
    label: 'To Do',
    position: 0,
  },
  {
    category: 'completed',
    color: null,
    id: 'status-done',
    isDefault: false,
    key: 'done',
    label: 'Done',
    position: 1,
  },
]

function makeProjectAccessSnapshot(
  overrides: Partial<ProjectAccessSnapshot> = {},
): ProjectAccessSnapshot {
  return {
    canEditProject: true,
    canManageProject: false,
    collaborators: [
      {
        accessSource: 'project',
        canEdit: true,
        canManage: true,
        email: 'alex@example.com',
        githubLogin: null,
        id: 'user-1',
        name: 'Alex Lane',
        orgRole: 'admin',
        projectRole: 'admin',
        role: 'admin',
        workspaceRole: null,
      },
    ],
    currentOrgRole: 'admin',
    directAccess: [
      {
        canEdit: true,
        canManage: true,
        effectiveRole: 'admin',
        email: 'alex@example.com',
        githubLogin: null,
        id: 'user-1',
        name: 'Alex Lane',
        orgRole: 'admin',
        scopeRole: 'admin',
      },
    ],
    pendingInvites: [],
    projectAccess: 'private',
    workspaceAccess: 'private',
    ...overrides,
  }
}

function makeCard(): CardRecord {
  return {
    assigneeName: 'Alex Lane',
    assigneeUserId: 'user-1',
    bodyJson: plainTextToRichTextDocument('Investigate launch blocker'),
    bodyMd: 'Investigate launch blocker',
    cardRef: null,
    completedAt: null,
    createdAt: '2026-04-01T18:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: 3,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectCardNumber: 1,
    projectId: 'project-1',
    projectKey: null,
    sprintId: null,
    startAt: null,
    statusOptionId: 'status-todo',
    statusPosition: 0,
    tags: [],
    title: 'Investigate launch blocker',
  }
}

function renderOverviewView(overrides: Partial<ComponentProps<typeof OverviewView>> = {}) {
  return render(
    <OverviewView
      cards={[makeCard()]}
      currentUserId='user-1'
      hasVisibleTaskBoardView
      isEditMode={false}
      mode='light'
      onRemoveWidget={() => undefined}
      onRenameWidget={() => undefined}
      onReorderWidgets={() => undefined}
      onResizeWidget={() => undefined}
      priorityOptions={[]}
      projectAccessSnapshot={makeProjectAccessSnapshot()}
      projectId='project-1'
      projectName='Launchpad'
      statusOptions={statusOptions}
      workspaceId='workspace-1'
      workspaceName='Product'
      widgets={[
        {id: 'progress_status', type: 'progress_status', title: null, width: 1},
        {id: 'burn_up', type: 'burn_up', title: null, width: 1},
        {id: 'priority_assignees', type: 'priority_assignees', title: null, width: 1},
      ]}
      {...overrides}
    />,
  )
}

describe('OverviewView', () => {
  afterEach(() => {
    cleanup()
  })

  it('hides task summary panels when no visible task board exists', () => {
    renderOverviewView({hasVisibleTaskBoardView: false})

    expect(screen.queryByText('Progress')).not.toBeInTheDocument()
    expect(screen.queryByText('Burn-up')).not.toBeInTheDocument()
    expect(screen.queryByText('Priority items')).not.toBeInTheDocument()
    expect(screen.getByText('Project Access')).toBeInTheDocument()
  })

  it('shows task summary panels when a visible task board exists', () => {
    renderOverviewView()

    expect(screen.getByText('Progress by Status')).toBeInTheDocument()
    expect(screen.getByText('Burn-up')).toBeInTheDocument()
    expect(screen.getByText('Priority items')).toBeInTheDocument()  // tab label inside widget
  })

  it('applies the widget width span class to the grid item', () => {
    renderOverviewView({
      widgets: [
        {id: 'progress_status', type: 'progress_status', title: null, width: 2},
        {id: 'burn_up', type: 'burn_up', title: null, width: 1},
      ],
    })

    expect(screen.getAllByRole('listitem')[0]).toHaveClass('lg:col-span-2')
  })

  it('renders widget shells at full row height for uniform grid rows', () => {
    renderOverviewView()

    const firstWidgetShell = screen.getAllByRole('listitem')[0].firstElementChild
    expect(firstWidgetShell).toHaveClass('h-full')
  })

  it('shows invite affordances to project writers without exposing admin controls', () => {
    renderOverviewView({
      projectAccessSnapshot: makeProjectAccessSnapshot({
        canManageProject: false,
        directAccess: [
          {
            canEdit: true,
            canManage: false,
            effectiveRole: 'member',
            email: 'alex@example.com',
            githubLogin: null,
            id: 'user-1',
            name: 'Alex Lane',
            orgRole: 'member',
            scopeRole: 'member',
          },
        ],
      }),
    })

    expect(screen.getByText('Explicit project members')).toBeInTheDocument()
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('admin')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search organization users or enter an email')).toBeInTheDocument()
  })

  it('shows member management controls only to project admins', () => {
    renderOverviewView({
      projectAccessSnapshot: makeProjectAccessSnapshot({
        canManageProject: true,
      }),
    })

    expect(screen.getByPlaceholderText('Search organization users or enter an email')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('admin')
  })
})
