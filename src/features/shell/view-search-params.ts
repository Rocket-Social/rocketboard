/**
 * URL search param schemas for view routes.
 *
 * Each view type defines its own search params. TanStack Router's
 * `validateSearch` parses raw URL params into typed objects.
 * `useSearch()` returns the validated params.
 * Changing view config = `navigate({ search: newParams })`.
 *
 * Format examples:
 *   ?groupBy=status&sort=due_at:asc&status=id1,id2&person=userId
 */

import type {TableGroupBy} from '../cards/card.types'
import type {GanttTimeScale} from './views/GanttView'
import {
  isDefaultTableVisibleFieldKeys,
  normalizeProjectTableVisibleFieldKeys,
  type ProjectTableFilters,
  type ProjectTableSort,
} from '../projects/project-view.types'
import type {OverviewDateRange} from './OverviewDateRangePicker'
import {defaultOverviewDateRange} from './OverviewDateRangePicker'

// ── Parsing helpers ──────────────────────────────────────────────

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function parseGroupBy(value: unknown): TableGroupBy | undefined {
  const v = parseString(value)
  if (v === 'assignee' || v === 'priority' || v === 'status' || v === 'due_date' || v === 'group') {
    return v
  }
  return undefined
}

const validDatePresets = new Set(['all_time', 'custom', 'last_week', 'next_week', 'this_week'])

function parseDatePreset(value: unknown): OverviewDateRange['preset'] | undefined {
  const v = parseString(value)
  return v && validDatePresets.has(v) ? v as OverviewDateRange['preset'] : undefined
}

function parseSort(value: unknown): ProjectTableSort | undefined {
  const str = parseString(value)
  if (!str) return undefined
  const entries = str.split(',').map((part) => {
    const [fieldKey, dir] = part.split(':')
    return {
      direction: (dir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
      fieldKey: fieldKey?.trim() ?? '',
    }
  }).filter((e) => e.fieldKey)
  return entries.length > 0 ? entries : undefined
}

function parseTimeScale(value: unknown): GanttTimeScale | undefined {
  const v = parseString(value)
  if (v === 'day' || v === 'week' || v === 'month') return v
  return undefined
}

// ── Serialization helpers ────────────────────────────────────────

export function serializeSort(sort: ProjectTableSort): string | undefined {
  if (sort.length === 0) return undefined
  return sort.map((e) => `${e.fieldKey}:${e.direction}`).join(',')
}

export function serializeStringList(list: string[]): string | undefined {
  return list.length > 0 ? list.join(',') : undefined
}

/** Returns true if the search params object has any non-undefined values (user navigated with explicit params). */
export function hasExplicitSearchParams(params: Record<string, unknown>): boolean {
  return Object.values(params).some((v) => v !== undefined)
}

// ── Table search params ──────────────────────────────────────────
export type TableSearchParams = {
  groupBy?: TableGroupBy
  sort?: string       // serialized: "field:asc,field2:desc"
  status?: string     // serialized: "id1,id2"
  priority?: string   // serialized: "id1,id2"
  person?: string     // userId
  fields?: string     // serialized: "field1,field2"
}

export function validateTableSearch(raw: Record<string, unknown>): TableSearchParams {
  return {
    groupBy: parseGroupBy(raw.groupBy),
    sort: parseString(raw.sort) ?? undefined,
    status: parseString(raw.status) ?? undefined,
    priority: parseString(raw.priority) ?? undefined,
    person: parseString(raw.person) ?? undefined,
    fields: parseString(raw.fields) ?? undefined,
  }
}

export function parseTableSearchParams(search: TableSearchParams) {
  return {
    groupBy: search.groupBy ?? 'group' as TableGroupBy,
    sort: parseSort(search.sort) ?? [] as ProjectTableSort,
    filters: {
      status: parseStringList(search.status),
      priority: parseStringList(search.priority),
    } as ProjectTableFilters,
    personFilterUserId: search.person ?? null,
    visibleFieldKeys: normalizeProjectTableVisibleFieldKeys(parseStringList(search.fields)),
  }
}

export function buildTableSearchParams(config: {
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sort: ProjectTableSort
  visibleFieldKeys: string[]
}): TableSearchParams {
  const normalizedVisibleFieldKeys = normalizeProjectTableVisibleFieldKeys(config.visibleFieldKeys)

  return {
    groupBy: config.groupBy !== 'group' ? config.groupBy : undefined,
    sort: serializeSort(config.sort),
    status: serializeStringList(config.filters.status),
    priority: serializeStringList(config.filters.priority),
    person: config.personFilterUserId ?? undefined,
    fields: isDefaultTableVisibleFieldKeys(normalizedVisibleFieldKeys)
      ? undefined
      : serializeStringList(normalizedVisibleFieldKeys),
  }
}

// ── Board search params ──────────────────────────────────────────

export type BoardSearchParams = {
  sort?: string
  status?: string
  priority?: string
  person?: string
}

export function validateBoardSearch(raw: Record<string, unknown>): BoardSearchParams {
  return {
    sort: parseString(raw.sort) ?? undefined,
    status: parseString(raw.status) ?? undefined,
    priority: parseString(raw.priority) ?? undefined,
    person: parseString(raw.person) ?? undefined,
  }
}

export function parseBoardSearchParams(search: BoardSearchParams) {
  return {
    sort: parseSort(search.sort) ?? [] as ProjectTableSort,
    filters: {
      status: parseStringList(search.status),
      priority: parseStringList(search.priority),
    } as ProjectTableFilters,
    personFilterUserId: search.person ?? null,
  }
}

export function buildBoardSearchParams(config: {
  filters: ProjectTableFilters
  personFilterUserId: string | null
  sort: ProjectTableSort
}): BoardSearchParams {
  return {
    sort: serializeSort(config.sort),
    status: serializeStringList(config.filters.status),
    priority: serializeStringList(config.filters.priority),
    person: config.personFilterUserId ?? undefined,
  }
}

// ── Gantt search params ──────────────────────────────────────────

export type GanttSearchParams = {
  groupBy?: TableGroupBy
  sort?: string
  status?: string
  priority?: string
  person?: string
  timeScale?: GanttTimeScale
  dateStart?: string
  dateEnd?: string
  datePreset?: string
}

export function validateGanttSearch(raw: Record<string, unknown>): GanttSearchParams {
  return {
    groupBy: parseGroupBy(raw.groupBy),
    sort: parseString(raw.sort) ?? undefined,
    status: parseString(raw.status) ?? undefined,
    priority: parseString(raw.priority) ?? undefined,
    person: parseString(raw.person) ?? undefined,
    timeScale: parseTimeScale(raw.timeScale),
    dateStart: parseString(raw.dateStart) ?? undefined,
    dateEnd: parseString(raw.dateEnd) ?? undefined,
    datePreset: parseString(raw.datePreset) ?? undefined,
  }
}

export function parseGanttSearchParams(search: GanttSearchParams) {
  const dateRange: OverviewDateRange = search.dateStart && search.dateEnd
    ? {endDate: search.dateEnd, preset: parseDatePreset(search.datePreset) ?? 'custom', startDate: search.dateStart}
    : defaultOverviewDateRange
  return {
    groupBy: search.groupBy ?? 'group' as TableGroupBy,
    sort: parseSort(search.sort) ?? [] as ProjectTableSort,
    filters: {
      status: parseStringList(search.status),
      priority: parseStringList(search.priority),
    } as ProjectTableFilters,
    personFilterUserId: search.person ?? null,
    timeScale: search.timeScale ?? 'week' as GanttTimeScale,
    dateRange,
  }
}

export function buildGanttSearchParams(config: {
  dateRange: OverviewDateRange
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sort: ProjectTableSort
  timeScale: GanttTimeScale
}): GanttSearchParams {
  return {
    groupBy: config.groupBy !== 'group' ? config.groupBy : undefined,
    sort: serializeSort(config.sort),
    status: serializeStringList(config.filters.status),
    priority: serializeStringList(config.filters.priority),
    person: config.personFilterUserId ?? undefined,
    timeScale: config.timeScale !== 'week' ? config.timeScale : undefined,
    dateStart: config.dateRange.startDate || undefined,
    dateEnd: config.dateRange.endDate || undefined,
    datePreset: config.dateRange.preset !== 'all_time' ? config.dateRange.preset : undefined,
  }
}

// ── Overview search params ───────────────────────────────────────

export type OverviewSearchParams = {
  group?: string      // groupId
  sprint?: string     // sprintId
  assignees?: string  // comma-separated userIds
  priorities?: string // comma-separated priorityIds
  panel?: string
  dateStart?: string
  dateEnd?: string
  datePreset?: string
}

export function validateOverviewSearch(raw: Record<string, unknown>): OverviewSearchParams {
  return {
    group: parseString(raw.group) ?? undefined,
    sprint: parseString(raw.sprint) ?? undefined,
    assignees: parseString(raw.assignees) ?? undefined,
    priorities: parseString(raw.priorities) ?? undefined,
    panel: parseString(raw.panel) ?? undefined,
    dateStart: parseString(raw.dateStart) ?? undefined,
    dateEnd: parseString(raw.dateEnd) ?? undefined,
    datePreset: parseString(raw.datePreset) ?? undefined,
  }
}

export function parseOverviewSearchParams(search: OverviewSearchParams) {
  const dateRange: OverviewDateRange = search.dateStart && search.dateEnd
    ? {endDate: search.dateEnd, preset: parseDatePreset(search.datePreset) ?? 'custom', startDate: search.dateStart}
    : defaultOverviewDateRange
  return {
    overviewGroupId: search.group ?? null,
    overviewSprintId: search.sprint ?? null,
    overviewAssigneeIds: parseStringList(search.assignees),
    overviewPanel: (search.panel === 'access' ? 'access' : null) as 'access' | null,
    overviewPriorityKeys: parseStringList(search.priorities),
    overviewDateRange: dateRange,
  }
}

export function buildOverviewSearchParams(config: {
  overviewAssigneeIds: string[]
  overviewDateRange: OverviewDateRange
  overviewGroupId: string | null
  overviewPanel?: 'access' | null
  overviewPriorityKeys: string[]
  overviewSprintId?: string | null
}): OverviewSearchParams {
  return {
    group: config.overviewGroupId ?? undefined,
    sprint: config.overviewSprintId ?? undefined,
    assignees: serializeStringList(config.overviewAssigneeIds),
    priorities: serializeStringList(config.overviewPriorityKeys),
    panel: config.overviewPanel ?? undefined,
    dateStart: config.overviewDateRange.startDate || undefined,
    dateEnd: config.overviewDateRange.endDate || undefined,
    datePreset: config.overviewDateRange.preset !== 'all_time' ? config.overviewDateRange.preset : undefined,
  }
}
