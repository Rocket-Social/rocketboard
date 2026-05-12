import {describe, expect, it} from 'vitest'

import {
  defaultTableVisibleFieldKeys,
  normalizeProjectTaskBoardMode,
  normalizeProjectViewDateRange,
  normalizeProjectViewGroupBy,
  normalizeProjectTableSort,
  normalizeProjectTableVisibleFieldKeys,
  resolveProjectTableViewDraft,
  resolveProjectOverviewConfig,
} from './project-view.types'

describe('project table view draft helpers', () => {
  it('preserves visible field order while normalizing duplicates', () => {
    expect(
      normalizeProjectTableVisibleFieldKeys([' status ', 'effort', 'status', 'custom_score', 'EFFORT']),
    ).toEqual(['status', 'effort', 'custom_score'])
  })

  it('falls back to the default visible table columns when none are configured', () => {
    expect(normalizeProjectTableVisibleFieldKeys([])).toEqual([...defaultTableVisibleFieldKeys])
  })

  it('accepts custom sort field keys', () => {
    expect(
      normalizeProjectTableSort({
        direction: 'desc',
        fieldKey: ' Custom_Score ',
      }),
    ).toEqual([{
      direction: 'desc',
      fieldKey: 'custom_score',
    }])
  })

  it('keeps assignee grouping instead of collapsing it to group', () => {
    expect(normalizeProjectViewGroupBy('assignee')).toBe('assignee')
  })

  it('normalizes task board mode back to standard for invalid values', () => {
    expect(normalizeProjectTaskBoardMode('sprint')).toBe('sprint')
    expect(normalizeProjectTaskBoardMode('board')).toBe('standard')
  })

  it('collapses legacy initiative grouping back to group', () => {
    expect(normalizeProjectViewGroupBy('initiative')).toBe('group')
  })

  it('normalizes reversed gantt date ranges', () => {
    expect(
      normalizeProjectViewDateRange({
        endDate: '2026-03-01',
        preset: 'custom',
        startDate: '2026-03-10',
      }),
    ).toEqual({
      endDate: '2026-03-10',
      preset: 'custom',
      startDate: '2026-03-01',
    })
  })

  it('normalizes overview config ids and date ranges before comparison', () => {
    expect(resolveProjectOverviewConfig({
      overviewAssigneeIds: ['user-2', ' user-1 ', 'user-2'],
      overviewDateRange: {
        endDate: '2026-03-01',
        preset: 'custom',
        startDate: '2026-03-10',
      },
      overviewGroupId: 'group-1',
      overviewPriorityKeys: ['prio-2', 'prio-1', 'prio-2'],
    })).toEqual({
      overviewAssigneeIds: ['user-1', 'user-2'],
      overviewDateRange: {
        endDate: '2026-03-10',
        preset: 'custom',
        startDate: '2026-03-01',
      },
      overviewGroupId: 'group-1',
      overviewPriorityKeys: ['prio-1', 'prio-2'],
      overviewSprintIds: [],
      overviewSprintId: null,
      overviewWidgets: [
        {id: 'progress_status', type: 'progress_status', title: null, width: 1},
        {id: 'burn_up', type: 'burn_up', title: null, width: 1},
        {id: 'priority_assignees', type: 'priority_assignees', title: null, width: 1},
      ],
    })
  })

  it('resolves table drafts without a task mode field', () => {
    const draft = resolveProjectTableViewDraft({
      personalConfig: null,
      sharedConfig: {
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sort: [],
        visibleFieldKeys: ['status'],
      },
      sharedVersion: 1,
    }, 'group')

    expect(draft).not.toHaveProperty('taskMode')
    expect(draft.visibleFieldKeys).toEqual(['status'])
  })
})
