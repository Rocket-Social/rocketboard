import type {TableGroupBy} from '../cards/card.types'
import type {ProjectTableViewState} from './project-view.types'
import {
  normalizeProjectTableCollapsedGroups,
  normalizeProjectTableColumnWidths,
  normalizeProjectTableFilters,
  normalizeProjectTableSort,
  normalizeProjectTableVisibleFieldKeys,
  normalizeProjectViewGroupBy,
  type ProjectTableFilters,
  type ProjectTableSort,
} from './project-view.types'

export type TableViewStateRow = {
  base_shared_version: number | null
  personal_column_widths: Record<string, number> | null
  personal_collapsed_groups: string[] | null
  project_view_id: string | null
  shared_filters: ProjectTableFilters | null
  shared_group_by: string | null
  shared_person_filter_user_id: string | null
  shared_sort: ProjectTableSort | null
  shared_visible_field_keys: string[] | null
  shared_version: number | null
}

export function normalizeTableGroupBy(value: string | null): TableGroupBy {
  return normalizeProjectViewGroupBy(value)
}

export function mapTableViewState(
  row: TableViewStateRow | null,
  fallbackGroupBy: TableGroupBy,
): ProjectTableViewState {
  const collapsedGroups = normalizeProjectTableCollapsedGroups(row?.personal_collapsed_groups ?? [])
  const columnWidths = normalizeProjectTableColumnWidths(row?.personal_column_widths ?? {})

  return {
    personalConfig:
      collapsedGroups.length > 0 || Object.keys(columnWidths).length > 0
        ? {
            collapsedGroups,
            columnWidths,
          }
        : null,
    sharedConfig: {
      filters: normalizeProjectTableFilters(row?.shared_filters ?? undefined),
      groupBy: normalizeProjectViewGroupBy(row?.shared_group_by ?? fallbackGroupBy),
      personFilterUserId: row?.shared_person_filter_user_id ?? null,
      sort: normalizeProjectTableSort(row?.shared_sort ?? undefined),
      visibleFieldKeys: normalizeProjectTableVisibleFieldKeys(row?.shared_visible_field_keys ?? []),
    },
    sharedVersion: Math.max(1, Number(row?.shared_version ?? 1)),
  }
}
