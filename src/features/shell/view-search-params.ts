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
  type ProjectGanttViewDraft,
  type ProjectTableFilters,
  type ProjectTableSort,
} from '../projects/project-view.types'
import type {OverviewDateRange} from './OverviewDateRangePicker'
import {defaultOverviewDateRange} from './OverviewDateRangePicker'
import {normalizeTaskScopeSprintIds} from './task-scope'

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

function buildDateRangeSearchParams(dateRange: OverviewDateRange) {
  const hasDateWindow = Boolean(dateRange.startDate && dateRange.endDate)
  return {
    dateEnd: hasDateWindow ? dateRange.endDate || undefined : undefined,
    datePreset: hasDateWindow && dateRange.preset !== 'all_time' ? dateRange.preset : undefined,
    dateStart: hasDateWindow ? dateRange.startDate || undefined : undefined,
  }
}

// ── Table search params ──────────────────────────────────────────
export type TableSearchParams = {
  dateEnd?: string
  datePreset?: string
  dateStart?: string
  groupBy?: TableGroupBy
  sort?: string       // serialized: "field:asc,field2:desc"
  status?: string     // serialized: "id1,id2"
  priority?: string   // serialized: "id1,id2"
  person?: string     // userId
  fields?: string     // serialized: "field1,field2"
  sprints?: string    // serialized: "sprint1,sprint2"
}

export function validateTableSearch(raw: Record<string, unknown>): TableSearchParams {
  return {
    dateEnd: parseString(raw.dateEnd) ?? undefined,
    datePreset: parseString(raw.datePreset) ?? undefined,
    dateStart: parseString(raw.dateStart) ?? undefined,
    groupBy: parseGroupBy(raw.groupBy),
    sort: parseString(raw.sort) ?? undefined,
    status: parseString(raw.status) ?? undefined,
    priority: parseString(raw.priority) ?? undefined,
    person: parseString(raw.person) ?? undefined,
    fields: parseString(raw.fields) ?? undefined,
    sprints: parseString(raw.sprints) ?? undefined,
  }
}

export function parseTableSearchParams(search: TableSearchParams) {
  const dateRange: OverviewDateRange = search.dateStart && search.dateEnd
    ? {endDate: search.dateEnd, preset: parseDatePreset(search.datePreset) ?? 'custom', startDate: search.dateStart}
    : defaultOverviewDateRange
  return {
    dateRange,
    groupBy: search.groupBy ?? 'group' as TableGroupBy,
    sort: parseSort(search.sort) ?? [] as ProjectTableSort,
    filters: {
      status: parseStringList(search.status),
      priority: parseStringList(search.priority),
    } as ProjectTableFilters,
    personFilterUserId: search.person ?? null,
    sprintIds: normalizeTaskScopeSprintIds(parseStringList(search.sprints)),
    visibleFieldKeys: normalizeProjectTableVisibleFieldKeys(parseStringList(search.fields)),
  }
}

export function buildTableSearchParams(config: {
  dateRange?: OverviewDateRange
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sprintIds?: string[]
  sort: ProjectTableSort
  visibleFieldKeys: string[]
}): TableSearchParams {
  const normalizedVisibleFieldKeys = normalizeProjectTableVisibleFieldKeys(config.visibleFieldKeys)
  const dateRange = config.dateRange ?? defaultOverviewDateRange

  return {
    ...buildDateRangeSearchParams(dateRange),
    groupBy: config.groupBy !== 'group' ? config.groupBy : undefined,
    sort: serializeSort(config.sort),
    status: serializeStringList(config.filters.status),
    priority: serializeStringList(config.filters.priority),
    person: config.personFilterUserId ?? undefined,
    fields: isDefaultTableVisibleFieldKeys(normalizedVisibleFieldKeys)
      ? undefined
      : serializeStringList(normalizedVisibleFieldKeys),
    sprints: serializeStringList(normalizeTaskScopeSprintIds(config.sprintIds ?? [])),
  }
}

type TableSearchDraft = ReturnType<typeof parseTableSearchParams>

export function applyExplicitTableSearchParams(
  config: TableSearchDraft,
  search: TableSearchParams,
): TableSearchDraft {
  const parsed = parseTableSearchParams(search)
  let nextConfig: TableSearchDraft = {...config}

  if (search.groupBy !== undefined) {
    nextConfig.groupBy = parsed.groupBy
  }

  if (search.sort !== undefined) {
    nextConfig.sort = parsed.sort
  }

  if (search.status !== undefined) {
    nextConfig = {
      ...nextConfig,
      filters: {
        ...nextConfig.filters,
        status: parsed.filters.status,
      },
    }
  }

  if (search.priority !== undefined) {
    nextConfig = {
      ...nextConfig,
      filters: {
        ...nextConfig.filters,
        priority: parsed.filters.priority,
      },
    }
  }

  if (search.person !== undefined) {
    nextConfig.personFilterUserId = parsed.personFilterUserId
  }

  if (search.fields !== undefined) {
    nextConfig.visibleFieldKeys = parsed.visibleFieldKeys
  }

  if (search.sprints !== undefined) {
    nextConfig.sprintIds = parsed.sprintIds
  }

  if (search.dateStart !== undefined || search.dateEnd !== undefined || search.datePreset !== undefined) {
    nextConfig.dateRange = parsed.dateRange
  }

  return nextConfig
}

// ── Board search params ──────────────────────────────────────────

// Phase 4 PR 4-B-2: BoardView supports an `assignee` groupBy. Status
// is the legacy default; assignee maps the columns to humans + agents
// + unassigned and turns each drop into a `setCardAssignee` call. Only
// these two values are valid on a board (TableView/Gantt have a wider
// set including priority/group/due_date that don't make sense as
// kanban columns) — extra values from the wider router union are
// silently dropped to 'status' by the parser.
export type BoardGroupBy = 'status' | 'assignee'

function parseBoardGroupBy(value: unknown): BoardGroupBy | undefined {
  const v = parseString(value)
  return v === 'assignee' || v === 'status' ? v : undefined
}

// Shape stays loose at the URL boundary because the TanStack router
// infers a wider TableGroupBy union across views. Narrow values land
// in `parseBoardSearchParams`.
export type BoardSearchParams = {
  dateEnd?: string
  datePreset?: string
  dateStart?: string
  groupBy?: TableGroupBy
  sort?: string
  status?: string
  priority?: string
  person?: string
  sprints?: string
}

export function validateBoardSearch(raw: Record<string, unknown>): BoardSearchParams {
  return {
    dateEnd: parseString(raw.dateEnd) ?? undefined,
    datePreset: parseString(raw.datePreset) ?? undefined,
    dateStart: parseString(raw.dateStart) ?? undefined,
    groupBy: parseBoardGroupBy(raw.groupBy),
    sort: parseString(raw.sort) ?? undefined,
    status: parseString(raw.status) ?? undefined,
    priority: parseString(raw.priority) ?? undefined,
    person: parseString(raw.person) ?? undefined,
    sprints: parseString(raw.sprints) ?? undefined,
  }
}

export function parseBoardSearchParams(search: BoardSearchParams) {
  const dateRange: OverviewDateRange = search.dateStart && search.dateEnd
    ? {endDate: search.dateEnd, preset: parseDatePreset(search.datePreset) ?? 'custom', startDate: search.dateStart}
    : defaultOverviewDateRange
  return {
    dateRange,
    groupBy: parseBoardGroupBy(search.groupBy) ?? 'status' as BoardGroupBy,
    sort: parseSort(search.sort) ?? [] as ProjectTableSort,
    filters: {
      status: parseStringList(search.status),
      priority: parseStringList(search.priority),
    } as ProjectTableFilters,
    personFilterUserId: search.person ?? null,
    sprintIds: normalizeTaskScopeSprintIds(parseStringList(search.sprints)),
  }
}

export function buildBoardSearchParams(config: {
  dateRange?: OverviewDateRange
  filters: ProjectTableFilters
  groupBy?: BoardGroupBy
  personFilterUserId: string | null
  sprintIds?: string[]
  sort: ProjectTableSort
}): BoardSearchParams {
  const dateRange = config.dateRange ?? defaultOverviewDateRange
  return {
    ...buildDateRangeSearchParams(dateRange),
    groupBy: config.groupBy && config.groupBy !== 'status'
      ? (config.groupBy as TableGroupBy)
      : undefined,
    sort: serializeSort(config.sort),
    status: serializeStringList(config.filters.status),
    priority: serializeStringList(config.filters.priority),
    person: config.personFilterUserId ?? undefined,
    sprints: serializeStringList(normalizeTaskScopeSprintIds(config.sprintIds ?? [])),
  }
}

type BoardSearchDraft = ReturnType<typeof parseBoardSearchParams>

export function applyExplicitBoardSearchParams(
  config: BoardSearchDraft,
  search: BoardSearchParams,
): BoardSearchDraft {
  const parsed = parseBoardSearchParams(search)
  let nextConfig: BoardSearchDraft = {...config}

  if (search.groupBy !== undefined) {
    nextConfig.groupBy = parsed.groupBy
  }

  if (search.sort !== undefined) {
    nextConfig.sort = parsed.sort
  }

  if (search.status !== undefined) {
    nextConfig = {
      ...nextConfig,
      filters: {
        ...nextConfig.filters,
        status: parsed.filters.status,
      },
    }
  }

  if (search.priority !== undefined) {
    nextConfig = {
      ...nextConfig,
      filters: {
        ...nextConfig.filters,
        priority: parsed.filters.priority,
      },
    }
  }

  if (search.person !== undefined) {
    nextConfig.personFilterUserId = parsed.personFilterUserId
  }

  if (search.sprints !== undefined) {
    nextConfig.sprintIds = parsed.sprintIds
  }

  if (search.dateStart !== undefined || search.dateEnd !== undefined || search.datePreset !== undefined) {
    nextConfig.dateRange = parsed.dateRange
  }

  return nextConfig
}

// ── Gantt search params ──────────────────────────────────────────

export type GanttSearchParams = {
  groupBy?: TableGroupBy
  sort?: string
  status?: string
  priority?: string
  person?: string
  sprints?: string
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
    sprints: parseString(raw.sprints) ?? undefined,
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
    sprintIds: normalizeTaskScopeSprintIds(parseStringList(search.sprints)),
    timeScale: search.timeScale ?? 'week' as GanttTimeScale,
    dateRange,
  }
}

export function buildGanttSearchParams(config: {
  dateRange: OverviewDateRange
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sprintIds?: string[]
  sort: ProjectTableSort
  timeScale: GanttTimeScale
}): GanttSearchParams {
  return {
    groupBy: config.groupBy !== 'group' ? config.groupBy : undefined,
    sort: serializeSort(config.sort),
    status: serializeStringList(config.filters.status),
    priority: serializeStringList(config.filters.priority),
    person: config.personFilterUserId ?? undefined,
    sprints: serializeStringList(normalizeTaskScopeSprintIds(config.sprintIds ?? [])),
    timeScale: config.timeScale !== 'week' ? config.timeScale : undefined,
    ...buildDateRangeSearchParams(config.dateRange),
  }
}

type GanttSearchDraft = ProjectGanttViewDraft & {
  sprintIds?: string[]
}

export function applyExplicitGanttSearchParams(
  config: GanttSearchDraft,
  search: GanttSearchParams,
): GanttSearchDraft {
  const parsed = parseGanttSearchParams(search)
  let nextConfig: GanttSearchDraft = {...config}

  if (search.groupBy !== undefined) {
    nextConfig.groupBy = parsed.groupBy
  }

  if (search.sort !== undefined) {
    nextConfig.sort = parsed.sort
  }

  if (search.status !== undefined) {
    nextConfig = {
      ...nextConfig,
      filters: {
        ...nextConfig.filters,
        status: parsed.filters.status,
      },
    }
  }

  if (search.priority !== undefined) {
    nextConfig = {
      ...nextConfig,
      filters: {
        ...nextConfig.filters,
        priority: parsed.filters.priority,
      },
    }
  }

  if (search.person !== undefined) {
    nextConfig.personFilterUserId = parsed.personFilterUserId
  }

  if (search.sprints !== undefined) {
    nextConfig.sprintIds = parsed.sprintIds
  }

  if (search.timeScale !== undefined) {
    nextConfig.timeScale = parsed.timeScale
  }

  if (search.dateStart !== undefined || search.dateEnd !== undefined || search.datePreset !== undefined) {
    nextConfig.dateRange = parsed.dateRange
  }

  return nextConfig
}

// ── Overview search params ───────────────────────────────────────

export type OverviewSearchParams = {
  group?: string      // groupId
  sprints?: string    // comma-separated sprintIds
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
    sprints: parseString(raw.sprints) ?? undefined,
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
  const overviewSprintIds = normalizeTaskScopeSprintIds(parseStringList(search.sprints)).slice(0, 1)
  const fallbackSprintId = search.sprint ?? null
  const normalizedOverviewSprintIds = overviewSprintIds.length > 0
    ? overviewSprintIds
    : fallbackSprintId
      ? [fallbackSprintId]
      : []
  return {
    overviewGroupId: search.group ?? null,
    overviewSprintIds: normalizedOverviewSprintIds,
    overviewSprintId: normalizedOverviewSprintIds[0] ?? null,
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
  overviewSprintIds?: string[]
  overviewSprintId?: string | null
}): OverviewSearchParams {
  const overviewSprintIds = normalizeTaskScopeSprintIds(
    config.overviewSprintIds
      ?? (config.overviewSprintId ? [config.overviewSprintId] : []),
  ).slice(0, 1)
  return {
    group: config.overviewGroupId ?? undefined,
    sprints: serializeStringList(overviewSprintIds),
    assignees: serializeStringList(config.overviewAssigneeIds),
    priorities: serializeStringList(config.overviewPriorityKeys),
    panel: config.overviewPanel ?? undefined,
    ...buildDateRangeSearchParams(config.overviewDateRange),
  }
}

type OverviewSearchDraft = {
  overviewAssigneeIds: string[]
  overviewDateRange: OverviewDateRange
  overviewGroupId: string | null
  overviewPanel: 'access' | null
  overviewPriorityKeys: string[]
  overviewSprintId: string | null
  overviewSprintIds: string[]
}

export function applyExplicitOverviewSearchParams<T extends OverviewSearchDraft>(
  config: T,
  search: OverviewSearchParams,
): T {
  const parsed = parseOverviewSearchParams(search)
  let nextConfig: T = {...config}

  if (search.group !== undefined) {
    nextConfig.overviewGroupId = parsed.overviewGroupId
  }

  if (search.sprints !== undefined || search.sprint !== undefined) {
    nextConfig.overviewSprintIds = parsed.overviewSprintIds
    nextConfig.overviewSprintId = parsed.overviewSprintId
  }

  if (search.assignees !== undefined) {
    nextConfig.overviewAssigneeIds = parsed.overviewAssigneeIds
  }

  if (search.priorities !== undefined) {
    nextConfig.overviewPriorityKeys = parsed.overviewPriorityKeys
  }

  if (search.panel !== undefined) {
    nextConfig.overviewPanel = parsed.overviewPanel
  }

  if (search.dateStart !== undefined || search.dateEnd !== undefined || search.datePreset !== undefined) {
    nextConfig.overviewDateRange = parsed.overviewDateRange
  }

  return nextConfig
}
