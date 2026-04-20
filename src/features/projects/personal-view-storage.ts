import type {TableGroupBy} from '../cards/card.types'
import type {OverviewDateRange} from '../shell/OverviewDateRangePicker'
import type {GanttTimeScale} from '../shell/views/GanttView'
import {
  resolveProjectOverviewConfig,
  type ProjectOverviewConfig,
  type ProjectTableFilters,
  type ProjectTableSort,
} from './project-view.types'

export type PersonalTableViewConfig = {
  columnWidths: Record<string, number>
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sort: ProjectTableSort
  visibleFieldKeys: string[]
}

export type PersonalBoardViewConfig = {
  collapsedColumnIds: string[]
  filters: ProjectTableFilters
  personFilterUserId: string | null
  sort: ProjectTableSort
}

export type PersonalOverviewConfig = ProjectOverviewConfig

export type PersonalGanttViewConfig = {
  dateRange: OverviewDateRange
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sort: ProjectTableSort
  timeScale: GanttTimeScale
}

export type PersonalCanvasViewport = {
  scale: number
  x: number
  y: number
}

function normalizeStoredStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.flatMap((entry: unknown) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  )))
}

export function setPersonalTableViewConfigToStorage(viewId: string, config: PersonalTableViewConfig): void {
  localStorage.setItem(`rocketboard:personalTableView:${viewId}`, JSON.stringify(config))
}

export function getPersonalTableViewConfigFromStorage(viewId: string): PersonalTableViewConfig | null {
  try {
    const raw = localStorage.getItem(`rocketboard:personalTableView:${viewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      columnWidths: parsed.columnWidths ?? {},
      filters: parsed.filters ?? {priority: [], status: []},
      groupBy: parsed.groupBy ?? 'group',
      personFilterUserId: parsed.personFilterUserId ?? null,
      sort: Array.isArray(parsed.sort) ? parsed.sort : [],
      visibleFieldKeys: Array.isArray(parsed.visibleFieldKeys) ? parsed.visibleFieldKeys : [],
    }
  } catch { return null }
}

export function setPersonalBoardViewConfigToStorage(viewId: string, config: PersonalBoardViewConfig): void {
  localStorage.setItem(`rocketboard:personalBoardView:${viewId}`, JSON.stringify(config))
}

export function getPersonalBoardViewConfigFromStorage(viewId: string): PersonalBoardViewConfig | null {
  try {
    const raw = localStorage.getItem(`rocketboard:personalBoardView:${viewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      collapsedColumnIds: normalizeStoredStringList(parsed.collapsedColumnIds),
      filters: parsed.filters ?? {priority: [], status: []},
      personFilterUserId: parsed.personFilterUserId ?? null,
      sort: Array.isArray(parsed.sort) ? parsed.sort : [],
    }
  } catch { return null }
}

export function getPersonalOverviewConfigFromStorage(viewId: string): PersonalOverviewConfig | null {
  try {
    const raw = localStorage.getItem(`rocketboard:personalOverviewView:${viewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return resolveProjectOverviewConfig(parsed as Partial<ProjectOverviewConfig>)
  } catch { return null }
}

export function setPersonalOverviewConfigToStorage(viewId: string, config: PersonalOverviewConfig): void {
  localStorage.setItem(`rocketboard:personalOverviewView:${viewId}`, JSON.stringify(config))
}

export function setPersonalGanttViewConfigToStorage(viewId: string, config: PersonalGanttViewConfig): void {
  localStorage.setItem(`rocketboard:personalGanttView:${viewId}`, JSON.stringify(config))
}

export function getPersonalGanttViewConfigFromStorage(viewId: string): PersonalGanttViewConfig | null {
  try {
    const raw = localStorage.getItem(`rocketboard:personalGanttView:${viewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      dateRange: parsed.dateRange ?? {endDate: null, preset: 'all_time', startDate: null},
      filters: parsed.filters ?? {priority: [], status: []},
      groupBy: parsed.groupBy ?? 'group',
      personFilterUserId: parsed.personFilterUserId ?? null,
      sort: Array.isArray(parsed.sort) ? parsed.sort : [],
      timeScale: parsed.timeScale ?? 'week',
    }
  } catch { return null }
}

export function getPersonalCanvasViewport(viewId: string): PersonalCanvasViewport | null {
  try {
    const raw = localStorage.getItem(`rocketboard:personalCanvasViewport:${viewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as PersonalCanvasViewport
  } catch { return null }
}

export function setPersonalCanvasViewportToStorage(viewId: string, viewport: PersonalCanvasViewport): void {
  localStorage.setItem(`rocketboard:personalCanvasViewport:${viewId}`, JSON.stringify(viewport))
}

export function clearPersonalViewConfig(viewId: string): void {
  localStorage.removeItem(`rocketboard:personalTableView:${viewId}`)
  localStorage.removeItem(`rocketboard:personalBoardView:${viewId}`)
  localStorage.removeItem(`rocketboard:personalGanttView:${viewId}`)
  localStorage.removeItem(`rocketboard:personalOverviewView:${viewId}`)
}
