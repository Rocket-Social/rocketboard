// @vitest-environment jsdom
//
// Phase 4 PR 4-B-2 — BoardView groupBy='assignee' tests.
//
// Verifies the drag-as-dispatch contract: a drop onto an agent column
// fires `onMoveAssignee` with the agent's `agent_user_id`; a drop onto
// a human column fires the same callback with the human's user id but
// the Phase 2a trigger (server-side) no-ops on humans (REG-2).
// Position bookkeeping doesn't apply in assignee mode.

import '@testing-library/jest-dom/vitest'

import {act, render, screen} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import type {ProjectMember} from '../../access/access.types'
import type {AssignablePersona} from '../../ai/agent.types'
import {ASSIGNEE_UNASSIGNED_COLUMN_ID, taskBoardStandardLaneId} from '../../cards/card-view-mappers'
import type {ProjectBoardTask} from '../../cards/card-view-mappers'
import type {CardRecord, ProjectStatusOption} from '../../cards/card.types'
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

const statusOptions: ProjectStatusOption[] = [
  {category: 'not_started', color: null, id: 'status-1', isDefault: true, key: 'todo', label: 'To Do', position: 0},
]

const memberJoseph: ProjectMember = {
  email: 'jk@example.com',
  githubLogin: null,
  id: 'human-jk',
  name: 'Joseph',
}

const personaSara: AssignablePersona = {
  accentColor: 'orange',
  agentUserId: 'agent-sara',
  avatarUrl: null,
  id: 'persona-sara',
  name: 'Sara',
  role: 'assistant',
  slug: 'sara',
}

function createCard(id: string, title: string, overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Joseph',
    assigneeUserId: 'human-jk',
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
  const card = createCard(id, title, overrides)
  return {
    assignee: 'JK',
    card,
    columnId: card.assigneeUserId ?? ASSIGNEE_UNASSIGNED_COLUMN_ID,
    dueIn: null,
    id,
    priority: 'None',
    tags: [],
    title,
  }
}

describe('BoardView groupBy=assignee', () => {
  it('renders a column for each member, persona, and unassigned bucket', () => {
    render(
      <BoardView
        assignablePersonas={[personaSara]}
        boardColumns={[
          {accentColor: null, id: 'human-jk', kind: 'assignee', title: 'Joseph'},
          {accentColor: 'orange', id: 'agent-sara', kind: 'assignee', title: 'Sara'},
          {accentColor: null, id: ASSIGNEE_UNASSIGNED_COLUMN_ID, kind: 'assignee', title: 'Unassigned'},
        ]}
        boardLanes={[]}
        boardTasks={{
          'human-jk': {[taskBoardStandardLaneId]: [createBoardTask('card-1', 'Joseph task', {assigneeUserId: 'human-jk'})]},
          'agent-sara': {[taskBoardStandardLaneId]: [createBoardTask('card-2', 'Sara task', {assigneeUserId: 'agent-sara', assigneeName: 'Sara'})]},
          [ASSIGNEE_UNASSIGNED_COLUMN_ID]: {[taskBoardStandardLaneId]: []},
        }}
        groupBy='assignee'
        mode='light'
        onCreateTask={vi.fn()}
        onMoveAssignee={vi.fn().mockResolvedValue(true)}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onOpenTask={vi.fn()}
        projectMembers={[memberJoseph]}
        statusOptions={statusOptions}
      />,
    )

    expect(screen.getByText('Joseph')).toBeInTheDocument()
    expect(screen.getByText('Sara')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  it('drag onto an agent column fires onMoveAssignee with the persona agentUserId', async () => {
    const onMoveAssignee = vi.fn().mockResolvedValue(true)
    const onMoveTask = vi.fn().mockResolvedValue(true)

    render(
      <BoardView
        assignablePersonas={[personaSara]}
        boardColumns={[
          {accentColor: null, id: 'human-jk', kind: 'assignee', title: 'Joseph'},
          {accentColor: 'orange', id: 'agent-sara', kind: 'assignee', title: 'Sara'},
          {accentColor: null, id: ASSIGNEE_UNASSIGNED_COLUMN_ID, kind: 'assignee', title: 'Unassigned'},
        ]}
        boardLanes={[]}
        boardTasks={{
          'human-jk': {[taskBoardStandardLaneId]: [createBoardTask('card-1', 'Joseph task', {assigneeUserId: 'human-jk'})]},
          'agent-sara': {[taskBoardStandardLaneId]: []},
          [ASSIGNEE_UNASSIGNED_COLUMN_ID]: {[taskBoardStandardLaneId]: []},
        }}
        groupBy='assignee'
        mode='light'
        onCreateTask={vi.fn()}
        onMoveAssignee={onMoveAssignee}
        onMoveTask={onMoveTask}
        onOpenTask={vi.fn()}
        projectMembers={[memberJoseph]}
        statusOptions={statusOptions}
      />,
    )

    await act(async () => {
      await dragCallbacks.onDragEnd?.({
        active: {id: 'card-1'},
        over: {id: `lane:agent-sara:${taskBoardStandardLaneId}`},
      })
    })

    expect(onMoveAssignee).toHaveBeenCalledWith({
      cardId: 'card-1',
      previousAssigneeUserId: 'human-jk',
      targetAssigneeUserId: 'agent-sara',
    })
    expect(onMoveTask).not.toHaveBeenCalled()
  })

  it('REG-2: drag onto a human column fires onMoveAssignee with the human user id (Phase 2a trigger no-ops server-side)', async () => {
    const onMoveAssignee = vi.fn().mockResolvedValue(true)

    const memberAlice: ProjectMember = {
      email: 'alice@example.com',
      githubLogin: null,
      id: 'human-alice',
      name: 'Alice',
    }

    render(
      <BoardView
        assignablePersonas={[personaSara]}
        boardColumns={[
          {accentColor: null, id: 'human-alice', kind: 'assignee', title: 'Alice'},
          {accentColor: null, id: 'human-jk', kind: 'assignee', title: 'Joseph'},
          {accentColor: 'orange', id: 'agent-sara', kind: 'assignee', title: 'Sara'},
          {accentColor: null, id: ASSIGNEE_UNASSIGNED_COLUMN_ID, kind: 'assignee', title: 'Unassigned'},
        ]}
        boardLanes={[]}
        boardTasks={{
          'human-alice': {[taskBoardStandardLaneId]: []},
          'human-jk': {[taskBoardStandardLaneId]: [createBoardTask('card-1', 'Joseph task', {assigneeUserId: 'human-jk'})]},
          'agent-sara': {[taskBoardStandardLaneId]: []},
          [ASSIGNEE_UNASSIGNED_COLUMN_ID]: {[taskBoardStandardLaneId]: []},
        }}
        groupBy='assignee'
        mode='light'
        onCreateTask={vi.fn()}
        onMoveAssignee={onMoveAssignee}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onOpenTask={vi.fn()}
        projectMembers={[memberAlice, memberJoseph]}
        statusOptions={statusOptions}
      />,
    )

    await act(async () => {
      await dragCallbacks.onDragEnd?.({
        active: {id: 'card-1'},
        over: {id: `lane:human-alice:${taskBoardStandardLaneId}`},
      })
    })

    expect(onMoveAssignee).toHaveBeenCalledWith({
      cardId: 'card-1',
      previousAssigneeUserId: 'human-jk',
      targetAssigneeUserId: 'human-alice',
    })
  })

  it('drop onto unassigned column passes targetAssigneeUserId=null', async () => {
    const onMoveAssignee = vi.fn().mockResolvedValue(true)

    render(
      <BoardView
        assignablePersonas={[]}
        boardColumns={[
          {accentColor: null, id: 'human-jk', kind: 'assignee', title: 'Joseph'},
          {accentColor: null, id: ASSIGNEE_UNASSIGNED_COLUMN_ID, kind: 'assignee', title: 'Unassigned'},
        ]}
        boardLanes={[]}
        boardTasks={{
          'human-jk': {[taskBoardStandardLaneId]: [createBoardTask('card-1', 'Joseph task', {assigneeUserId: 'human-jk'})]},
          [ASSIGNEE_UNASSIGNED_COLUMN_ID]: {[taskBoardStandardLaneId]: []},
        }}
        groupBy='assignee'
        mode='light'
        onCreateTask={vi.fn()}
        onMoveAssignee={onMoveAssignee}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onOpenTask={vi.fn()}
        projectMembers={[memberJoseph]}
        statusOptions={statusOptions}
      />,
    )

    await act(async () => {
      await dragCallbacks.onDragEnd?.({
        active: {id: 'card-1'},
        over: {id: `lane:${ASSIGNEE_UNASSIGNED_COLUMN_ID}:${taskBoardStandardLaneId}`},
      })
    })

    expect(onMoveAssignee).toHaveBeenCalledWith({
      cardId: 'card-1',
      previousAssigneeUserId: 'human-jk',
      targetAssigneeUserId: null,
    })
  })

  it('drag back to the same assignee column is a no-op', async () => {
    const onMoveAssignee = vi.fn().mockResolvedValue(true)

    render(
      <BoardView
        assignablePersonas={[]}
        boardColumns={[
          {accentColor: null, id: 'human-jk', kind: 'assignee', title: 'Joseph'},
        ]}
        boardLanes={[]}
        boardTasks={{
          'human-jk': {
            [taskBoardStandardLaneId]: [
              createBoardTask('card-1', 'Joseph task', {assigneeUserId: 'human-jk'}),
              createBoardTask('card-2', 'Joseph task 2', {assigneeUserId: 'human-jk'}),
            ],
          },
        }}
        groupBy='assignee'
        mode='light'
        onCreateTask={vi.fn()}
        onMoveAssignee={onMoveAssignee}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onOpenTask={vi.fn()}
        projectMembers={[memberJoseph]}
        statusOptions={statusOptions}
      />,
    )

    // Reorder within the same column - same previousAssigneeUserId
    // should no-op.
    await act(async () => {
      await dragCallbacks.onDragEnd?.({
        active: {id: 'card-1'},
        over: {id: 'card-2'},
      })
    })

    expect(onMoveAssignee).not.toHaveBeenCalled()
  })
})
