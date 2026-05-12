import {describe, expect, it} from 'vitest'

import type {CardRecord} from '../cards/card.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {
  filterCardsByTaskScope,
  normalizeTaskScopeSprintIds,
  resolveCurrentTaskScopeSprint,
  resolveDefaultTaskScopeSprintIds,
  resolveTaskScopeDateWindow,
  resolveTaskScopeQuickSprints,
} from './task-scope'

function createCard(overrides: Partial<CardRecord>): CardRecord {
  return {
    assigneeName: 'Ada Lovelace',
    assigneeUserId: 'user-1',
    completedAt: null,
    createdAt: '2026-04-01T10:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: 'group-1',
    groupPosition: 0,
    id: `card-${Math.random()}`,
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: null,
    startAt: null,
    statusOptionId: null,
    statusPosition: 0,
    tags: [],
    title: 'Task',
    ...overrides,
  }
}

function createSprint(overrides: Partial<ProjectSprintRecord>): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    endDate: '2026-03-14',
    goal: null,
    id: `sprint-${Math.random()}`,
    name: 'Sprint',
    position: 0,
    projectId: 'project-1',
    startDate: '2026-03-01',
    status: 'planned',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('task-scope', () => {
  describe('resolveCurrentTaskScopeSprint', () => {
    it('prefers the active sprint over planned and completed sprints', () => {
      const activeSprint = createSprint({id: 'active', name: 'Sprint 11', status: 'active'})
      const current = resolveCurrentTaskScopeSprint([
        createSprint({id: 'completed', name: 'Sprint 10', status: 'completed'}),
        activeSprint,
        createSprint({id: 'planned', name: 'Sprint 12', status: 'planned'}),
      ])

      expect(current?.id).toBe('active')
      expect(resolveDefaultTaskScopeSprintIds([activeSprint])).toEqual(['active'])
    })
  })

  describe('resolveTaskScopeQuickSprints', () => {
    it('returns current sprint and the two previous sprints', () => {
      const quickSprints = resolveTaskScopeQuickSprints([
        createSprint({endDate: '2026-03-14', id: 'sprint-1', name: 'Sprint 1', startDate: '2026-03-01', status: 'completed'}),
        createSprint({endDate: '2026-03-28', id: 'sprint-2', name: 'Sprint 2', startDate: '2026-03-15', status: 'completed'}),
        createSprint({endDate: '2026-04-11', id: 'sprint-3', name: 'Sprint 3', startDate: '2026-03-29', status: 'active'}),
        createSprint({endDate: '2026-04-25', id: 'sprint-4', name: 'Sprint 4', startDate: '2026-04-12', status: 'planned'}),
      ])

      expect(quickSprints.map(({label, sprint}) => ({id: sprint.id, label}))).toEqual([
        {id: 'sprint-3', label: 'Current sprint'},
        {id: 'sprint-2', label: 'Previous sprint'},
        {id: 'sprint-1', label: 'Two sprints ago'},
      ])
    })
  })

  describe('normalizeTaskScopeSprintIds', () => {
    it('deduplicates sprint ids and enforces the three-sprint cap', () => {
      expect(normalizeTaskScopeSprintIds([
        'sprint-1',
        ' sprint-2 ',
        'sprint-2',
        'sprint-3',
        'sprint-4',
      ])).toEqual(['sprint-1', 'sprint-2', 'sprint-3'])
    })
  })

  describe('filterCardsByTaskScope', () => {
    const cards = [
      createCard({createdAt: '2026-04-02T09:00:00.000Z', dueAt: '2026-04-12', id: 'card-a', sprintId: 'sprint-1', startAt: '2026-04-05'}),
      createCard({createdAt: '2026-04-10T09:00:00.000Z', dueAt: '2026-05-01', id: 'card-b', sprintId: 'sprint-2', startAt: '2026-04-20'}),
      createCard({createdAt: '2026-04-01T09:00:00.000Z', dueAt: null, id: 'card-c', sprintId: null, startAt: null}),
    ]

    it('returns all cards when no scope is selected', () => {
      expect(filterCardsByTaskScope(cards, {
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        sprintIds: [],
        taskMode: 'standard',
      }).map((card) => card.id)).toEqual(['card-a', 'card-b', 'card-c'])
    })

    it('filters cards by overlapping date range in standard mode', () => {
      expect(filterCardsByTaskScope(cards, {
        dateRange: {endDate: '2026-04-15', preset: 'custom', startDate: '2026-04-01'},
        sprintIds: [],
        taskMode: 'standard',
      }).map((card) => card.id)).toEqual(['card-a'])
    })

    it('filters cards by sprint membership in sprint mode', () => {
      expect(filterCardsByTaskScope(cards, {
        dateRange: {endDate: '2026-04-15', preset: 'custom', startDate: '2026-04-01'},
        sprintIds: ['sprint-2'],
        taskMode: 'sprint',
      }).map((card) => card.id)).toEqual(['card-b'])
    })

    it('keeps backlog visible in sprint mode when the surface opts in', () => {
      expect(filterCardsByTaskScope(cards, {
        dateRange: {endDate: '2026-04-15', preset: 'custom', startDate: '2026-04-01'},
        includeBacklogInSprintScope: true,
        sprintIds: ['sprint-2'],
        taskMode: 'sprint',
      }).map((card) => card.id)).toEqual(['card-b', 'card-c'])
    })
  })

  describe('resolveTaskScopeDateWindow', () => {
    it('returns the union of selected sprint dates', () => {
      expect(resolveTaskScopeDateWindow(
        ['sprint-2', 'sprint-3'],
        [
          createSprint({endDate: '2026-03-14', id: 'sprint-1', startDate: '2026-03-01'}),
          createSprint({endDate: '2026-03-28', id: 'sprint-2', startDate: '2026-03-15'}),
          createSprint({endDate: '2026-04-11', id: 'sprint-3', startDate: '2026-03-29'}),
        ],
      )).toEqual({
        endDate: '2026-04-11',
        startDate: '2026-03-15',
      })
    })

    it('returns null when selected sprints do not have usable dates', () => {
      expect(resolveTaskScopeDateWindow(
        ['undated'],
        [createSprint({endDate: null, id: 'undated', startDate: null})],
      )).toBeNull()
    })
  })
})
