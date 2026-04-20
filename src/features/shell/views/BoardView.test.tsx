// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {act, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState, type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import type {CardRecord, CreateCardInput, ProjectStatusOption, TaskBoardMode} from '../../cards/card.types'
import type {ProjectBoardLane, ProjectBoardTask} from '../../cards/card-view-mappers'
import {taskBoardBacklogId, taskBoardStandardLaneId} from '../../cards/card-view-mappers'
import {sprintReassignmentUnavailableMessage} from '../../sprints/sprint-mutation-guard'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {BoardView} from './BoardView'

const dragCallbacks = vi.hoisted(() => ({
  onDragEnd: null as null | ((event: {active: {id: string}; over: {id: string} | null}) => Promise<void> | void),
}))

vi.mock('@dnd-kit/core', () => ({
  closestCorners: vi.fn(),
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode
    onDragEnd?: (event: {active: {id: string}; over: {id: string} | null}) => Promise<void> | void
  }) => {
    dragCallbacks.onDragEnd = onDragEnd ?? null
    return <div>{children}</div>
  },
  DragOverlay: ({children}: {children?: ReactNode}) => <div>{children}</div>,
  PointerSensor: class {},
  useDroppable: () => ({
    isOver: false,
    setNodeRef: vi.fn(),
  }),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: <T,>(array: T[], from: number, to: number) => {
    const next = [...array]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  },
  SortableContext: ({children}: {children: ReactNode}) => <div>{children}</div>,
  useSortable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  }),
  verticalListSortingStrategy: {},
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({count, estimateSize}: {
    count: number
    estimateSize: (index: number) => number
  }) => {
    let start = 0
    const virtualItems = Array.from({length: count}, (_, index) => {
      const size = estimateSize(index)
      const item = {index, size, start}
      start += size
      return item
    })

    return {
      getTotalSize: () => virtualItems.reduce((total, item) => total + item.size, 0),
      getVirtualItems: () => virtualItems,
      measureElement: vi.fn(),
    }
  },
}))

vi.mock('../../../components/ui/user-avatar', () => ({
  UserAvatar: ({fallback}: {fallback?: string}) => <div>{fallback ?? 'U'}</div>,
}))

const statusOptions: ProjectStatusOption[] = [
  {
    category: 'not_started',
    color: null,
    id: 'status-1',
    isDefault: true,
    key: 'todo',
    label: 'To Do',
    position: 0,
  },
]

function createCard(id: string, title: string, overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Test User',
    assigneeUserId: 'user-1',
    bodyJson: {content: [{type: 'paragraph'}], type: 'doc'},
    bodyMd: '',
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id,
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: null,
    startAt: null,
    statusOptionId: 'status-1',
    statusPosition: 0,
    tags: [],
    title,
    ...overrides,
  }
}

function createBoardTask(id: string, title: string, overrides: Partial<CardRecord> = {}): ProjectBoardTask {
  return {
    assignee: 'JK',
    card: createCard(id, title, overrides),
    columnId: 'status-1',
    dueIn: null,
    id,
    priority: 'None',
    tags: [],
    title,
  }
}

function createBoardLane(id: string, title: string, sprint: ProjectSprintRecord | null = null): ProjectBoardLane {
  return {id, sprint, title}
}

function renderBoardView({
  initialCollapsedColumnIds = [],
  taskMode = 'standard',
}: {
  initialCollapsedColumnIds?: string[]
  taskMode?: TaskBoardMode
} = {}) {
  const onCreateTask = vi.fn<(defaults?: Partial<CreateCardInput>) => void>()
  const onMoveTask = vi.fn().mockResolvedValue(true)
  const onOpenTask = vi.fn()

  const boardTasks = {
    'status-1': {
      [taskBoardStandardLaneId]: [
        createBoardTask('task-1', 'Rocketboard usability + invitations'),
        createBoardTask('task-2', 'Claude Code | D1 Agent'),
      ],
    },
  }

  function Harness() {
    const [collapsedColumnIds, setCollapsedColumnIds] = useState<string[]>(initialCollapsedColumnIds)

    return (
      <BoardView
        boardColumns={[{id: 'status-1', title: 'To Do'}]}
        boardLanes={[]}
        boardTasks={boardTasks}
        collapsedColumnIds={collapsedColumnIds}
        mode='light'
        onCreateTask={onCreateTask}
        onCollapsedColumnIdsChange={setCollapsedColumnIds}
        onMoveTask={onMoveTask}
        onOpenTask={onOpenTask}
        projectMembers={[]}
        statusOptions={statusOptions}
        taskMode={taskMode}
      />
    )
  }

  return {
    onCreateTask,
    onMoveTask,
    onOpenTask,
    user: userEvent.setup(),
    ...render(<Harness />),
  }
}

describe('BoardView collapsed columns', () => {
  it('renders a collapsed rail with the column title, task count, and add action', async () => {
    const {onCreateTask, user} = renderBoardView({initialCollapsedColumnIds: ['status-1']})

    expect(screen.queryByText('Rocketboard usability + invitations')).not.toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByTitle('2 tasks')).toHaveTextContent('2')

    await user.click(screen.getByRole('button', {name: 'Add task to To Do'}))

    expect(onCreateTask).toHaveBeenCalledWith({statusOptionId: 'status-1'})

    await user.click(screen.getByRole('button', {name: 'Expand To Do column'}))

    expect(await screen.findByText('Rocketboard usability + invitations')).toBeInTheDocument()
  })

  it('collapses and re-expands a column without losing the tasks', async () => {
    const {user} = renderBoardView()

    expect(screen.getByText('Rocketboard usability + invitations')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Collapse To Do column'}))

    await waitFor(() => {
      expect(screen.queryByText('Rocketboard usability + invitations')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('button', {name: 'Open To Do column'})).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Open To Do column'}))

    expect(await screen.findByText('Rocketboard usability + invitations')).toBeInTheDocument()
  })
})

describe('BoardView sprint recovery', () => {
  it('disables lane-scoped task creation when sprint metadata is inferred', () => {
    const inferredSprint = {
      completedAt: null,
      createdAt: '1970-01-01T00:00:00.000Z',
      displaySource: 'inferred',
      endDate: null,
      goal: null,
      id: 'sprint-1',
      name: 'Sprint unavailable',
      position: 0,
      projectId: 'project-1',
      startDate: null,
      status: 'planned',
      updatedAt: '1970-01-01T00:00:00.000Z',
    } as ProjectSprintRecord
    const onCreateTask = vi.fn<(defaults?: Partial<CreateCardInput>) => void>()

    render(
      <BoardView
        boardColumns={[{id: 'status-1', title: 'To Do'}]}
        boardLanes={[createBoardLane('sprint-1', 'Sprint unavailable', inferredSprint)]}
        boardTasks={{
          'status-1': {
            'sprint-1': [createBoardTask('task-1', 'Recovered task', {sprintId: 'sprint-1'})],
          },
        }}
        mode='light'
        onCreateTask={onCreateTask}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onOpenTask={vi.fn()}
        projectMembers={[]}
        statusOptions={statusOptions}
        taskMode='sprint'
      />,
    )

    expect(screen.getByRole('button', {name: 'Add task'})).toBeDisabled()
  })

  it('blocks drag moves that would change sprint membership while sprint metadata is inferred', async () => {
    const onMoveBlocked = vi.fn()
    const onMoveTask = vi.fn().mockResolvedValue(true)
    const inferredSprint = {
      completedAt: null,
      createdAt: '1970-01-01T00:00:00.000Z',
      displaySource: 'inferred',
      endDate: null,
      goal: null,
      id: 'sprint-1',
      name: 'Sprint unavailable',
      position: 0,
      projectId: 'project-1',
      startDate: null,
      status: 'planned',
      updatedAt: '1970-01-01T00:00:00.000Z',
    } as ProjectSprintRecord

    render(
      <BoardView
        boardColumns={[{id: 'status-1', title: 'To Do'}]}
        boardLanes={[
          createBoardLane('sprint-1', 'Sprint unavailable', inferredSprint),
          createBoardLane(taskBoardBacklogId, 'Backlog'),
        ]}
        boardTasks={{
          'status-1': {
            [taskBoardBacklogId]: [createBoardTask('task-1', 'Recovered task')],
            'sprint-1': [],
          },
        }}
        displayProjectSprintsInferred
        mode='light'
        onCreateTask={vi.fn()}
        onMoveBlocked={onMoveBlocked}
        onMoveTask={onMoveTask}
        onOpenTask={vi.fn()}
        projectMembers={[]}
        statusOptions={statusOptions}
        taskMode='sprint'
      />,
    )

    await act(async () => {
      await dragCallbacks.onDragEnd?.({
        active: {id: 'task-1'},
        over: {id: 'lane:status-1:sprint-1'},
      })
    })

    expect(onMoveTask).not.toHaveBeenCalled()
    expect(onMoveBlocked).toHaveBeenCalledWith(sprintReassignmentUnavailableMessage)
  })

  it('allows status-only drag moves within the same inferred sprint lane', async () => {
    const onMoveBlocked = vi.fn()
    const onMoveTask = vi.fn().mockResolvedValue(true)
    const inferredSprint = {
      completedAt: null,
      createdAt: '1970-01-01T00:00:00.000Z',
      displaySource: 'inferred',
      endDate: null,
      goal: null,
      id: 'sprint-1',
      name: 'Sprint unavailable',
      position: 0,
      projectId: 'project-1',
      startDate: null,
      status: 'planned',
      updatedAt: '1970-01-01T00:00:00.000Z',
    } as ProjectSprintRecord

    render(
      <BoardView
        boardColumns={[
          {id: 'status-1', title: 'To Do'},
          {id: 'status-2', title: 'Doing'},
        ]}
        boardLanes={[createBoardLane('sprint-1', 'Sprint unavailable', inferredSprint)]}
        boardTasks={{
          'status-1': {
            'sprint-1': [createBoardTask('task-1', 'Recovered task', {sprintId: 'sprint-1'})],
          },
          'status-2': {
            'sprint-1': [],
          },
        }}
        displayProjectSprintsInferred
        mode='light'
        onCreateTask={vi.fn()}
        onMoveBlocked={onMoveBlocked}
        onMoveTask={onMoveTask}
        onOpenTask={vi.fn()}
        projectMembers={[]}
        statusOptions={[
          ...statusOptions,
          {
            category: 'started',
            color: null,
            id: 'status-2',
            isDefault: false,
            key: 'doing',
            label: 'Doing',
            position: 1,
          },
        ]}
        taskMode='sprint'
      />,
    )

    await act(async () => {
      await dragCallbacks.onDragEnd?.({
        active: {id: 'task-1'},
        over: {id: 'lane:status-2:sprint-1'},
      })
    })

    expect(onMoveBlocked).not.toHaveBeenCalled()
    expect(onMoveTask).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'task-1',
      previousSprintId: 'sprint-1',
      targetSprintId: 'sprint-1',
      targetStatusOptionId: 'status-2',
    }))
  })
})
