import {describe, expect, it} from 'vitest'

// Re-export the pure functions for testing by extracting them
// We test the logic directly rather than through the component

import type {RoadmapItem, RoadmapLane} from '../plan.types'

// ── Overlap stacking algorithm (same as in RoadmapTimelineView) ──

type StackedItem = RoadmapItem & {subRow: number}

function dateToDayOffset(dateStr: string | null, baseline: Date): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00Z' : dateStr)
  if (Number.isNaN(d.getTime())) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((d.getTime() - baseline.getTime()) / msPerDay)
}

function computeOverlapStacking(items: RoadmapItem[], baseline: Date): StackedItem[] {
  if (items.length === 0) return []

  const sorted = [...items].sort((a, b) => a.startPeriod.localeCompare(b.startPeriod))
  const result: StackedItem[] = []
  const subRowEnds: number[] = []

  for (const item of sorted) {
    const start = dateToDayOffset(item.startPeriod, baseline) ?? 0
    const end = dateToDayOffset(item.endPeriod, baseline) ?? start

    let assignedRow = -1
    for (let r = 0; r < subRowEnds.length; r++) {
      if (subRowEnds[r] < start) {
        assignedRow = r
        break
      }
    }

    if (assignedRow === -1) {
      assignedRow = subRowEnds.length
      subRowEnds.push(end)
    } else {
      subRowEnds[assignedRow] = end
    }

    result.push({...item, subRow: assignedRow})
  }

  return result
}

type LaneGroup = {
  collapsed: boolean
  lanes: RoadmapLane[]
  title: string
}

function groupLanes(lanes: RoadmapLane[]): LaneGroup[] {
  const groups = new Map<string, RoadmapLane[]>()
  const ungrouped: RoadmapLane[] = []

  for (const lane of lanes) {
    if (lane.group) {
      const existing = groups.get(lane.group) ?? []
      existing.push(lane)
      groups.set(lane.group, existing)
    } else {
      ungrouped.push(lane)
    }
  }

  const result: LaneGroup[] = []
  if (ungrouped.length > 0) {
    result.push({collapsed: false, lanes: ungrouped, title: ''})
  }
  for (const [title, groupedLanes] of groups) {
    result.push({collapsed: false, lanes: groupedLanes, title})
  }
  return result
}

// ── Helpers ──────────────────────────────────────────────────

const baseline = new Date('2026-01-01T00:00:00Z')

function makeItem(overrides: Partial<RoadmapItem> & {endPeriod: string; startPeriod: string}): RoadmapItem {
  return {
    color: null,
    description: null,
    endPeriod: overrides.endPeriod,
    id: overrides.id ?? 'item-1',
    initiativeId: null,
    itemType: 'bar',
    label: overrides.label ?? 'Test',
    laneId: overrides.laneId ?? 'lane-1',
    position: overrides.position ?? 0,
    startPeriod: overrides.startPeriod,
  }
}

function makeLane(overrides: Partial<RoadmapLane> = {}): RoadmapLane {
  return {
    color: null,
    createdAt: '2026-01-01T00:00:00Z',
    group: overrides.group ?? null,
    groupType: overrides.groupType ?? 'custom',
    id: overrides.id ?? 'lane-1',
    position: overrides.position ?? 0,
    title: overrides.title ?? 'Test Lane',
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('computeOverlapStacking', () => {
  it('returns empty for no items', () => {
    expect(computeOverlapStacking([], baseline)).toEqual([])
  })

  it('places non-overlapping bars on sub-row 0', () => {
    const items = [
      makeItem({endPeriod: '2026-01-15', id: 'a', startPeriod: '2026-01-01'}),
      makeItem({endPeriod: '2026-02-15', id: 'b', startPeriod: '2026-02-01'}),
    ]
    const result = computeOverlapStacking(items, baseline)
    expect(result[0].subRow).toBe(0)
    expect(result[1].subRow).toBe(0)
  })

  it('stacks overlapping bars on separate sub-rows', () => {
    const items = [
      makeItem({endPeriod: '2026-02-15', id: 'a', startPeriod: '2026-01-01'}),
      makeItem({endPeriod: '2026-02-28', id: 'b', startPeriod: '2026-01-15'}),
    ]
    const result = computeOverlapStacking(items, baseline)
    expect(result[0].subRow).toBe(0)
    expect(result[1].subRow).toBe(1)
  })

  it('reuses freed sub-rows', () => {
    const items = [
      makeItem({endPeriod: '2026-01-31', id: 'a', startPeriod: '2026-01-01'}),
      makeItem({endPeriod: '2026-02-28', id: 'b', startPeriod: '2026-01-15'}),
      makeItem({endPeriod: '2026-03-31', id: 'c', startPeriod: '2026-02-01'}),
    ]
    const result = computeOverlapStacking(items, baseline)
    // 'a' ends Jan 31, 'c' starts Feb 1 — 'c' can reuse row 0
    expect(result[0].subRow).toBe(0) // a
    expect(result[1].subRow).toBe(1) // b (overlaps a)
    expect(result[2].subRow).toBe(0) // c (a freed row 0)
  })

  it('handles 5 overlapping bars', () => {
    const items = Array.from({length: 5}, (_, i) =>
      makeItem({endPeriod: '2026-03-31', id: `item-${i}`, startPeriod: '2026-01-01'}),
    )
    const result = computeOverlapStacking(items, baseline)
    const subRows = result.map((r) => r.subRow)
    expect(subRows).toEqual([0, 1, 2, 3, 4])
  })

  it('sorts items by start period before stacking', () => {
    const items = [
      makeItem({endPeriod: '2026-03-31', id: 'b', startPeriod: '2026-02-01'}),
      makeItem({endPeriod: '2026-01-31', id: 'a', startPeriod: '2026-01-01'}),
    ]
    const result = computeOverlapStacking(items, baseline)
    expect(result[0].id).toBe('a') // sorted first
    expect(result[1].id).toBe('b')
  })
})

describe('groupLanes', () => {
  it('puts ungrouped lanes in a default group', () => {
    const lanes = [makeLane({group: null, id: 'a'}), makeLane({group: null, id: 'b'})]
    const result = groupLanes(lanes)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('')
    expect(result[0].lanes).toHaveLength(2)
  })

  it('groups lanes by group label', () => {
    const lanes = [
      makeLane({group: 'Active', id: 'a'}),
      makeLane({group: 'Active', id: 'b'}),
      makeLane({group: 'Future', id: 'c'}),
    ]
    const result = groupLanes(lanes)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('Active')
    expect(result[0].lanes).toHaveLength(2)
    expect(result[1].title).toBe('Future')
    expect(result[1].lanes).toHaveLength(1)
  })

  it('puts ungrouped lanes before grouped lanes', () => {
    const lanes = [
      makeLane({group: 'Active', id: 'a'}),
      makeLane({group: null, id: 'b'}),
    ]
    const result = groupLanes(lanes)
    expect(result[0].title).toBe('')
    expect(result[1].title).toBe('Active')
  })
})
