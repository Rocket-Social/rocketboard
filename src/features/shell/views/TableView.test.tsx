// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {type QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useRef, useState, type ComponentProps, type DragEvent as ReactDragEvent, type ReactElement} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../../test/queryClient'
import {ToastProvider} from '../../../components/ui/toast'
import type {CardRecord, CreateCardInput, ProjectStatusOption, TableGroupBy, TaskBoardMode} from '../../cards/card.types'
import type {ProjectTableGroup, ProjectTableTask} from '../../cards/card-view-mappers'
import type {ProjectGroupRecord} from '../../projects/project-group.types'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {TableView} from './TableView'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({count, estimateSize, getItemKey}: {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string
  }) => {
    let start = 0
    const virtualItems = Array.from({length: count}, (_, index) => {
      const size = estimateSize(index)
      const item = {
        index,
        key: getItemKey ? getItemKey(index) : index,
        size,
        start,
      }
      start += size
      return item
    })

    return {
      getTotalSize: () => virtualItems.reduce((total, item) => total + item.size, 0),
      getVirtualItems: () => virtualItems,
      scrollToIndex: vi.fn(),
    }
  },
}))

vi.mock('./DeleteGroupDialog', () => ({
  DeleteGroupDialog: () => null,
}))

vi.mock('./PropertySelectMenu', () => ({
  PropertySelectMenu: () => null,
}))

vi.mock('./SprintGroupHeader', () => ({
  BacklogGroupHeader: ({taskCount}: {taskCount: number}) => <div>{`Backlog (${taskCount})`}</div>,
  SprintGroupHeader: ({
    isConfigurationDisabled,
    sprint,
    taskCount,
  }: {
    isConfigurationDisabled?: boolean
    sprint: ProjectSprintRecord
    taskCount: number
  }) => (
    <div data-testid={`sprint-header-${sprint.id}`} data-disabled={String(Boolean(isConfigurationDisabled))}>
      {`${sprint.name} (${taskCount})`}
    </div>
  ),
}))

vi.mock('./TableGroupSummaryRow', () => ({
  defaultCalcConfig: {},
  TableGroupSummaryRow: () => <div data-testid='group-summary' />,
}))

vi.mock('./TableTaskRow', () => ({
  TableTaskRow: ({
    children,
    onDragEnd,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
    task,
  }: {
    children?: ReactElement | ReactElement[]
    onDragEnd?: (event: ReactDragEvent<HTMLDivElement>) => void
    onDragLeave?: (event: ReactDragEvent<HTMLDivElement>) => void
    onDragOver?: (event: ReactDragEvent<HTMLDivElement>) => void
    onDragStart?: (event: ReactDragEvent<HTMLDivElement>) => void
    onDrop?: (event: ReactDragEvent<HTMLDivElement>) => void
    task: ProjectTableTask
  }) => (
    <div
      data-testid={`task-row-${task.id}`}
      draggable
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <span>{task.title}</span>
      {children}
    </div>
  ),
}))

vi.mock('./TaskContextMenu', () => ({
  TaskContextMenu: () => null,
}))

vi.mock('./useColumnResize', () => ({
  useColumnResize: () => ({
    startResize: vi.fn(),
  }),
}))

const defaultStatusOptions: ProjectStatusOption[] = [
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
    assigneeName: 'Alex Lane',
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

function createTask(id: string, title: string, overrides: Partial<CardRecord> = {}): ProjectTableTask {
  return {
    assignee: 'AL',
    card: createCard(id, title, overrides),
    completed: false,
    dueDate: '',
    effort: null,
    id,
    priority: 'None',
    status: 'To Do',
    title,
  }
}

function createGroup(
  id: string,
  title: string,
  tasks: ProjectTableTask[] = [],
  sprint?: ProjectSprintRecord | null,
  overrides: Partial<ProjectTableGroup> = {},
): ProjectTableGroup {
  const inferredGroup: Pick<ProjectTableGroup, 'createDefaults' | 'kind' | 'level' | 'moveTarget'> = id === '__flat'
    ? {
        createDefaults: {groupId: null},
        kind: 'flat',
        level: 0,
        moveTarget: {groupId: null},
      }
    : id === '__backlog'
      ? {
          createDefaults: {sprintId: null},
          kind: 'backlog',
          level: 0,
          moveTarget: {sprintId: null},
        }
      : sprint
        ? {
            createDefaults: {sprintId: sprint.id},
            kind: 'sprint',
            level: 0,
            moveTarget: {sprintId: sprint.id},
          }
        : {
            createDefaults: {groupId: id},
            kind: 'group',
            level: 0,
            moveTarget: {groupId: id},
          }

  return {
    ...inferredGroup,
    id,
    sprint,
    tasks,
    title,
    ...overrides,
  }
}

function createGroupRecord(id: string, label: string): ProjectGroupRecord {
  return {
    createdAt: '2026-04-05T12:00:00.000Z',
    id,
    label,
    position: 0,
    projectId: 'project-1',
    updatedAt: '2026-04-05T12:00:00.000Z',
  }
}

function createSprintRecord(id: string, name: string): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    endDate: '2026-04-11',
    goal: null,
    id,
    name,
    position: 0,
    projectId: 'project-1',
    startDate: '2026-04-05',
    status: 'planned',
    updatedAt: '2026-04-05T12:00:00.000Z',
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, reject, resolve}
}

function appendTaskToGroup(groups: ProjectTableGroup[], groupId: string, task: ProjectTableTask) {
  return groups.map((group) =>
    group.id === groupId
      ? {...group, tasks: [...group.tasks, task]}
      : group,
  )
}

function removeTaskFromGroups(groups: ProjectTableGroup[], taskId: string) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => task.id !== taskId),
  }))
}

function Providers({children, queryClient}: {children: ReactElement; queryClient: QueryClient}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </QueryClientProvider>
  )
}

function buildProps(overrides: Partial<ComponentProps<typeof TableView>> = {}): ComponentProps<typeof TableView> {
  return {
    columnWidths: {},
    customFields: [],
    expandedGroups: [],
    groupBy: 'group',
    onOpenTask: vi.fn(),
    onToggleGroup: vi.fn(),
    onToggleTaskSelection: vi.fn(),
    priorityOptions: [],
    projectGroups: [],
    projectId: 'project-1',
    selectedTaskIds: [],
    setDraft: vi.fn(),
    sort: [],
    statusOptions: defaultStatusOptions,
    taskMode: 'standard',
    tableGroups: [],
    visibleFieldKeys: [],
    ...overrides,
  }
}

function renderTableView(overrides: Partial<ComponentProps<typeof TableView>> = {}) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      mutations: {retry: false},
      queries: {retry: false},
    },
  })
  const initialProps = buildProps(overrides)
  const view = render(
    <Providers queryClient={queryClient}>
      <TableView {...initialProps} />
    </Providers>,
  )

  return {
    ...view,
    rerenderTableView(nextOverrides: Partial<ComponentProps<typeof TableView>>) {
      const nextProps = buildProps({...initialProps, ...nextOverrides})
      view.rerender(
        <Providers queryClient={queryClient}>
          <TableView {...nextProps} />
        </Providers>,
      )
    },
  }
}

function FailingInlineCreateHarness({
  failure,
  groupBy = 'group',
  initialGroups,
  projectGroups = [],
  projectSprints = [],
  taskMode = 'standard',
}: {
  failure: ReturnType<typeof createDeferred<void>>
  groupBy?: TableGroupBy
  initialGroups: ProjectTableGroup[]
  projectGroups?: ProjectGroupRecord[]
  projectSprints?: ProjectSprintRecord[]
  taskMode?: TaskBoardMode
}) {
  const [tableGroups, setTableGroups] = useState(initialGroups)
  const nextOptimisticIdRef = useRef(0)

  return (
    <TableView
      {...buildProps({
        expandedGroups: initialGroups.map((group) => group.id),
        groupBy,
        onInlineCreateTask: async (input: CreateCardInput, targetGroupId?: string | null) => {
          nextOptimisticIdRef.current += 1
          const optimisticId = `optimistic-${nextOptimisticIdRef.current}`
          const targetGroupIdOrFallback = targetGroupId ?? (taskMode === 'sprint' ? '__backlog' : '__flat')
          const optimisticTask = createTask(optimisticId, input.title, {
            groupId: targetGroupId ?? null,
            sprintId: input.sprintId ?? null,
          })

          setTableGroups((current) => appendTaskToGroup(current, targetGroupIdOrFallback, optimisticTask))

          try {
            await failure.promise
          } finally {
            setTableGroups((current) => removeTaskFromGroups(current, optimisticId))
          }
        },
        projectGroups,
        projectSprints,
        taskMode,
        tableGroups,
      })}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('TableView sprint empty state', () => {
  it('does not claim the project has no sprints when sprint data is temporarily unavailable', () => {
    renderTableView({
      isSprintDataUnavailable: true,
      projectSprints: [],
      taskMode: 'sprint',
    })

    expect(screen.queryByText('No sprints yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Create Sprint'})).not.toBeInTheDocument()
  })

  it('disables sprint actions for inferred fallback sprint groups', () => {
    renderTableView({
      expandedGroups: ['sprint-1'],
      groupBy: 'group',
      tableGroups: [
        createGroup('sprint-1', 'Sprint unavailable', [
          createTask('task-1', 'Recovered task', {sprintId: 'sprint-1'}),
        ], {
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
        } as ProjectSprintRecord),
      ],
      taskMode: 'sprint',
    })

    expect(screen.getByTestId('sprint-header-sprint-1')).toHaveAttribute('data-disabled', 'true')
  })

  it('does not offer inline task creation inside inferred sprint subgroups', () => {
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

    renderTableView({
      expandedGroups: ['sprint-1', 'sprint-1::status-1'],
      groupBy: 'status',
      onInlineCreateTask: vi.fn(),
      taskMode: 'sprint',
      tableGroups: [
        createGroup('sprint-1', 'Sprint unavailable', [], inferredSprint),
        createGroup('sprint-1::status-1', 'To Do', [], inferredSprint, {
          createDefaults: {sprintId: 'sprint-1', statusOptionId: 'status-1'},
          kind: 'subgroup',
          level: 1,
          moveTarget: {sprintId: 'sprint-1', statusOptionId: 'status-1'},
          parentGroupId: 'sprint-1',
        }),
      ],
    })

    expect(screen.queryByPlaceholderText('Add task...')).not.toBeInTheDocument()
  })
})

describe('TableView inline task creation', () => {
  it('moves a task into an empty named group when dropped on that group composer row', () => {
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    const onMoveTask = vi.fn()
    const dataTransfer = {effectAllowed: 'none'}

    renderTableView({
      expandedGroups: ['group-1', 'group-2'],
      groupBy: 'group',
      onInlineCreateTask,
      onMoveTask,
      projectGroups: [
        createGroupRecord('group-1', 'Current work'),
        createGroupRecord('group-2', 'Empty bucket'),
      ],
      tableGroups: [
        createGroup('group-1', 'Current work', [
          createTask('task-1', 'Dragged task', {groupId: 'group-1'}),
        ]),
        createGroup('group-2', 'Empty bucket'),
      ],
    })

    fireEvent.dragStart(screen.getByTestId('task-row-task-1'), {dataTransfer})
    const dropZone = document.querySelector('[data-inline-create-group-id="group-2"]')
    expect(dropZone).not.toBeNull()
    fireEvent.dragOver(dropZone!)
    fireEvent.drop(dropZone!)

    expect(onMoveTask).toHaveBeenCalledWith('task-1', 0, 'group-2')
  })

  it('does not append to the end when dropped on a populated group header', () => {
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    const onMoveTask = vi.fn()
    const dataTransfer = {effectAllowed: 'none'}

    renderTableView({
      expandedGroups: ['group-1', 'group-2'],
      groupBy: 'group',
      onInlineCreateTask,
      onMoveTask,
      projectGroups: [
        createGroupRecord('group-1', 'Current work'),
        createGroupRecord('group-2', 'Target group'),
      ],
      tableGroups: [
        createGroup('group-1', 'Current work', [
          createTask('task-1', 'Dragged task', {groupId: 'group-1'}),
        ]),
        createGroup('group-2', 'Target group', [
          createTask('task-2', 'Existing task', {groupId: 'group-2'}),
        ]),
      ],
    })

    fireEvent.dragStart(screen.getByTestId('task-row-task-1'), {dataTransfer})
    const header = screen.getByText('Target group').closest('[draggable="true"]')
    expect(header).not.toBeNull()
    fireEvent.dragOver(header!)
    fireEvent.drop(header!)

    expect(onMoveTask).not.toHaveBeenCalled()
  })

  it('keeps focus in the composer after the first task is inserted into an empty named group', async () => {
    const user = userEvent.setup()
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    const group = createGroup('group-1', 'Sprint 1')
    const {rerenderTableView} = renderTableView({
      expandedGroups: ['group-1'],
      groupBy: 'group',
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [group],
    })

    const input = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    await user.type(input, 'First task')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(onInlineCreateTask).toHaveBeenCalledTimes(1))
    expect(onInlineCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'project-1', title: 'First task'}),
      'group-1',
    )

    rerenderTableView({
      expandedGroups: ['group-1'],
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [createGroup('group-1', 'Sprint 1', [
        createTask('task-1', 'First task', {groupId: 'group-1'}),
      ])],
    })

    const inputAfter = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    expect(inputAfter).toBe(input)
    await waitFor(() => expect(inputAfter).toHaveFocus())
    expect(inputAfter).toHaveValue('')
    expect(screen.getByTestId('task-row-task-1')).toBeInTheDocument()
    expect(screen.getByTestId('group-summary')).toBeInTheDocument()
  })

  it('keeps the flat composer mounted after the first ungrouped task is inserted', async () => {
    const user = userEvent.setup()
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    const {rerenderTableView} = renderTableView({
      groupBy: 'group',
      onInlineCreateTask,
      tableGroups: [createGroup('__flat', '', [])],
    })

    const input = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    await user.type(input, 'Inbox task')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(onInlineCreateTask).toHaveBeenCalledTimes(1))
    expect(onInlineCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'project-1', title: 'Inbox task'}),
      null,
    )

    rerenderTableView({
      onInlineCreateTask,
      tableGroups: [createGroup('__flat', '', [
        createTask('task-1', 'Inbox task'),
      ])],
    })

    const inputAfter = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    expect(inputAfter).toBe(input)
    await waitFor(() => expect(inputAfter).toHaveFocus())
    expect(inputAfter).toHaveValue('')
    expect(screen.getByTestId('task-row-task-1')).toBeInTheDocument()
  })

  it('keeps focus in sprint grouping after backlog creates a task', async () => {
    const user = userEvent.setup()
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    const backlogRoot = createGroup('__backlog', 'Backlog')
    const backlogLeaf = createGroup('__backlog::__flat', 'Backlog', [], null, {
      createDefaults: {groupId: null, sprintId: null},
      kind: 'flat',
      level: 1,
      moveTarget: {groupId: null, sprintId: null},
      parentGroupId: '__backlog',
    })
    const {rerenderTableView} = renderTableView({
      expandedGroups: ['__backlog', '__backlog::__flat'],
      groupBy: 'group',
      onInlineCreateTask,
      taskMode: 'sprint',
      tableGroups: [backlogRoot, backlogLeaf],
    })

    const input = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    await user.type(input, 'Backlog task')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(onInlineCreateTask).toHaveBeenCalledTimes(1))
    expect(onInlineCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'project-1', sprintId: null, title: 'Backlog task'}),
      null,
    )

    rerenderTableView({
      expandedGroups: ['__backlog', '__backlog::__flat'],
      groupBy: 'group',
      onInlineCreateTask,
      taskMode: 'sprint',
      tableGroups: [
        createGroup('__backlog', 'Backlog', [createTask('task-1', 'Backlog task')]),
        createGroup('__backlog::__flat', 'Backlog', [
          createTask('task-1', 'Backlog task'),
        ], null, {
          createDefaults: {groupId: null, sprintId: null},
          kind: 'flat',
          level: 1,
          moveTarget: {groupId: null, sprintId: null},
          parentGroupId: '__backlog',
        }),
      ],
    })

    const inputAfter = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    expect(inputAfter).toBe(input)
    await waitFor(() => expect(inputAfter).toHaveFocus())
    expect(inputAfter).toHaveValue('')
    expect(screen.getByTestId('task-row-task-1')).toBeInTheDocument()
    expect(screen.getByTestId('group-summary')).toBeInTheDocument()
  })

  it('renders a summary row at the bottom of each expanded sprint', () => {
    const sprint = createSprintRecord('sprint-1', 'Sprint 1')

    renderTableView({
      expandedGroups: ['sprint-1'],
      groupBy: 'group',
      taskMode: 'sprint',
      tableGroups: [
        createGroup('sprint-1', 'Sprint 1', [
          createTask('task-1', 'Sprint task', {sprintId: sprint.id}),
        ], sprint),
        createGroup('sprint-1::__flat', '', [
          createTask('task-1', 'Sprint task', {sprintId: sprint.id}),
        ], sprint, {
          createDefaults: {groupId: null, sprintId: sprint.id},
          kind: 'flat',
          level: 1,
          moveTarget: {groupId: null, sprintId: sprint.id},
          parentGroupId: 'sprint-1',
        }),
      ],
    })

    const summaries = screen.getAllByTestId('group-summary')
    expect(summaries).toHaveLength(1)
    expect(screen.getByText('Sprint 1 (1)')).toBeInTheDocument()
    expect(screen.getByTestId('task-row-task-1')).toBeInTheDocument()
  })

  it('does not duplicate the sprint summary when the sprint contains a named subgroup', () => {
    const sprint = createSprintRecord('sprint-1', 'Sprint 1')

    renderTableView({
      expandedGroups: ['sprint-1', 'sprint-1::group-1'],
      groupBy: 'group',
      taskMode: 'sprint',
      tableGroups: [
        createGroup('sprint-1', 'Sprint 1', [
          createTask('task-1', 'Sprint task', {groupId: 'group-1', sprintId: sprint.id}),
        ], sprint),
        createGroup('sprint-1::group-1', 'Sprint 1 (5 Apr - 11 Apr)', [
          createTask('task-1', 'Sprint task', {groupId: 'group-1', sprintId: sprint.id}),
        ], sprint, {
          createDefaults: {groupId: 'group-1', sprintId: sprint.id},
          kind: 'subgroup',
          level: 1,
          moveTarget: {groupId: 'group-1', sprintId: sprint.id},
          parentGroupId: 'sprint-1',
        }),
      ],
    })

    expect(screen.getAllByTestId('group-summary')).toHaveLength(1)
    expect(screen.getByText('Sprint 1 (1)')).toBeInTheDocument()
    expect(screen.getByText('Sprint 1 (5 Apr - 11 Apr)')).toBeInTheDocument()
  })

  it('dedupes Enter followed by blur to a single inline create', async () => {
    const user = userEvent.setup()
    const onInlineCreateTask = vi.fn(() => new Promise<void>(() => undefined))
    renderTableView({
      expandedGroups: ['group-1'],
      groupBy: 'group',
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [createGroup('group-1', 'Sprint 1')],
    })

    const input = screen.getByPlaceholderText('Add task...')
    await user.type(input, 'Deduped task')

    fireEvent.keyDown(input, {key: 'Enter'})
    fireEvent.blur(input)

    expect(onInlineCreateTask).toHaveBeenCalledTimes(1)
  })

  it('allows another Enter submission while the previous create is still in flight', async () => {
    const user = userEvent.setup()
    const firstCreate = createDeferred<void>()
    const secondCreate = createDeferred<void>()
    const onInlineCreateTask = vi.fn()
      .mockImplementationOnce(() => firstCreate.promise)
      .mockImplementationOnce(() => secondCreate.promise)

    renderTableView({
      expandedGroups: ['group-1'],
      groupBy: 'group',
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [createGroup('group-1', 'Sprint 1')],
    })

    const input = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    await user.type(input, 'Task 1')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(input).toHaveValue(''))

    await user.type(input, 'Task 2')
    await user.keyboard('{Enter}')

    expect(onInlineCreateTask).toHaveBeenCalledTimes(2)
    expect(onInlineCreateTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({projectId: 'project-1', title: 'Task 1'}),
      'group-1',
    )
    expect(onInlineCreateTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({projectId: 'project-1', title: 'Task 2'}),
      'group-1',
    )

    await act(async () => {
      firstCreate.resolve()
      secondCreate.resolve()
    })
  })
  it('does not submit when Enter is pressed on an empty draft', () => {
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    renderTableView({
      expandedGroups: ['group-1'],
      groupBy: 'group',
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [createGroup('group-1', 'Sprint 1')],
    })

    fireEvent.keyDown(screen.getByPlaceholderText('Add task...'), {key: 'Enter'})

    expect(onInlineCreateTask).not.toHaveBeenCalled()
  })

  it('still creates a task on blur', async () => {
    const user = userEvent.setup()
    const onInlineCreateTask = vi.fn().mockResolvedValue(undefined)
    renderTableView({
      expandedGroups: ['group-1'],
      groupBy: 'group',
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [createGroup('group-1', 'Sprint 1')],
    })

    const input = screen.getByPlaceholderText('Add task...')
    await user.type(input, 'Blur task')
    fireEvent.blur(input)

    await waitFor(() => expect(onInlineCreateTask).toHaveBeenCalledTimes(1))
    expect(onInlineCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'project-1', title: 'Blur task'}),
      'group-1',
    )
  })

  it('restores the draft, removes the optimistic row, and refocuses after a failed create', async () => {
    const user = userEvent.setup()
    const failure = createDeferred<void>()
    const queryClient = createTestQueryClient({
      defaultOptions: {
        mutations: {retry: false},
        queries: {retry: false},
      },
    })

    render(
      <Providers queryClient={queryClient}>
        <FailingInlineCreateHarness
          failure={failure}
          initialGroups={[createGroup('group-1', 'Sprint 1')]}
          projectGroups={[createGroupRecord('group-1', 'Sprint 1')]}
        />
      </Providers>,
    )

    const input = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    await user.type(input, 'Broken task')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByTestId('task-row-optimistic-1')).toBeInTheDocument())

    await act(async () => {
      failure.reject(new Error('Network down'))
    })

    await waitFor(() => expect(screen.queryByTestId('task-row-optimistic-1')).not.toBeInTheDocument())
    await waitFor(() => expect(input).toHaveValue('Broken task'))
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByText('Could not create task')).toBeInTheDocument()
    expect(screen.getByText('Network down')).toBeInTheDocument()
  })

  it('does not overwrite a newer draft when an earlier create fails', async () => {
    const user = userEvent.setup()
    const firstCreate = createDeferred<void>()
    const onInlineCreateTask = vi.fn()
      .mockImplementationOnce(() => firstCreate.promise)

    renderTableView({
      expandedGroups: ['group-1'],
      groupBy: 'group',
      onInlineCreateTask,
      projectGroups: [createGroupRecord('group-1', 'Sprint 1')],
      tableGroups: [createGroup('group-1', 'Sprint 1')],
    })

    const input = screen.getByPlaceholderText('Add task...') as HTMLInputElement
    await user.type(input, 'Task 1')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(input).toHaveValue(''))

    await user.type(input, 'Task 2')

    await act(async () => {
      firstCreate.reject(new Error('Network down'))
    })

    await waitFor(() => expect(input).toHaveValue('Task 2'))
    expect(screen.getByText('Could not create task')).toBeInTheDocument()
  })
})

describe('TableView inline group creation', () => {
  it('opens an empty autofocused placeholder instead of prefilled text', async () => {
    const user = userEvent.setup()
    const onAddGroup = vi.fn().mockResolvedValue('group-1')

    renderTableView({onAddGroup})

    await user.click(screen.getByRole('button', {name: 'Add group'}))

    const input = screen.getByPlaceholderText('Add group...') as HTMLInputElement
    expect(input).toHaveFocus()
    expect(input).toHaveValue('')
    expect(onAddGroup).not.toHaveBeenCalled()
  })

  it('creates a group from the entered draft', async () => {
    const user = userEvent.setup()
    const onAddGroup = vi.fn().mockResolvedValue('group-1')

    renderTableView({onAddGroup})

    await user.click(screen.getByRole('button', {name: 'Add group'}))
    const input = screen.getByPlaceholderText('Add group...') as HTMLInputElement
    await user.type(input, 'Roadmap')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(onAddGroup).toHaveBeenCalledWith('Roadmap'))
    expect(screen.queryByPlaceholderText('Add group...')).not.toBeInTheDocument()
  })
})
