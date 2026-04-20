import type {TableGroupBy, TaskBoardMode} from '../cards/card.types'

// Domain types — owned here, re-exported by the UI components that consume them.
// This avoids the inverted dependency where domain types were defined in UI components.

export type OverviewDateRangePreset = 'this_week' | 'last_week' | 'next_week' | 'all_time' | 'custom'

export type OverviewDateRange = {
  preset: OverviewDateRangePreset
  startDate: string | null
  endDate: string | null
}

export const defaultOverviewDateRange: OverviewDateRange = {
  preset: 'this_week',
  startDate: null,
  endDate: null,
}

export type GanttTimeScale = 'day' | 'month' | 'week'

export type ProjectCardCollectionViewDraft = {
  filters: ProjectTableFilters
  groupBy: TableGroupBy
  personFilterUserId: string | null
  sort: ProjectTableSort
}

export type ProjectBoardViewDraft = Pick<ProjectCardCollectionViewDraft, 'filters' | 'personFilterUserId' | 'sort'>

export type ProjectTableViewDraft = ProjectCardCollectionViewDraft & {
  collapsedGroups: string[]
  columnWidths: Record<string, number>
  visibleFieldKeys: string[]
}

export type ProjectGanttViewDraft = ProjectCardCollectionViewDraft & {
  dateRange: OverviewDateRange
  timeScale: GanttTimeScale
}

export type OverviewWidgetType =
  | 'progress_status'
  | 'burn_up'
  | 'priority_assignees'
  | 'burn_down'
  | 'progress_bar'

export type OverviewWidgetWidth = 1 | 2 | 3

export type OverviewWidgetConfig = {
  id: string
  title: string | null
  type: OverviewWidgetType
  width: OverviewWidgetWidth
}

const validWidgetTypes = new Set<OverviewWidgetType>([
  'progress_status',
  'burn_up',
  'priority_assignees',
  'burn_down',
  'progress_bar',
])

export const defaultOverviewWidgets: OverviewWidgetConfig[] = [
  {id: 'progress_status', type: 'progress_status', title: null, width: 1},
  {id: 'burn_up', type: 'burn_up', title: null, width: 1},
  {id: 'priority_assignees', type: 'priority_assignees', title: null, width: 1},
]

export function normalizeOverviewWidgets(value: unknown): OverviewWidgetConfig[] {
  if (!Array.isArray(value) || value.length === 0) return [...defaultOverviewWidgets]

  const seen = new Set<string>()
  const result: OverviewWidgetConfig[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const type = raw.type as string
    if (!validWidgetTypes.has(type as OverviewWidgetType)) continue
    if (seen.has(type)) continue
    seen.add(type)

    const width = typeof raw.width === 'number' && [1, 2, 3].includes(raw.width)
      ? (raw.width as OverviewWidgetWidth)
      : 1
    const title = typeof raw.title === 'string' && raw.title.trim().length > 0
      ? raw.title.trim()
      : null
    const id = typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id.trim()
      : type

    result.push({id, title, type: type as OverviewWidgetType, width})
  }

  return result.length > 0 ? result : [...defaultOverviewWidgets]
}

export type ProjectOverviewConfig = {
  overviewAssigneeIds: string[]
  overviewDateRange: OverviewDateRange
  overviewGroupId: string | null
  overviewPriorityKeys: string[]
  overviewSprintId: string | null
  overviewWidgets: OverviewWidgetConfig[]
}

export type ProjectTableViewState = {
  personalConfig: {
    collapsedGroups: string[]
    columnWidths: Record<string, number>
  } | null
  sharedConfig: {
    filters: ProjectTableFilters
    groupBy: TableGroupBy
    personFilterUserId: string | null
    sort: ProjectTableSort
    visibleFieldKeys: string[]
  }
  sharedVersion: number
}

export type TableSortDirection = 'asc' | 'desc'
export type TableSortFieldKey = string
export type ProjectTableSortEntry = {
  direction: TableSortDirection
  fieldKey: TableSortFieldKey
}
export type ProjectTableSort = ProjectTableSortEntry[]

export type ProjectTableFilters = {
  priority: string[]
  status: string[]
}

export const defaultTableVisibleFieldKeys = [
  'assignee',
  'due_date',
  'status',
  'effort',
  'priority',
] as const

const projectViewDateRangePresets = new Set<OverviewDateRangePreset>([
  'all_time',
  'custom',
  'last_week',
  'next_week',
  'this_week',
])

export function normalizeProjectTableCollapsedGroups(value: string[]) {
  return [...new Set(value.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

export function normalizeProjectTableColumnWidths(value: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, width]) => key.trim().length > 0 && Number.isFinite(width))
      .map(([key, width]) => [key.trim().toLowerCase(), Math.max(96, Math.min(600, Math.round(width)))])
      .sort(([leftKey], [rightKey]) => String(leftKey).localeCompare(String(rightKey))),
  )
}

export function normalizeProjectTableVisibleFieldKeys(value: string[] | null | undefined) {
  const normalizedKeys: string[] = []

  for (const fieldKey of value ?? []) {
    const normalizedKey = fieldKey.trim().toLowerCase()

    if (normalizedKey && !normalizedKeys.includes(normalizedKey)) {
      normalizedKeys.push(normalizedKey)
    }
  }

  return normalizedKeys.length > 0 ? normalizedKeys : [...defaultTableVisibleFieldKeys]
}

export function isDefaultTableVisibleFieldKeys(value: string[] | null | undefined) {
  const normalizedKeys = normalizeProjectTableVisibleFieldKeys(value)

  return normalizedKeys.length === defaultTableVisibleFieldKeys.length
    && normalizedKeys.every((fieldKey, index) => fieldKey === defaultTableVisibleFieldKeys[index])
}

function normalizeProjectDateString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : null
}

function normalizeProjectConfigIdList(value: unknown): string[] {
  return [...new Set(
    Array.isArray(value)
      ? value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [],
  )].sort((left, right) => left.localeCompare(right))
}

export function normalizeProjectViewGroupBy(value: string | null | undefined): TableGroupBy {
  if (value === 'assignee') return 'assignee'
  if (value === 'priority') return 'priority'
  if (value === 'status') return 'status'
  if (value === 'due_date') return 'due_date'
  return 'group'
}

export function normalizeProjectTaskBoardMode(value: unknown): TaskBoardMode {
  return value === 'sprint' ? 'sprint' : 'standard'
}

export function normalizeProjectGanttTimeScale(value: string | null | undefined): GanttTimeScale {
  if (value === 'day' || value === 'month') {
    return value
  }

  return 'week'
}

export function normalizeProjectViewDateRange(value?: Partial<OverviewDateRange> | null): OverviewDateRange {
  const preset = projectViewDateRangePresets.has(value?.preset as OverviewDateRangePreset)
    ? value!.preset!
    : defaultOverviewDateRange.preset

  if (preset === 'all_time') {
    return defaultOverviewDateRange
  }

  const normalizedStartDate = normalizeProjectDateString(value?.startDate)
  const normalizedEndDate = normalizeProjectDateString(value?.endDate)

  if (!normalizedStartDate || !normalizedEndDate) {
    return defaultOverviewDateRange
  }

  return {
    endDate: normalizedEndDate < normalizedStartDate ? normalizedStartDate : normalizedEndDate,
    preset,
    startDate: normalizedEndDate < normalizedStartDate ? normalizedEndDate : normalizedStartDate,
  }
}

export function normalizeProjectTableFilters(value?: Partial<ProjectTableFilters> | null): ProjectTableFilters {
  const normalizedStatus = [...new Set((value?.status ?? []).filter(Boolean))]
  const normalizedPriority = [...new Set((value?.priority ?? []).filter(Boolean))]

  return {
    priority: normalizedPriority,
    status: normalizedStatus,
  }
}

export function normalizeProjectTableSort(value?: ProjectTableSort | ProjectTableSortEntry | null): ProjectTableSort {
  if (!value) {
    return []
  }

  // Handle legacy single-sort format
  if (!Array.isArray(value)) {
    const normalizedFieldKey = value.fieldKey.trim().toLowerCase()
    const normalizedDirection = value.direction === 'desc' ? 'desc' : 'asc'
    return normalizedFieldKey ? [{direction: normalizedDirection, fieldKey: normalizedFieldKey}] : []
  }

  return value
    .map((entry) => ({
      direction: (entry.direction === 'desc' ? 'desc' : 'asc') as TableSortDirection,
      fieldKey: entry.fieldKey.trim().toLowerCase(),
    }))
    .filter((entry) => entry.fieldKey.length > 0)
}

export function resolveProjectTableViewDraft(
  state: ProjectTableViewState | null,
  fallbackGroupBy: TableGroupBy,
): ProjectTableViewDraft {
  return {
    collapsedGroups: normalizeProjectTableCollapsedGroups(state?.personalConfig?.collapsedGroups ?? []),
    columnWidths: normalizeProjectTableColumnWidths(state?.personalConfig?.columnWidths ?? {}),
    filters: normalizeProjectTableFilters(state?.sharedConfig.filters),
    groupBy: normalizeProjectViewGroupBy(state?.sharedConfig.groupBy ?? fallbackGroupBy),
    personFilterUserId: state?.sharedConfig.personFilterUserId ?? null,
    sort: normalizeProjectTableSort(state?.sharedConfig.sort),
    visibleFieldKeys: normalizeProjectTableVisibleFieldKeys(state?.sharedConfig.visibleFieldKeys ?? []),
  }
}

export function resolveProjectOverviewConfig(
  state?: Partial<ProjectOverviewConfig> | null,
): ProjectOverviewConfig {
  return {
    overviewAssigneeIds: normalizeProjectConfigIdList(state?.overviewAssigneeIds),
    overviewDateRange: normalizeProjectViewDateRange(state?.overviewDateRange),
    overviewGroupId:
      typeof state?.overviewGroupId === 'string' && state.overviewGroupId.trim().length > 0
        ? state.overviewGroupId.trim()
        : null,
    overviewPriorityKeys: normalizeProjectConfigIdList(state?.overviewPriorityKeys),
    overviewSprintId:
      typeof state?.overviewSprintId === 'string' && state.overviewSprintId.trim().length > 0
        ? state.overviewSprintId.trim()
        : null,
    overviewWidgets: normalizeOverviewWidgets(state?.overviewWidgets),
  }
}
