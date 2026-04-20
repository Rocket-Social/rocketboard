import {describe, expect, it} from 'vitest'

import type {InitiativeRecord} from './initiative.types'
import {
  computeHealthSummary,
  filterInitiatives,
  formatRelativeTargetDate,
  sortForNeedsAttention,
} from './InitiativesListPage'

function makeInitiative(overrides: Partial<InitiativeRecord> = {}): InitiativeRecord {
  return {
    createdAt: '2026-01-01T00:00:00Z',
    description: null,
    health: 'on_track',
    id: 'init-1',
    latestUpdateAt: null,
    latestUpdateText: null,
    leadName: null,
    leadUserId: null,
    name: 'Test Initiative',
    position: 0,
    status: 'active',
    targetDate: null,
    updatedAt: '2026-01-01T00:00:00Z',
    visibility: 'open',
    workspaceId: 'ws-1',
    ...overrides,
  }
}

// Helper: format a local date as YYYY-MM-DD (timezone-safe, unlike toISOString)
function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── formatRelativeTargetDate ───────────────────────────────────

describe('formatRelativeTargetDate', () => {
  it('returns null for null date', () => {
    expect(formatRelativeTargetDate(null)).toBeNull()
  })

  it('returns "Due today" for today', () => {
    const today = new Date()
    const result = formatRelativeTargetDate(localDateString(today))
    expect(result).toEqual({label: 'Due today', overdue: false})
  })

  it('returns days left for future date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const result = formatRelativeTargetDate(localDateString(future))
    expect(result?.label).toBe('5d left')
    expect(result?.overdue).toBe(false)
  })

  it('returns days overdue for past date', () => {
    const past = new Date()
    past.setDate(past.getDate() - 3)
    const result = formatRelativeTargetDate(localDateString(past))
    expect(result?.label).toBe('3d overdue')
    expect(result?.overdue).toBe(true)
  })

  it('handles singular day', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const result = formatRelativeTargetDate(localDateString(tomorrow))
    expect(result?.label).toBe('1d left')
    expect(result?.overdue).toBe(false)
  })
})

// ─── filterInitiatives ──────────────────────────────────────────

describe('filterInitiatives', () => {
  const initiatives: InitiativeRecord[] = [
    makeInitiative({id: '1', health: 'on_track', leadUserId: 'user-a', status: 'active'}),
    makeInitiative({id: '2', health: 'at_risk', leadUserId: 'user-b', status: 'planned'}),
    makeInitiative({id: '3', health: 'off_track', leadUserId: 'user-a', status: 'completed'}),
    makeInitiative({id: '4', health: 'on_track', leadUserId: 'user-c', status: 'paused'}),
  ]

  it('returns all for "all" filter', () => {
    expect(filterInitiatives(initiatives, 'all', 'user-a')).toHaveLength(4)
  })

  it('returns active + planned for "active" filter', () => {
    const result = filterInitiatives(initiatives, 'active', 'user-a')
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('returns only user\'s initiatives for "my" filter', () => {
    const result = filterInitiatives(initiatives, 'my', 'user-a')
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['1', '3'])
  })

  it('returns at_risk + off_track for "attention" filter', () => {
    const result = filterInitiatives(initiatives, 'attention', 'user-a')
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['2', '3'])
  })

  it('returns all for "my" filter when currentUserId is undefined', () => {
    const result = filterInitiatives(initiatives, 'my', undefined)
    expect(result).toHaveLength(4)
  })
})

// ─── sortForNeedsAttention ──────────────────────────────────────

describe('sortForNeedsAttention', () => {
  it('sorts off_track before at_risk', () => {
    const initiatives: InitiativeRecord[] = [
      makeInitiative({id: '1', health: 'at_risk'}),
      makeInitiative({id: '2', health: 'off_track'}),
    ]
    const sorted = sortForNeedsAttention(initiatives)
    expect(sorted.map((i) => i.id)).toEqual(['2', '1'])
  })

  it('sorts by target_date within same health', () => {
    const initiatives: InitiativeRecord[] = [
      makeInitiative({id: '1', health: 'off_track', targetDate: '2026-03-15'}),
      makeInitiative({id: '2', health: 'off_track', targetDate: '2026-03-10'}),
    ]
    const sorted = sortForNeedsAttention(initiatives)
    expect(sorted.map((i) => i.id)).toEqual(['2', '1'])
  })

  it('puts null target_date last within same health', () => {
    const initiatives: InitiativeRecord[] = [
      makeInitiative({id: '1', health: 'at_risk', targetDate: null}),
      makeInitiative({id: '2', health: 'at_risk', targetDate: '2026-03-10'}),
    ]
    const sorted = sortForNeedsAttention(initiatives)
    expect(sorted.map((i) => i.id)).toEqual(['2', '1'])
  })
})

// ─── computeHealthSummary ───────────────────────────────────────

describe('computeHealthSummary', () => {
  it('counts health values correctly', () => {
    const initiatives: InitiativeRecord[] = [
      makeInitiative({health: 'on_track'}),
      makeInitiative({health: 'on_track'}),
      makeInitiative({health: 'at_risk'}),
      makeInitiative({health: 'off_track'}),
    ]
    expect(computeHealthSummary(initiatives)).toEqual({
      atRisk: 1,
      offTrack: 1,
      onTrack: 2,
    })
  })

  it('returns zeros for empty array', () => {
    expect(computeHealthSummary([])).toEqual({
      atRisk: 0,
      offTrack: 0,
      onTrack: 0,
    })
  })
})
