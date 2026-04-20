import {describe, expect, it} from 'vitest'

import type {CardRecord} from './card.types'
import {
  applyTableViewDraftToCards,
  compareDateValues,
  compareNumberValues,
  compareRankValues,
  compareTextValues,
  sortCards,
} from './card-sorting'
import type {ProjectTableViewDraft} from '../projects/project-view.types'

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

const testStatusOptions = [
  {id: 'opt-todo', key: 'todo', label: 'To Do', category: 'not_started' as const, position: 0, isDefault: true, color: null},
  {id: 'opt-in-progress', key: 'in_progress', label: 'In Progress', category: 'started' as const, position: 0, isDefault: false, color: null},
  {id: 'opt-in-review', key: 'in_review', label: 'In Review', category: 'started' as const, position: 1, isDefault: false, color: null},
  {id: 'opt-done', key: 'done', label: 'Done', category: 'completed' as const, position: 0, isDefault: false, color: null},
  {id: 'opt-blocked', key: 'blocked', label: 'Blocked', category: 'not_started' as const, position: 1, isDefault: false, color: null},
]

describe('compareTextValues', () => {
  it('returns 0 when both are empty', () => {
    expect(compareTextValues('', '', 'asc')).toBe(0)
    expect(compareTextValues(null, null, 'asc')).toBe(0)
    expect(compareTextValues(undefined, undefined, 'asc')).toBe(0)
  })

  it('sorts empty/null values to the end', () => {
    expect(compareTextValues(null, 'hello', 'asc')).toBe(1)
    expect(compareTextValues('hello', null, 'asc')).toBe(-1)
  })

  it('sorts alphabetically in asc direction', () => {
    expect(compareTextValues('apple', 'banana', 'asc')).toBeLessThan(0)
    expect(compareTextValues('banana', 'apple', 'asc')).toBeGreaterThan(0)
  })

  it('reverses order in desc direction', () => {
    expect(compareTextValues('apple', 'banana', 'desc')).toBeGreaterThan(0)
    expect(compareTextValues('banana', 'apple', 'desc')).toBeLessThan(0)
  })

  it('trims whitespace before comparing', () => {
    expect(compareTextValues('  hello  ', 'hello', 'asc')).toBe(0)
  })
})

describe('compareDateValues', () => {
  it('returns 0 when both are null', () => {
    expect(compareDateValues(null, null, 'asc')).toBe(0)
  })

  it('sorts null to the end regardless of direction', () => {
    expect(compareDateValues(null, '2026-01-01', 'asc')).toBe(1)
    expect(compareDateValues('2026-01-01', null, 'asc')).toBe(-1)
    expect(compareDateValues(null, '2026-01-01', 'desc')).toBe(1)
  })

  it('sorts dates in asc/desc order', () => {
    expect(compareDateValues('2026-01-01', '2026-06-01', 'asc')).toBeLessThan(0)
    expect(compareDateValues('2026-01-01', '2026-06-01', 'desc')).toBeGreaterThan(0)
  })
})

describe('compareNumberValues', () => {
  it('returns 0 when both are null', () => {
    expect(compareNumberValues(null, null, 'asc')).toBe(0)
  })

  it('sorts null to the end', () => {
    expect(compareNumberValues(null, 5, 'asc')).toBe(1)
    expect(compareNumberValues(5, null, 'asc')).toBe(-1)
  })

  it('sorts numbers in asc/desc order', () => {
    expect(compareNumberValues(1, 10, 'asc')).toBeLessThan(0)
    expect(compareNumberValues(1, 10, 'desc')).toBeGreaterThan(0)
  })
})

describe('compareRankValues', () => {
  it('returns positive when left > right in asc', () => {
    expect(compareRankValues(3, 1, 'asc')).toBeGreaterThan(0)
  })

  it('reverses in desc', () => {
    expect(compareRankValues(3, 1, 'desc')).toBeLessThan(0)
  })
})

describe('sortCards', () => {
  it('returns cards unchanged when no sorts', () => {
    const cards = [makeCard({title: 'B'}), makeCard({title: 'A'})]
    expect(sortCards(cards, [], [])).toBe(cards)
  })

  it('sorts by title asc', () => {
    const cards = [
      makeCard({title: 'Cherry', statusPosition: 0}),
      makeCard({title: 'Apple', statusPosition: 1}),
      makeCard({title: 'Banana', statusPosition: 2}),
    ]
    const sorted = sortCards(cards, [{fieldKey: 'title', direction: 'asc'}], [])
    expect(sorted.map((c) => c.title)).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('sorts by status rank', () => {
    const cards = [
      makeCard({statusOptionId: 'opt-done', statusPosition: 0}),
      makeCard({statusOptionId: 'opt-todo', statusPosition: 1}),
      makeCard({statusOptionId: 'opt-in-progress', statusPosition: 2}),
    ]
    const sorted = sortCards(cards, [{fieldKey: 'status', direction: 'asc'}], [], {statusOptions: testStatusOptions})
    expect(sorted.map((c) => c.statusOptionId)).toEqual(['opt-todo', 'opt-in-progress', 'opt-done'])
  })

  it('uses status position as tiebreaker', () => {
    const cards = [
      makeCard({title: 'Same', statusPosition: 2}),
      makeCard({title: 'Same', statusPosition: 0}),
      makeCard({title: 'Same', statusPosition: 1}),
    ]
    const sorted = sortCards(cards, [{fieldKey: 'title', direction: 'asc'}], [])
    expect(sorted.map((c) => c.statusPosition)).toEqual([0, 1, 2])
  })

  it('uses createdAt as the tiebreaker in non-status grouped views', () => {
    const cards = [
      makeCard({createdAt: '2026-03-25T10:00:00.000Z', id: 'todo-0', statusPosition: 0, statusOptionId: 'opt-todo', title: 'Same'}),
      makeCard({createdAt: '2026-03-25T10:05:00.000Z', id: 'progress-0', statusPosition: 0, statusOptionId: 'opt-in-progress', title: 'Same'}),
      makeCard({createdAt: '2026-03-25T10:10:00.000Z', id: 'todo-1', statusPosition: 1, statusOptionId: 'opt-todo', title: 'Same'}),
    ]

    const sorted = sortCards(cards, [{fieldKey: 'title', direction: 'asc'}], [], {groupBy: 'assignee'})

    expect(sorted.map((card) => card.id)).toEqual(['todo-0', 'progress-0', 'todo-1'])
  })

  it('applies multi-sort in priority order', () => {
    const cards = [
      makeCard({statusOptionId: 'opt-todo', title: 'B', statusPosition: 0}),
      makeCard({statusOptionId: 'opt-todo', title: 'A', statusPosition: 1}),
      makeCard({statusOptionId: 'opt-done', title: 'C', statusPosition: 2}),
    ]
    const sorted = sortCards(
      cards,
      [
        {fieldKey: 'status', direction: 'asc'},
        {fieldKey: 'title', direction: 'asc'},
      ],
      [],
      {statusOptions: testStatusOptions},
    )
    expect(sorted.map((c) => c.title)).toEqual(['A', 'B', 'C'])
  })

  it('sorts by tags as a built-in text field', () => {
    const cards = [
      makeCard({statusPosition: 0, tags: ['beta']}),
      makeCard({statusPosition: 1, tags: ['alpha']}),
      makeCard({statusPosition: 2, tags: []}),
    ]

    const sorted = sortCards(cards, [{fieldKey: 'tags', direction: 'asc'}], [])

    expect(sorted.map((card) => card.tags)).toEqual([['alpha'], ['beta'], []])
  })

  it('sorts due dates soonest to latest with undated tasks last in asc', () => {
    const cards = [
      makeCard({dueAt: null, id: 'none'}),
      makeCard({dueAt: '2026-04-10', id: 'late'}),
      makeCard({dueAt: '2026-04-05', id: 'soon'}),
    ]

    const sorted = sortCards(cards, [{fieldKey: 'due_date', direction: 'asc'}], [])

    expect(sorted.map((card) => card.id)).toEqual(['soon', 'late', 'none'])
  })

  it('sorts due dates latest to soonest with undated tasks first in desc', () => {
    const cards = [
      makeCard({dueAt: '2026-04-05', id: 'soon'}),
      makeCard({dueAt: null, id: 'none'}),
      makeCard({dueAt: '2026-04-10', id: 'late'}),
    ]

    const sorted = sortCards(cards, [{fieldKey: 'due_date', direction: 'desc'}], [])

    expect(sorted.map((card) => card.id)).toEqual(['none', 'late', 'soon'])
  })
})

describe('applyTableViewDraftToCards', () => {
  const baseDraft: ProjectTableViewDraft = {
    collapsedGroups: [],
    columnWidths: {},
    filters: {priority: [], status: []},
    groupBy: 'status',
    personFilterUserId: null,
    sort: [],
    visibleFieldKeys: [],
  }

  it('returns all cards when no filters', () => {
    const cards = [makeCard({statusOptionId: 'opt-todo'}), makeCard({statusOptionId: 'opt-done'})]
    expect(applyTableViewDraftToCards(cards, baseDraft)).toHaveLength(2)
  })

  it('filters by status', () => {
    const cards = [
      makeCard({statusOptionId: 'opt-todo'}),
      makeCard({statusOptionId: 'opt-done'}),
      makeCard({statusOptionId: 'opt-in-progress'}),
    ]
    const draft = {...baseDraft, filters: {priority: [], status: ['opt-todo', 'opt-done']}}
    expect(applyTableViewDraftToCards(cards, draft)).toHaveLength(2)
  })

  it('filters by priority', () => {
    const cards = [
      makeCard({priorityOptionId: 'prio-high'}),
      makeCard({priorityOptionId: 'prio-low'}),
      makeCard({priorityOptionId: 'prio-medium'}),
    ]
    const draft = {...baseDraft, filters: {priority: ['prio-high'], status: []}}
    expect(applyTableViewDraftToCards(cards, draft)).toHaveLength(1)
  })

  it('combines status and priority filters', () => {
    const cards = [
      makeCard({statusOptionId: 'opt-todo', priorityOptionId: 'prio-high'}),
      makeCard({statusOptionId: 'opt-done', priorityOptionId: 'prio-high'}),
      makeCard({statusOptionId: 'opt-todo', priorityOptionId: 'prio-low'}),
    ]
    const draft = {...baseDraft, filters: {priority: ['prio-high'], status: ['opt-todo']}}
    const result = applyTableViewDraftToCards(cards, draft)
    expect(result).toHaveLength(1)
    expect(result[0].statusOptionId).toBe('opt-todo')
    expect(result[0].priorityOptionId).toBe('prio-high')
  })
})
