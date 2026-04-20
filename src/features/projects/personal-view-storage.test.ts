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

describe('personal view storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  describe('setPersonalTableViewConfigToStorage', () => {
    it('round-trips config correctly', () => {
      const config = {
        columnWidths: {title: 250},
        filters: {priority: ['high' as const], status: []},
        groupBy: 'priority' as const,
        personFilterUserId: 'user-1',
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
        filters: {priority: [], status: ['s1']},
        groupBy: 'status' as const,
        personFilterUserId: null,
        sort: [],
        visibleFieldKeys: ['assignee'],
      }
      setPersonalTableViewConfigToStorage('view-1', config)
      expect(getPersonalTableViewConfigFromStorage('view-1')).toEqual(config)
    })

    it('returns null for corrupt JSON', () => {
      localStorage.setItem('rocketboard:personalTableView:view-1', 'not-json')
      expect(getPersonalTableViewConfigFromStorage('view-1')).toBeNull()
    })

    it('ignores legacy taskMode field', () => {
      localStorage.setItem('rocketboard:personalTableView:view-1', JSON.stringify({
        columnWidths: {},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
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
        filters: {priority: [], status: []},
        personFilterUserId: null,
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
        filters: {priority: ['high'], status: []},
        personFilterUserId: 'user-1',
        sort: [],
      }
      setPersonalBoardViewConfigToStorage('view-1', config)
      expect(getPersonalBoardViewConfigFromStorage('view-1')).toEqual(config)
    })

    it('defaults collapsed columns to an empty array when omitted', () => {
      localStorage.setItem('rocketboard:personalBoardView:view-1', JSON.stringify({
        filters: {priority: [], status: []},
        personFilterUserId: null,
        sort: [],
      }))

      expect(getPersonalBoardViewConfigFromStorage('view-1')).toEqual({
        collapsedColumnIds: [],
        filters: {priority: [], status: []},
        personFilterUserId: null,
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
        overviewSprintId: null,
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
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sort: [],
        visibleFieldKeys: [],
      })
      setPersonalGanttViewConfigToStorage('view-1', {
        dateRange: {endDate: null, preset: 'all_time', startDate: null},
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
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
        filters: {priority: [], status: []},
        groupBy: 'group',
        personFilterUserId: null,
        sort: [],
        visibleFieldKeys: [],
      })
      setPersonalTableViewConfigToStorage('view-2', {
        columnWidths: {title: 300},
        filters: {priority: [], status: []},
        groupBy: 'status',
        personFilterUserId: null,
        sort: [],
        visibleFieldKeys: ['assignee'],
      })

      clearPersonalViewConfig('view-1')

      expect(getPersonalTableViewConfigFromStorage('view-1')).toBeNull()
      expect(getPersonalTableViewConfigFromStorage('view-2')).not.toBeNull()
    })
  })
})
