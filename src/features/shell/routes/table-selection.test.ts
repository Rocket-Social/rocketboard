import {describe, expect, it} from 'vitest'

import type {ProjectTableGroup, ProjectTableTask} from '../../cards/card-view-mappers'
import type {CardRecord} from '../../cards/card.types'
import {getVisibleTableTaskIds, toggleTableTaskSelection} from './table-selection'

function createCard(id: string, title: string): CardRecord {
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
  }
}

function createTask(id: string, title: string): ProjectTableTask {
  return {
    assignee: 'AL',
    card: createCard(id, title),
    completed: false,
    dueDate: '',
    effort: null,
    id,
    priority: 'None',
    status: 'To Do',
    title,
  }
}

function createGroup(overrides: Partial<ProjectTableGroup> & Pick<ProjectTableGroup, 'id' | 'tasks' | 'title'>): ProjectTableGroup {
  return {
    createDefaults: {},
    expanded: true,
    kind: 'group',
    level: 0,
    ...overrides,
  }
}

describe('table selection helpers', () => {
  it('uses the rendered child-group order for sprint selections', () => {
    const taskA = createTask('task-a', 'Alpha')
    const taskB = createTask('task-b', 'Beta')
    const taskC = createTask('task-c', 'Gamma')

    const tableGroups: ProjectTableGroup[] = [
      createGroup({
        id: 'sprint-1',
        kind: 'sprint',
        tasks: [taskB, taskC, taskA],
        title: 'Sprint 1',
      }),
      createGroup({
        id: 'sprint-1::__flat',
        kind: 'flat',
        level: 1,
        parentGroupId: 'sprint-1',
        tasks: [taskA, taskB, taskC],
        title: '',
      }),
    ]

    const visibleTaskIds = getVisibleTableTaskIds(tableGroups, ['sprint-1', 'sprint-1::__flat'], 'sprint')

    expect(visibleTaskIds).toEqual(['task-a', 'task-b', 'task-c'])
    expect(toggleTableTaskSelection(['task-a'], 'task-c', visibleTaskIds, true)).toEqual([
      'task-a',
      'task-b',
      'task-c',
    ])
  })

  it('skips tasks from collapsed groups when building a shift-click range', () => {
    const tableGroups: ProjectTableGroup[] = [
      createGroup({
        id: '__flat',
        kind: 'flat',
        tasks: [createTask('task-a', 'Alpha')],
        title: '',
      }),
      createGroup({
        id: 'group-hidden',
        tasks: [createTask('task-hidden', 'Hidden')],
        title: 'Hidden',
      }),
      createGroup({
        id: 'group-visible',
        tasks: [createTask('task-b', 'Beta')],
        title: 'Visible',
      }),
    ]

    const visibleTaskIds = getVisibleTableTaskIds(tableGroups, ['group-visible'], 'standard')

    expect(visibleTaskIds).toEqual(['task-a', 'task-b'])
    expect(toggleTableTaskSelection(['task-a'], 'task-b', visibleTaskIds, true)).toEqual(['task-a', 'task-b'])
  })

  it('falls back to a single-task toggle when shift-click has no anchor yet', () => {
    expect(toggleTableTaskSelection([], 'task-a', ['task-a', 'task-b'], true)).toEqual(['task-a'])
  })

  it('falls back to a single-task toggle when the previous anchor is no longer visible', () => {
    expect(toggleTableTaskSelection(['task-hidden'], 'task-b', ['task-a', 'task-b'], true)).toEqual([
      'task-hidden',
      'task-b',
    ])
  })
})
