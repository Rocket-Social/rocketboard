// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest'

import {
  clearPersonalViewConfig,
  getPersonalBoardViewConfigFromStorage,
  getPersonalCanvasViewport,
  getPersonalGanttViewConfigFromStorage,
  getPersonalTableViewConfigFromStorage,
  type PersonalBoardViewConfig,
  type PersonalCanvasViewport,
  type PersonalGanttViewConfig,
  setPersonalBoardViewConfigToStorage,
  setPersonalCanvasViewportToStorage,
  setPersonalGanttViewConfigToStorage,
  setPersonalOverviewConfigToStorage,
  setPersonalTableViewConfigToStorage,
} from './personal-view-storage'
import {defaultOverviewDateRange} from './project-view.types'

describe('personal view storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  describe('setPersonalTableViewConfigToStorage', () => {
    it('round-trips config correctly', () => {
      const config = {
        columnWidths: {title: 250},
        dateRange: defaultOverviewDateRange,
        filters: {priority: ['high' as const], status: []},
        groupBy: 'priority' as const,
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-1'],
        sort: [{fieldKey: 'title', direction: 'asc' as const}],
        visibleFieldKeys: ['status'],
      }
      setPersonalTableViewConfigToStorage('view-2', config)
      const raw = localStorage.getItem('rocketboard:personalTableView:view-2')
      expect(JSON.parse(raw!)).toEqual(config)
    })
  })

  describe('getPersonalTableViewConfigFromStorage', () => {
    it('returns null when no config stored', () => {
      expect(getPersonalTableViewConfigFromStorage('view-1')).toBeNull()
    })

    it('returns parsed config', () => {
      const config = {
        columnWidths: {title: 200},
        dateRange: {endDate: '2026-04-30', preset: 'custom' as const, startDate: '2026-04-01'},
        filters: {priority: [], status: ['s1']},
        groupBy: 'status' as const,
        personFilterUserId: null,
        sprintIds: ['sprint-2'],
        sort: [],
        visibleFieldKeys: ['assignee'],
      }
      setPersonalTableViewConfigToStorage('view-1', config)
      expect(getPersonalTableViewConfigFromStorage('view-1')).toEqual(config)
    })

    it('clamps stored sprint scope to three items', () => {
      localStorage.setItem('rocketboard:personalTableView:view-1', JSON.stringify({
        columnWidths: {},
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: ['sprint-1', 'sprint-2', 'sprint-3', 'sprint-4'],
        sort: [],
        visibleFieldKeys: ['status'],
      }))

      expect(getPersonalTableViewConfigFromStorage('view-1')?.sprintIds).toEqual([
        'sprint-1',
        'sprint-2',
        'sprint-3',
      ])
    })

    it('returns null for corrupt JSON', () => {
      localStorage.setItem('rocketboard:personalTableView:view-1', 'not-json')
      expect(getPersonalTableViewConfigFromStorage('view-1')).toBeNull()
    })

    it('ignores legacy taskMode field', () => {
      localStorage.setItem('rocketboard:personalTableView:view-1', JSON.stringify({
        columnWidths: {},
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        taskMode: 'sprint',
        visibleFieldKeys: ['status'],
      }))
      const result = getPersonalTableViewConfigFromStorage('view-1')
      expect(result).not.toBeNull()
      expect(result).not.toHaveProperty('taskMode')
    })
  })

  describe('setPersonalBoardViewConfigToStorage', () => {
    it('round-trips board config', () => {
      const config: PersonalBoardViewConfig = {
        collapsedColumnIds: ['status-1'],
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        personFilterUserId: null,
        sprintIds: ['sprint-1'],
        sort: [{direction: 'desc', fieldKey: 'priority'}],
      }
      setPersonalBoardViewConfigToStorage('view-board-2', config)
      const raw = localStorage.getItem('rocketboard:personalBoardView:view-board-2')
      expect(JSON.parse(raw!)).toEqual(config)
    })
  })

  describe('getPersonalBoardViewConfigFromStorage', () => {
    it('returns null when no config stored', () => {
      expect(getPersonalBoardViewConfigFromStorage('view-1')).toBeNull()
    })

    it('returns parsed config', () => {
      const config: PersonalBoardViewConfig = {
        collapsedColumnIds: ['status-2'],
        dateRange: {endDate: '2026-05-14', preset: 'custom', startDate: '2026-05-01'},
        filters: {priority: ['high'], status: []},
        personFilterUserId: 'user-1',
        sprintIds: ['sprint-2', 'sprint-3'],
        sort: [],
      }
      setPersonalBoardViewConfigToStorage('view-1', config)
      expect(getPersonalBoardViewConfigFromStorage('view-1')).toEqual(config)
    })

    it('defaults collapsed columns to an empty array when omitted', () => {
      localStorage.setItem('rocketboard:personalBoardView:view-1', JSON.stringify({
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
      }))

      expect(getPersonalBoardViewConfigFromStorage('view-1')).toEqual({
        collapsedColumnIds: [],
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
      })
    })

    it('returns null for corrupt JSON', () => {
      localStorage.setItem('rocketboard:personalBoardView:view-1', '{bad')
      expect(getPersonalBoardViewConfigFromStorage('view-1')).toBeNull()
    })
  })

  describe('setPersonalOverviewConfigToStorage', () => {
    it('round-trips overview config', () => {
      const config = {
        overviewAssigneeIds: [],
        overviewDateRange: {endDate: null, preset: 'all_time' as const, startDate: null},
        overviewGroupId: null,
        overviewPriorityKeys: [],
        overviewSprintIds: ['sprint-4'],
        overviewSprintId: 'sprint-4',
        overviewWidgets: [
          {id: 'progress_status', type: 'progress_status' as const, title: null, width: 1 as const},
        ],
      }
      setPersonalOverviewConfigToStorage('view-3', config)
      const raw = localStorage.getItem('rocketboard:personalOverviewView:view-3')
      expect(JSON.parse(raw!)).toEqual(config)
    })
  })

  describe('setPersonalGanttViewConfigToStorage', () => {
    it('round-trips gantt config', () => {
      const config: PersonalGanttViewConfig = {
        dateRange: {endDate: null, preset: 'all_time' as const, startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'due_date',
        personFilterUserId: null,
        sprintIds: ['sprint-1'],
        sort: [],
        timeScale: 'week' as const,
      }
      setPersonalGanttViewConfigToStorage('view-5', config)
      const raw = localStorage.getItem('rocketboard:personalGanttView:view-5')
      expect(JSON.parse(raw!)).toEqual(config)
    })
  })

  describe('getPersonalGanttViewConfigFromStorage', () => {
    it('returns null when no config stored', () => {
      expect(getPersonalGanttViewConfigFromStorage('view-1')).toBeNull()
    })

    it('returns parsed config', () => {
      const config: PersonalGanttViewConfig = {
        dateRange: {endDate: '2026-04-30', preset: 'custom', startDate: '2026-04-01'},
        filters: {priority: [], status: ['s1']},
        groupBy: 'assignee',
        personFilterUserId: 'u1',
        sprintIds: ['sprint-1', 'sprint-2'],
        sort: [{fieldKey: 'due_date', direction: 'desc'}],
        timeScale: 'day',
      }
      setPersonalGanttViewConfigToStorage('view-1', config)
      expect(getPersonalGanttViewConfigFromStorage('view-1')).toEqual(config)
    })

    it('returns null for corrupt JSON', () => {
      localStorage.setItem('rocketboard:personalGanttView:view-1', 'nope')
      expect(getPersonalGanttViewConfigFromStorage('view-1')).toBeNull()
    })

    it('ignores legacy taskMode field', () => {
      localStorage.setItem('rocketboard:personalGanttView:view-1', JSON.stringify({
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        taskMode: 'sprint',
        timeScale: 'week',
      }))
      const result = getPersonalGanttViewConfigFromStorage('view-1')
      expect(result).not.toBeNull()
      expect(result).not.toHaveProperty('taskMode')
    })
  })

  describe('canvas viewport storage', () => {
    it('returns null when no viewport is stored', () => {
      expect(getPersonalCanvasViewport('view-canvas')).toBeNull()
    })

    it('round-trips the stored viewport', () => {
      const viewport: PersonalCanvasViewport = {
        scale: 1.25,
        x: -120,
        y: 48,
      }

      setPersonalCanvasViewportToStorage('view-canvas', viewport)
      expect(getPersonalCanvasViewport('view-canvas')).toEqual(viewport)
    })
  })

  describe('clearPersonalViewConfig', () => {
    it('removes all personal config keys for a view', () => {
      setPersonalTableViewConfigToStorage('view-1', {
        columnWidths: {},
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        visibleFieldKeys: [],
      })
      setPersonalGanttViewConfigToStorage('view-1', {
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        timeScale: 'week',
      })

      clearPersonalViewConfig('view-1')

      expect(getPersonalTableViewConfigFromStorage('view-1')).toBeNull()
      expect(getPersonalGanttViewConfigFromStorage('view-1')).toBeNull()
    })

    it('does not affect other views', () => {
      setPersonalTableViewConfigToStorage('view-1', {
        columnWidths: {},
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sprintIds: [],
        sort: [],
        visibleFieldKeys: [],
      })
      setPersonalTableViewConfigToStorage('view-2', {
        columnWidths: {title: 300},
        dateRange: defaultOverviewDateRange,
        filters: {priority: [], status: []},
        groupBy: 'status',
        personFilterUserId: null,
        sprintIds: ['sprint-9'],
        sort: [],
        visibleFieldKeys: ['assignee'],
      })

      clearPersonalViewConfig('view-1')

      expect(getPersonalTableViewConfigFromStorage('view-1')).toBeNull()
      expect(getPersonalTableViewConfigFromStorage('view-2')).not.toBeNull()
    })
  })
})
