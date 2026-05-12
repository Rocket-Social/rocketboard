import {describe, expect, it} from 'vitest'

import {
  ASSIGNEE_UNASSIGNED_COLUMN_ID,
  buildAssigneeBoardTasks,
  buildBoardTasks,
  buildGanttTasks,
  buildTableGroups,
  taskBoardBacklogId,
  taskBoardStandardLaneId,
} from './card-view-mappers'
import type {CardRecord, ProjectStatusOption} from './card.types'
import type {AssignablePersona} from '../ai/agent.types'
import type {ProjectMember} from '../access/access.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'

const testStatusOptions: ProjectStatusOption[] = [
  {id: 'opt-todo', key: 'todo', label: 'To Do', category: 'not_started', position: 0, isDefault: true, color: null},
  {id: 'opt-in-progress', key: 'in_progress', label: 'In Progress', category: 'started', position: 0, isDefault: false, color: null},
  {id: 'opt-in-review', key: 'in_review', label: 'In Review', category: 'started', position: 1, isDefault: false, color: null},
  {id: 'opt-done', key: 'done', label: 'Done', category: 'completed', position: 0, isDefault: false, color: null},
  {id: 'opt-blocked', key: 'blocked', label: 'Blocked', category: 'not_started', position: 1, isDefault: false, color: null},
]

function makeCard(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Test User',
    assigneeUserId: null,
    bodyJson: {type: 'doc', content: []},
    bodyMd: '',
    completedAt: null,
    createdAt: new Date().toISOString(),
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: `card-${Math.random().toString(36).slice(2, 8)}`,
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: null,
    startAt: null,
    statusOptionId: 'opt-todo',
    statusPosition: 0,
    tags: [],
    title: 'Test Card',
    ...overrides,
  }
}

describe('buildTableGroups', () => {
  it('returns all 5 status groups even with 0 cards', () => {
    const groups = buildTableGroups([], 'status', [], [], testStatusOptions)

    expect(groups).toHaveLength(5)
    expect(groups.map((g) => g.title)).toEqual(['In Progress', 'In Review', 'To Do', 'Blocked', 'Done'])
    expect(groups.every((g) => g.tasks.length === 0)).toBe(true)
  })

  it('returns priority groups from options even with 0 cards', () => {
    const priorityOptions = [
      {color: 'red', id: 'p-urgent', isDefault: false, key: 'urgent', label: 'Urgent', sortOrder: 0},
      {color: 'amber', id: 'p-high', isDefault: false, key: 'high', label: 'High', sortOrder: 1},
      {color: 'blue', id: 'p-medium', isDefault: true, key: 'medium', label: 'Medium', sortOrder: 2},
      {color: 'gray', id: 'p-low', isDefault: false, key: 'low', label: 'Low', sortOrder: 3},
    ]
    const groups = buildTableGroups([], 'priority', [], [], [], priorityOptions)

    expect(groups).toHaveLength(4)
    expect(groups.map((g) => g.title)).toEqual(['Urgent', 'High', 'Medium', 'Low'])
    expect(groups.every((g) => g.tasks.length === 0)).toBe(true)
  })

  it('places cards into the correct status group', () => {
    const cards = [
      makeCard({statusOptionId: 'opt-todo', title: 'A'}),
      makeCard({statusOptionId: 'opt-done', title: 'B'}),
      makeCard({statusOptionId: 'opt-todo', title: 'C'}),
    ]
    const groups = buildTableGroups(cards, 'status', [], [], testStatusOptions)

    expect(groups.find((g) => g.title === 'To Do')?.tasks).toHaveLength(2)
    expect(groups.find((g) => g.title === 'Done')?.tasks).toHaveLength(1)
    expect(groups.find((g) => g.title === 'In Progress')?.tasks).toHaveLength(0)
  })

  it('respects collapsed groups', () => {
    const groups = buildTableGroups([], 'status', ['opt-todo', 'opt-done'], [], testStatusOptions)

    expect(groups.find((g) => g.id === 'opt-todo')?.expanded).toBe(false)
    expect(groups.find((g) => g.id === 'opt-done')?.expanded).toBe(false)
    expect(groups.find((g) => g.id === 'opt-in-progress')?.expanded).toBe(true)
  })

  it('places cards into the correct priority group', () => {
    const priorityOptions = [
      {color: 'red', id: 'p-urgent', isDefault: false, key: 'urgent', label: 'Urgent', sortOrder: 0},
      {color: 'amber', id: 'p-high', isDefault: false, key: 'high', label: 'High', sortOrder: 1},
      {color: 'gray', id: 'p-low', isDefault: false, key: 'low', label: 'Low', sortOrder: 3},
    ]
    const cards = [
      makeCard({priorityOptionId: 'p-urgent', title: 'A'}),
      makeCard({priorityOptionId: 'p-low', title: 'B'}),
    ]
    const groups = buildTableGroups(cards, 'priority', [], [], [], priorityOptions)

    expect(groups.find((g) => g.title === 'Urgent')?.tasks).toHaveLength(1)
    expect(groups.find((g) => g.title === 'Low')?.tasks).toHaveLength(1)
    expect(groups.find((g) => g.title === 'High')?.tasks).toHaveLength(0)
  })

  it('keeps newly added tasks at the bottom of mixed-status groups', () => {
    const projectGroups: ProjectGroupRecord[] = [{
      createdAt: '2026-03-25T09:55:00.000Z',
      id: 'group-a',
      label: 'Alpha',
      position: 0,
      projectId: 'project-1',
      updatedAt: '2026-03-25T09:55:00.000Z',
    }]
    const cards = [
      makeCard({
        createdAt: '2026-03-25T10:00:00.000Z',
        groupId: 'group-a',
        groupPosition: 0,
        id: 'todo-0',
        statusPosition: 0,
        title: 'Rahul',
      }),
      makeCard({
        createdAt: '2026-03-25T10:05:00.000Z',
        groupId: 'group-a',
        groupPosition: 1,
        id: 'progress-0',
        statusOptionId: 'opt-in-progress',
        statusPosition: 0,
        title: 'New game design',
      }),
      makeCard({
        createdAt: '2026-03-25T10:06:00.000Z',
        groupId: 'group-a',
        groupPosition: 2,
        id: 'progress-1',
        statusOptionId: 'opt-in-progress',
        statusPosition: 1,
        title: 'new task',
      }),
      makeCard({
        createdAt: '2026-03-25T10:07:00.000Z',
        groupId: 'group-a',
        groupPosition: 3,
        id: 'review-0',
        statusOptionId: 'opt-in-review',
        statusPosition: 0,
        title: 'ESOP update',
      }),
      makeCard({
        createdAt: '2026-03-25T10:08:00.000Z',
        groupId: 'group-a',
        groupPosition: 4,
        id: 'review-1',
        statusOptionId: 'opt-in-review',
        statusPosition: 1,
        title: 'Lila strategy',
      }),
      makeCard({
        createdAt: '2026-03-25T10:09:00.000Z',
        groupId: 'group-a',
        groupPosition: 5,
        id: 'todo-1',
        statusPosition: 1,
        title: '1',
      }),
      makeCard({
        createdAt: '2026-03-25T10:10:00.000Z',
        groupId: 'group-a',
        groupPosition: 6,
        id: 'todo-2',
        statusPosition: 2,
        title: '2',
      }),
      makeCard({
        createdAt: '2026-03-25T10:11:00.000Z',
        groupId: 'group-a',
        groupPosition: 7,
        id: 'todo-3',
        statusPosition: 3,
        title: '3',
      }),
    ]

    const groups = buildTableGroups(cards, 'group', [], projectGroups)

    expect(groups.find((group) => group.id === 'group-a')?.tasks.map((task) => task.title)).toEqual([
      'Rahul',
      'New game design',
      'new task',
      'ESOP update',
      'Lila strategy',
      '1',
      '2',
      '3',
    ])
  })
})

function makeSprint(overrides: Partial<ProjectSprintRecord> = {}): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-03-25T10:00:00.000Z',
    endDate: null,
    goal: null,
    id: `sprint-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Sprint',
    position: 0,
    projectId: 'project-1',
    startDate: null,
    status: 'planned',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  }
}

describe('buildTableGroups (sprint)', () => {
  it('groups cards by sprint_id, ungrouped cards go to Backlog', () => {
    const sprint1 = makeSprint({id: 'sprint-1', name: 'Sprint 1', status: 'planned'})
    const cards = [
      makeCard({sprintId: 'sprint-1', title: 'A'}),
      makeCard({sprintId: 'sprint-1', title: 'B'}),
      makeCard({sprintId: null, title: 'C'}),
    ]
    const groups = buildTableGroups(cards, 'group', [], [], testStatusOptions, [], [sprint1], 'sprint')

    expect(groups.find((g) => g.id === 'sprint-1')?.tasks).toHaveLength(2)
    expect(groups.find((g) => g.id === '__backlog')?.tasks).toHaveLength(1)
  })

  it('active sprint appears before planned sprints', () => {
    const planned = makeSprint({id: 'sprint-planned', name: 'Planned Sprint', status: 'planned'})
    const active = makeSprint({id: 'sprint-active', name: 'Active Sprint', status: 'active'})
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [planned, active], 'sprint')

    const ids = groups.map((g) => g.id)
    expect(ids.indexOf('sprint-active')).toBeLessThan(ids.indexOf('sprint-planned'))
  })

  it('planned sprints sort by start_date, nulls last', () => {
    const sprintA = makeSprint({id: 'sprint-a', name: 'Sprint A', startDate: '2026-04-01', status: 'planned'})
    const sprintB = makeSprint({id: 'sprint-b', name: 'Sprint B', startDate: '2026-03-15', status: 'planned'})
    const sprintC = makeSprint({id: 'sprint-c', name: 'Sprint C', startDate: null, status: 'planned'})
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [sprintC, sprintA, sprintB], 'sprint')

    const plannedIds = groups
      .filter((g) => g.level === 0 && g.id !== '__backlog')
      .map((g) => g.id)
    expect(plannedIds).toEqual(['sprint-b', 'sprint-a', 'sprint-c'])
  })

  it('backlog appears after sprint groups, including completed sprints', () => {
    const planned = makeSprint({id: 'sprint-planned', name: 'Planned', status: 'planned'})
    const completed = makeSprint({id: 'sprint-completed', name: 'Completed', status: 'completed', completedAt: '2026-03-20T00:00:00.000Z'})
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [planned, completed], 'sprint')

    const ids = groups.map((g) => g.id)
    expect(ids.indexOf('sprint-planned')).toBeLessThan(ids.indexOf('__backlog'))
    expect(ids.indexOf('sprint-completed')).toBeLessThan(ids.indexOf('__backlog'))
  })

  it('completed sprints appear after active sprints and before backlog', () => {
    const active = makeSprint({id: 'sprint-active', name: 'Active', status: 'active'})
    const completed = makeSprint({id: 'sprint-completed', name: 'Done', status: 'completed', completedAt: '2026-03-20T00:00:00.000Z'})
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [active, completed], 'sprint')

    const ids = groups.filter((g) => g.level === 0).map((g) => g.id)
    expect(ids).toEqual(['sprint-active', 'sprint-completed', '__backlog'])
  })

  it('preserves caller sprint order for scoped table selections', () => {
    const sprint3 = makeSprint({endDate: '2026-05-02', id: 'sprint-3', name: 'Sprint 3', startDate: '2026-04-26', status: 'active'})
    const sprint2 = makeSprint({endDate: '2026-04-25', id: 'sprint-2', name: 'Sprint 2', startDate: '2026-04-19', status: 'completed'})
    const sprint1 = makeSprint({endDate: '2026-04-18', id: 'sprint-1', name: 'Sprint 1', startDate: '2026-04-12', status: 'completed'})
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [sprint3, sprint2, sprint1], 'sprint', {sprintOrder: 'input'})

    expect(groups.filter((g) => g.level === 0 && g.kind === 'sprint').map((g) => g.id)).toEqual([
      'sprint-3',
      'sprint-2',
      'sprint-1',
    ])
  })

  it('empty sprint renders with zero tasks', () => {
    const sprint = makeSprint({id: 'sprint-empty', name: 'Empty Sprint', status: 'planned'})
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [sprint], 'sprint')

    expect(groups.find((g) => g.id === 'sprint-empty')?.tasks).toHaveLength(0)
  })

  it('sprint metadata is attached to group', () => {
    const sprint = makeSprint({
      endDate: '2026-04-15',
      goal: 'Ship v1',
      id: 'sprint-meta',
      name: 'Sprint Meta',
      startDate: '2026-04-01',
      status: 'active',
    })
    const groups = buildTableGroups([], 'group', [], [], testStatusOptions, [], [sprint], 'sprint')

    const group = groups.find((g) => g.id === 'sprint-meta')
    expect(group?.sprint).toBeDefined()
    expect(group?.sprint?.goal).toBe('Ship v1')
    expect(group?.sprint?.startDate).toBe('2026-04-01')
    expect(group?.sprint?.endDate).toBe('2026-04-15')
    expect(group?.sprint?.status).toBe('active')
  })

  it('cards with unknown sprint_id fall to Backlog', () => {
    const sprint = makeSprint({id: 'sprint-known', name: 'Known Sprint', status: 'planned'})
    const cards = [
      makeCard({sprintId: 'sprint-unknown', title: 'Orphan'}),
      makeCard({sprintId: 'sprint-known', title: 'Assigned'}),
    ]
    const groups = buildTableGroups(cards, 'group', [], [], testStatusOptions, [], [sprint], 'sprint')

    expect(groups.find((g) => g.id === '__backlog')?.tasks.map((t) => t.title)).toEqual(['Orphan'])
    expect(groups.find((g) => g.id === 'sprint-known')?.tasks.map((t) => t.title)).toEqual(['Assigned'])
  })

  it('collapsedGroupSet is respected', () => {
    const sprint = makeSprint({id: 'sprint-1', name: 'Sprint 1', status: 'planned'})
    const groups = buildTableGroups([], 'group', ['sprint-1', '__backlog'], [], testStatusOptions, [], [sprint], 'sprint')

    expect(groups.find((g) => g.id === 'sprint-1')?.expanded).toBe(false)
    expect(groups.find((g) => g.id === '__backlog')?.expanded).toBe(false)
  })

  it('applies secondary grouping inside each sprint partition', () => {
    const sprint = makeSprint({id: 'sprint-1', name: 'Sprint 1', status: 'planned'})
    const groups = buildTableGroups([
      makeCard({id: 'todo-card', sprintId: 'sprint-1', statusOptionId: 'opt-todo', title: 'Todo'}),
      makeCard({id: 'done-card', sprintId: 'sprint-1', statusOptionId: 'opt-done', title: 'Done'}),
    ], 'status', [], [], testStatusOptions, [], [sprint], 'sprint')

    expect(groups.find((g) => g.id === 'sprint-1')?.kind).toBe('sprint')
    expect(groups.find((g) => g.id === 'sprint-1::opt-todo')?.parentGroupId).toBe('sprint-1')
    expect(groups.find((g) => g.id === 'sprint-1::opt-todo')?.tasks.map((task) => task.id)).toEqual(['todo-card'])
    expect(groups.find((g) => g.id === 'sprint-1::opt-done')?.tasks.map((task) => task.id)).toEqual(['done-card'])
  })

  it('ignores project groups inside sprint mode when grouping by group', () => {
    const sprint = makeSprint({id: 'sprint-1', name: 'Sprint 1', status: 'planned'})
    const projectGroups: ProjectGroupRecord[] = [{
      createdAt: '2026-03-25T09:55:00.000Z',
      id: 'group-a',
      label: 'Alpha',
      position: 0,
      projectId: 'project-1',
      updatedAt: '2026-03-25T09:55:00.000Z',
    }]
    const groups = buildTableGroups([
      makeCard({createdAt: '2026-03-25T10:00:00.000Z', groupId: 'group-a', id: 'sprint-card', sprintId: 'sprint-1', title: 'Sprint task'}),
      makeCard({createdAt: '2026-03-25T10:05:00.000Z', groupId: 'group-a', id: 'backlog-card', sprintId: null, title: 'Backlog task'}),
    ], 'group', [], projectGroups, testStatusOptions, [], [sprint], 'sprint')

    expect(groups.find((g) => g.id === 'sprint-1::group-a')).toBeUndefined()
    expect(groups.find((g) => g.id === '__backlog::group-a')).toBeUndefined()
    expect(groups.find((g) => g.id === 'sprint-1::__flat')?.tasks.map((task) => task.id)).toEqual(['sprint-card'])
    expect(groups.find((g) => g.id === '__backlog::__flat')?.tasks.map((task) => task.id)).toEqual(['backlog-card'])
  })
})

describe('buildBoardTasks', () => {
  it('keeps sprint-scoped cards out of backlog when given synthesized sprint records', () => {
    const fallbackSprint = makeSprint({id: 'sprint-1', name: 'Sprint unavailable', status: 'planned'})
    const layout = buildBoardTasks([
      makeCard({id: 'sprint-card', sprintId: 'sprint-1', title: 'In sprint'}),
      makeCard({id: 'backlog-card', sprintId: null, title: 'In backlog'}),
    ], testStatusOptions, [], 'sprint', [fallbackSprint])

    expect(layout.lanes.map((lane) => lane.id)).toEqual(['sprint-1', taskBoardBacklogId])
    expect(layout.tasksByColumn['opt-todo']?.['sprint-1']?.map((task) => task.id)).toEqual(['sprint-card'])
    expect(layout.tasksByColumn['opt-todo']?.[taskBoardBacklogId]?.map((task) => task.id)).toEqual(['backlog-card'])
  })
})

describe('buildGanttTasks', () => {
  it('uses createdAt timestamps as the fallback start when startAt is missing', () => {
    const [task] = buildGanttTasks([
      makeCard({
        createdAt: '2026-03-25T21:35:46.000Z',
        dueAt: '2026-04-10',
        startAt: null,
      }),
    ], testStatusOptions)

    expect(task).toBeDefined()
    expect(task?.startWeek).toBe(3)
    expect(task?.endWeek).toBe(5)
  })
})

const memberJoseph: ProjectMember = {
  email: 'jk@example.com',
  githubLogin: null,
  id: 'human-jk',
  name: 'Joseph',
}
const memberAlice: ProjectMember = {
  email: 'alice@example.com',
  githubLogin: null,
  id: 'human-alice',
  name: 'Alice',
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
const personaAndy: AssignablePersona = {
  accentColor: 'violet',
  agentUserId: 'agent-andy',
  avatarUrl: null,
  id: 'persona-andy',
  name: 'Andy',
  role: 'assistant',
  slug: 'andy',
}

describe('buildAssigneeBoardTasks', () => {
  it('returns humans, agents, and unassigned columns in that order', () => {
    const layout = buildAssigneeBoardTasks([], [], [memberJoseph, memberAlice], [personaSara, personaAndy])

    expect(layout.columnMeta.map((meta) => meta.id)).toEqual([
      'human-alice',
      'human-jk',
      'agent-andy',
      'agent-sara',
      ASSIGNEE_UNASSIGNED_COLUMN_ID,
    ])
    expect(layout.columnMeta.find((meta) => meta.id === 'agent-sara')?.accent).toBe('agent')
    expect(layout.columnMeta.find((meta) => meta.id === 'human-jk')?.accent).toBe('neutral')
    expect(layout.lanes).toEqual([{id: taskBoardStandardLaneId, sprint: null, title: 'All tasks'}])
  })

  it('places agent-assigned cards in the persona column and humans in the human column', () => {
    const layout = buildAssigneeBoardTasks(
      [
        makeCard({assigneeUserId: 'agent-sara', id: 'card-1'}),
        makeCard({assigneeUserId: 'human-jk', id: 'card-2'}),
        makeCard({assigneeUserId: null, id: 'card-3'}),
      ],
      [],
      [memberJoseph],
      [personaSara],
    )

    expect(layout.tasksByColumn['agent-sara']?.[taskBoardStandardLaneId]?.map((task) => task.id)).toEqual([
      'card-1',
    ])
    expect(layout.tasksByColumn['human-jk']?.[taskBoardStandardLaneId]?.map((task) => task.id)).toEqual([
      'card-2',
    ])
    expect(
      layout.tasksByColumn[ASSIGNEE_UNASSIGNED_COLUMN_ID]?.[taskBoardStandardLaneId]?.map((task) => task.id),
    ).toEqual(['card-3'])
  })

  it('falls back to unassigned for cards whose assignee is neither a member nor a known agent', () => {
    const layout = buildAssigneeBoardTasks(
      [makeCard({assigneeUserId: 'unknown-user', id: 'card-stale'})],
      [],
      [memberJoseph],
      [personaSara],
    )

    expect(
      layout.tasksByColumn[ASSIGNEE_UNASSIGNED_COLUMN_ID]?.[taskBoardStandardLaneId]?.map((task) => task.id),
    ).toEqual(['card-stale'])
  })

  it('exposes persona accent color on the column meta so headers can paint persona accent', () => {
    const layout = buildAssigneeBoardTasks([], [], [], [personaSara, personaAndy])
    const sara = layout.columnMeta.find((meta) => meta.id === 'agent-sara')
    const andy = layout.columnMeta.find((meta) => meta.id === 'agent-andy')

    expect(sara?.accentColor).toBe('orange')
    expect(andy?.accentColor).toBe('violet')
  })
})
