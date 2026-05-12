import {describe, expect, it} from 'vitest'

import {
  applyExplicitBoardSearchParams,
  applyExplicitGanttSearchParams,
  applyExplicitOverviewSearchParams,
  applyExplicitTableSearchParams,
  buildBoardSearchParams,
  buildGanttSearchParams,
  buildOverviewSearchParams,
  buildTableSearchParams,
  hasExplicitSearchParams,
  parseBoardSearchParams,
  parseGanttSearchParams,
  parseOverviewSearchParams,
  parseTableSearchParams,
  serializeSort,
  serializeStringList,
  validateBoardSearch,
  validateGanttSearch,
  validateOverviewSearch,
  validateTableSearch,
} from './view-search-params'
import {defaultTableVisibleFieldKeys} from '../projects/project-view.types'

describe('view-search-params', () => {
  describe('serializeSort', () => {
    it('returns undefined for empty array', () => {
      expect(serializeSort([])).toBeUndefined()
    })

    it('serializes single sort entry', () => {
      expect(serializeSort([{direction: 'asc', fieldKey: 'title'}])).toBe('title:asc')
    })

    it('serializes multiple sort entries', () => {
      expect(serializeSort([
        {direction: 'desc', fieldKey: 'priority'},
        {direction: 'asc', fieldKey: 'title'},
      ])).toBe('priority:desc,title:asc')
    })
  })

  describe('serializeStringList', () => {
    it('returns undefined for empty array', () => {
      expect(serializeStringList([])).toBeUndefined()
    })

    it('joins items with commas', () => {
      expect(serializeStringList(['a', 'b', 'c'])).toBe('a,b,c')
    })
  })

  describe('validateTableSearch', () => {
    it('returns empty object for empty raw input', () => {
      expect(validateTableSearch({})).toEqual({
        dateEnd: undefined,
        datePreset: undefined,
        dateStart: undefined,
        fields: undefined,
        groupBy: undefined,
        person: undefined,
        priority: undefined,
        sort: undefined,
        status: undefined,
        sprints: undefined,
      })
    })

    it('parses valid groupBy values', () => {
      expect(validateTableSearch({groupBy: 'assignee'}).groupBy).toBe('assignee')
      expect(validateTableSearch({groupBy: 'status'}).groupBy).toBe('status')
    })

    it('rejects invalid groupBy values', () => {
      expect(validateTableSearch({groupBy: 'invalid'}).groupBy).toBeUndefined()
      expect(validateTableSearch({groupBy: 123}).groupBy).toBeUndefined()
    })

    it('trims string values', () => {
      expect(validateTableSearch({person: '  user-1  '}).person).toBe('user-1')
    })

    it('rejects blank strings', () => {
      expect(validateTableSearch({person: '   '}).person).toBeUndefined()
    })
  })

  describe('parseTableSearchParams / buildTableSearchParams round-trip', () => {
    it('defaults to group groupBy when omitted', () => {
      const parsed = parseTableSearchParams({})
      expect(parsed.groupBy).toBe('group')
    })

    it('falls back to group when a legacy initiative groupBy is present', () => {
      const parsed = parseTableSearchParams(validateTableSearch({groupBy: 'initiative'}))
      expect(parsed.groupBy).toBe('group')
    })

    it('defaults to empty sort', () => {
      const parsed = parseTableSearchParams({})
      expect(parsed.sort).toEqual([])
    })

    it('defaults to empty filters', () => {
      const parsed = parseTableSearchParams({})
      expect(parsed.filters).toEqual({priority: [], status: []})
    })

    it('defaults to null personFilterUserId', () => {
      const parsed = parseTableSearchParams({})
      expect(parsed.personFilterUserId).toBeNull()
    })

    it('defaults to the backend table columns when fields are omitted', () => {
      const parsed = parseTableSearchParams({})
      expect(parsed.visibleFieldKeys).toEqual([...defaultTableVisibleFieldKeys])
    })

    it('round-trips table config', () => {
      const config = {
        dateRange: {endDate: '2026-04-30', preset: 'custom' as const, startDate: '2026-04-01'},
        filters: {priority: ['high', 'medium'], status: ['todo']},
        groupBy: 'status' as const,
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-1', 'sprint-2'],
        sort: [{direction: 'desc' as const, fieldKey: 'priority'}],
        visibleFieldKeys: ['status', 'effort'],
      }
      const serialized = buildTableSearchParams(config)
      const parsed = parseTableSearchParams(serialized)
      expect(parsed).toEqual(config)
    })

    it('clamps sprint scope from the URL to three items', () => {
      const parsed = parseTableSearchParams({
        sprints: 'sprint-1,sprint-2,sprint-3,sprint-4',
      })

      expect(parsed.sprintIds).toEqual(['sprint-1', 'sprint-2', 'sprint-3'])
    })

    it('rejects legacy sprint groupBy and ignores stale taskMode params', () => {
      const parsed = parseTableSearchParams(validateTableSearch({groupBy: 'sprint', taskMode: 'sprint'} as Record<string, unknown>))
      expect(parsed.groupBy).toBe('group')
    })

    it('omits default groupBy from URL params', () => {
      const params = buildTableSearchParams({
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        visibleFieldKeys: [],
      })
      expect(params.groupBy).toBeUndefined()
    })

    it('omits empty filters from URL params', () => {
      const params = buildTableSearchParams({
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        visibleFieldKeys: [],
      })
      expect(params.status).toBeUndefined()
      expect(params.priority).toBeUndefined()
    })

    it('omits default visible fields from URL params', () => {
      const params = buildTableSearchParams({
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        visibleFieldKeys: [...defaultTableVisibleFieldKeys],
      })
      expect(params.fields).toBeUndefined()
    })

    it('does not serialize date params when there is no bounded date window', () => {
      const params = buildTableSearchParams({
        dateRange: {endDate: null, preset: 'this_week', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        visibleFieldKeys: [],
      })

      expect(params.dateStart).toBeUndefined()
      expect(params.dateEnd).toBeUndefined()
      expect(params.datePreset).toBeUndefined()
    })

    it('preserves personal scope while applying explicit URL table params', () => {
      const merged = applyExplicitTableSearchParams({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['todo']},
        groupBy: 'group',
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-9'],
        sort: [],
        visibleFieldKeys: ['status'],
      }, {
        groupBy: 'status',
      })

      expect(merged).toEqual({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['todo']},
        groupBy: 'status',
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-9'],
        sort: [],
        visibleFieldKeys: ['status'],
      })
    })
  })

  describe('board search params', () => {
    it('validates raw input', () => {
      expect(validateBoardSearch({sort: 'title:asc', person: 'u1'})).toEqual({
        dateEnd: undefined,
        datePreset: undefined,
        dateStart: undefined,
        person: 'u1',
        priority: undefined,
        sort: 'title:asc',
        status: undefined,
        sprints: undefined,
      })
    })

    it('round-trips board config', () => {
      const config = {
        dateRange: {endDate: '2026-04-15', preset: 'custom' as const, startDate: '2026-04-01'},
        filters: {priority: ['p1'], status: ['s1', 's2']},
        groupBy: 'status' as const,
        personFilterUserId: 'user-2',
        sprintIds: ['sprint-9'],
        sort: [{direction: 'asc' as const, fieldKey: 'title'}],
      }
      const serialized = buildBoardSearchParams(config)
      const parsed = parseBoardSearchParams(serialized)
      expect(parsed).toEqual(config)
    })

    it('round-trips board config with assignee groupBy', () => {
      const serialized = buildBoardSearchParams({
        filters: {priority: [], status: []},
        groupBy: 'assignee',
        personFilterUserId: null,
        sort: [],
      })
      expect(serialized.groupBy).toBe('assignee')
      const parsed = parseBoardSearchParams(serialized)
      expect(parsed.groupBy).toBe('assignee')
    })

    it('omits default status groupBy from URL params', () => {
      const serialized = buildBoardSearchParams({
        filters: {priority: [], status: []},
        groupBy: 'status',
        personFilterUserId: null,
        sort: [],
      })
      expect(serialized.groupBy).toBeUndefined()
    })

    it('preserves personal scope while applying explicit board params', () => {
      const merged = applyExplicitBoardSearchParams({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['todo']},
        groupBy: 'status',
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-9'],
        sort: [],
      }, {
        sort: 'priority:desc',
      })

      expect(merged).toEqual({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['todo']},
        groupBy: 'status',
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-9'],
        sort: [{direction: 'desc', fieldKey: 'priority'}],
      })
    })

    it('handles empty config', () => {
      const parsed = parseBoardSearchParams({})
      expect(parsed).toEqual({
        dateRange: {endDate: null, preset: 'this_week', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'status',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
      })
    })

    it('does not serialize board date params when there is no bounded date window', () => {
      const params = buildBoardSearchParams({
        dateRange: {endDate: null, preset: 'this_week', startDate: null},
        filters: {priority: [], status: []},
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
      })

      expect(params.dateStart).toBeUndefined()
      expect(params.dateEnd).toBeUndefined()
      expect(params.datePreset).toBeUndefined()
    })
  })

  describe('gantt search params', () => {
    it('validates raw input including timeScale', () => {
      const result = validateGanttSearch({timeScale: 'month', groupBy: 'assignee'})
      expect(result.timeScale).toBe('month')
      expect(result.groupBy).toBe('assignee')
    })

    it('rejects invalid timeScale', () => {
      expect(validateGanttSearch({timeScale: 'year'}).timeScale).toBeUndefined()
    })

    it('round-trips gantt config', () => {
      const config = {
        dateRange: {endDate: '2026-04-30', preset: 'custom' as const, startDate: '2026-04-01'},
        filters: {priority: [], status: ['active']},
        groupBy: 'assignee' as const,
        personFilterUserId: null,
        sprintIds: ['sprint-1'],
        sort: [{direction: 'asc' as const, fieldKey: 'due_at'}],
        timeScale: 'month' as const,
      }
      const serialized = buildGanttSearchParams(config)
      const parsed = parseGanttSearchParams(serialized)
      expect(parsed).toEqual(config)
    })

    it('falls back to group when a legacy initiative gantt groupBy is present', () => {
      const parsed = parseGanttSearchParams(validateGanttSearch({groupBy: 'initiative'}))
      expect(parsed.groupBy).toBe('group')
    })

    it('omits default timeScale from URL', () => {
      const params = buildGanttSearchParams({
        dateRange: {endDate: '', preset: 'all_time', startDate: ''},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        timeScale: 'week',
      })
      expect(params.timeScale).toBeUndefined()
    })

    it('preserves stored date range and time scale when URL only overrides groupBy', () => {
      const merged = applyExplicitGanttSearchParams({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['in_progress']},
        groupBy: 'group',
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-4'],
        sort: [{direction: 'asc', fieldKey: 'due_at'}],
        timeScale: 'day',
      }, {groupBy: 'status'})

      expect(merged).toEqual({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['in_progress']},
        groupBy: 'status',
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-4'],
        sort: [{direction: 'asc', fieldKey: 'due_at'}],
        timeScale: 'day',
      })
    })

    it('updates only the explicit filter key from URL search', () => {
      const merged = applyExplicitGanttSearchParams({
        dateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        filters: {priority: ['p1'], status: ['in_progress']},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: ['sprint-8'],
        sort: [],
        timeScale: 'day',
      }, {status: 'done'})

      expect(merged.filters).toEqual({
        priority: ['p1'],
        status: ['done'],
      })
      expect(merged.sprintIds).toEqual(['sprint-8'])
    })
  })

  describe('overview search params', () => {
    it('validates raw input', () => {
      const result = validateOverviewSearch({group: 'g1', sprint: 's1', assignees: 'u1,u2'})
      expect(result.group).toBe('g1')
      expect(result.sprint).toBe('s1')
      expect(result.assignees).toBe('u1,u2')
    })

    it('round-trips overview config', () => {
      const config = {
        overviewAssigneeIds: ['u1', 'u2'],
        overviewDateRange: {endDate: '2026-04-30', preset: 'custom' as const, startDate: '2026-04-01'},
        overviewGroupId: 'group-1',
        overviewPanel: null as 'access' | null,
        overviewPriorityKeys: ['high'],
        overviewSprintIds: ['sprint-7'],
        overviewSprintId: 'sprint-7' as string | null,
      }
      const serialized = buildOverviewSearchParams(config)
      const parsed = parseOverviewSearchParams(serialized)
      expect(parsed).toEqual(config)
    })

    it('handles empty config', () => {
      const parsed = parseOverviewSearchParams({})
      expect(parsed.overviewGroupId).toBeNull()
      expect(parsed.overviewSprintId).toBeNull()
      expect(parsed.overviewSprintIds).toEqual([])
      expect(parsed.overviewAssigneeIds).toEqual([])
      expect(parsed.overviewPanel).toBeNull()
      expect(parsed.overviewPriorityKeys).toEqual([])
    })

    it('prefers canonical sprints over legacy sprint and clamps overview to one sprint', () => {
      const parsed = parseOverviewSearchParams({
        sprint: 'legacy-sprint',
        sprints: 'current-sprint,previous-sprint',
      })

      expect(parsed.overviewSprintIds).toEqual(['current-sprint'])
      expect(parsed.overviewSprintId).toBe('current-sprint')
    })

    it('falls back to legacy sprint when canonical sprints are absent', () => {
      const parsed = parseOverviewSearchParams({
        sprint: 'legacy-sprint',
      })

      expect(parsed.overviewSprintIds).toEqual(['legacy-sprint'])
      expect(parsed.overviewSprintId).toBe('legacy-sprint')
    })

    it('omits default datePreset from URL', () => {
      const params = buildOverviewSearchParams({
        overviewAssigneeIds: [],
        overviewDateRange: {endDate: '', preset: 'all_time', startDate: ''},
        overviewGroupId: null,
        overviewPriorityKeys: [],
      })
      expect(params.datePreset).toBeUndefined()
    })

    it('preserves personal overview scope while applying explicit URL params', () => {
      const merged = applyExplicitOverviewSearchParams({
        overviewAssigneeIds: ['user-1'],
        overviewDateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        overviewGroupId: 'group-1',
        overviewPanel: null,
        overviewPriorityKeys: ['p1'],
        overviewSprintIds: ['sprint-9'],
        overviewSprintId: 'sprint-9',
      }, {
        panel: 'access',
      })

      expect(merged).toEqual({
        overviewAssigneeIds: ['user-1'],
        overviewDateRange: {endDate: '2026-04-20', preset: 'this_week', startDate: '2026-04-14'},
        overviewGroupId: 'group-1',
        overviewPanel: 'access',
        overviewPriorityKeys: ['p1'],
        overviewSprintIds: ['sprint-9'],
        overviewSprintId: 'sprint-9',
      })
    })
  })

  describe('hasExplicitSearchParams', () => {
    it('returns false for all-undefined params', () => {
      expect(hasExplicitSearchParams({groupBy: undefined, sort: undefined})).toBe(false)
    })

    it('returns true when any param is defined', () => {
      expect(hasExplicitSearchParams({person: 'user-1', sort: undefined})).toBe(true)
    })

    it('returns false for empty object', () => {
      expect(hasExplicitSearchParams({})).toBe(false)
    })
  })

  describe('datePreset validation', () => {
    it('accepts valid gantt datePreset', () => {
      const parsed = parseGanttSearchParams({dateStart: '2026-01-01', dateEnd: '2026-03-31', datePreset: 'this_week'})
      expect(parsed.dateRange.preset).toBe('this_week')
    })

    it('rejects invalid gantt datePreset (falls back to custom)', () => {
      const parsed = parseGanttSearchParams({dateStart: '2026-01-01', dateEnd: '2026-03-31', datePreset: 'garbage'})
      expect(parsed.dateRange.preset).toBe('custom')
    })

    it('accepts valid overview datePreset', () => {
      const parsed = parseOverviewSearchParams({dateStart: '2026-01-01', dateEnd: '2026-03-31', datePreset: 'last_week'})
      expect(parsed.overviewDateRange.preset).toBe('last_week')
    })
  })

  describe('parseSort edge cases', () => {
    it('handles sort with missing direction (defaults to asc)', () => {
      const parsed = parseTableSearchParams({sort: 'title'})
      expect(parsed.sort).toEqual([{direction: 'asc', fieldKey: 'title'}])
    })

    it('handles sort with explicit asc', () => {
      const parsed = parseTableSearchParams({sort: 'title:asc'})
      expect(parsed.sort).toEqual([{direction: 'asc', fieldKey: 'title'}])
    })

    it('handles sort with explicit desc', () => {
      const parsed = parseTableSearchParams({sort: 'priority:desc'})
      expect(parsed.sort).toEqual([{direction: 'desc', fieldKey: 'priority'}])
    })

    it('handles invalid sort direction (defaults to asc)', () => {
      const parsed = parseTableSearchParams({sort: 'title:invalid'})
      expect(parsed.sort).toEqual([{direction: 'asc', fieldKey: 'title'}])
    })

    it('filters out entries with empty fieldKey', () => {
      const parsed = parseTableSearchParams({sort: ':asc'})
      expect(parsed.sort).toEqual([])
    })
  })

  describe('parseStringList edge cases', () => {
    it('trims whitespace from items', () => {
      const parsed = parseTableSearchParams({status: ' s1 , s2 '})
      expect(parsed.filters.status).toEqual(['s1', 's2'])
    })

    it('filters out empty items', () => {
      const parsed = parseTableSearchParams({status: 's1,,s2,'})
      expect(parsed.filters.status).toEqual(['s1', 's2'])
    })
  })
})
