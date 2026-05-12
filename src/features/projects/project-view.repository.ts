import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {TableGroupBy} from '../cards/card.types'
import {mapTableViewState, type TableViewStateRow} from './project-view.mappers'
import {
  getProjectViewDefaultName,
  normalizeProjectViewName,
  type ProjectViewNavItem,
  type ProjectViewType,
} from './project-view.model'
import {
  resolveProjectOverviewConfig,
  type ProjectOverviewConfig,
  type ProjectTableFilters,
  type ProjectTableSort,
  type ProjectTableViewState,
} from './project-view.types'

export type ProjectViewRepository = {
  createView(projectId: string, viewType: ProjectViewType): Promise<ProjectViewNavItem>
  renameView(projectViewId: string, name: string): Promise<void>
  reorderViews(projectId: string, orderedVisibleViewIds: string[]): Promise<void>
  setHidden(projectViewId: string, hidden: boolean): Promise<void>
  setDefaultView(projectViewId: string): Promise<void>
  setPersonalLayout(
    projectViewId: string,
    collapsedGroups: string[],
    columnWidths: Record<string, number>,
  ): Promise<ProjectTableViewState>
  setSharedConfig(
    projectViewId: string,
    input: {
      filters: ProjectTableFilters
      groupBy: TableGroupBy
      personFilterUserId: string | null
      sort: ProjectTableSort
      visibleFieldKeys: string[]
    },
  ): Promise<ProjectTableViewState>
  getGanttSharedConfig(projectViewId: string): Promise<Record<string, unknown>>
  setGanttSharedConfig(projectViewId: string, config: Record<string, unknown>): Promise<Record<string, unknown>>
  getOverviewSharedConfig(projectViewId: string): Promise<ProjectOverviewConfig>
  setOverviewSharedConfig(projectViewId: string, config: ProjectOverviewConfig): Promise<ProjectOverviewConfig>
}

function mapProjectViewNavItem(value: unknown): ProjectViewNavItem {
  if (!value || typeof value !== 'object') {
    throw new Error('Project view payload is missing from the server response.')
  }

  const view = value as Record<string, unknown>
  const id = typeof view.id === 'string' ? view.id : null
  // Keep reading the legacy "board" label in case an older backend response still returns it.
  const rawViewType = view.viewType === 'board' ? 'kanban' : view.viewType
  const viewType =
    rawViewType === 'overview'
    || rawViewType === 'kanban'
    || rawViewType === 'table'
    || rawViewType === 'gantt'
    || rawViewType === 'document'
    || rawViewType === 'github'
    || rawViewType === 'canvas'
      ? rawViewType
      : null

  if (!id || !viewType) {
    throw new Error('Project view payload is incomplete in the server response.')
  }

  return {
    id,
    isDefault: view.isDefault === true,
    isHidden: view.isHidden === true,
    name: normalizeProjectViewName(
      typeof view.name === 'string' ? view.name : null,
      getProjectViewDefaultName(viewType),
      viewType,
    ),
    position: Number.isFinite(view.position) ? Number(view.position) : 0,
    viewType,
  }
}

export const projectViewRepository: ProjectViewRepository = {
  async createView(projectId, viewType) {
    return mapProjectViewNavItem(await rpcAdapter.callSingle('create_project_view', {
      target_project_id: projectId,
      target_view_type: viewType,
    }))
  },
  async renameView(projectViewId, name) {
    await rpcAdapter.call('rename_project_view', {
      target_name: name,
      target_project_view_id: projectViewId,
    })
  },
  async reorderViews(projectId, orderedVisibleViewIds) {
    await rpcAdapter.call('reorder_project_views', {
      target_project_id: projectId,
      target_view_ids: orderedVisibleViewIds,
    })
  },
  async setHidden(projectViewId, hidden) {
    await rpcAdapter.call('set_project_view_hidden', {
      target_hidden: hidden,
      target_project_view_id: projectViewId,
    })
  },
  async setDefaultView(projectViewId) {
    await rpcAdapter.call('set_project_view_default', {
      target_project_view_id: projectViewId,
    })
  },
  async setPersonalLayout(projectViewId, collapsedGroups, columnWidths) {
    const rows = await rpcAdapter.call<TableViewStateRow[]>('set_project_table_personal_layout_by_view_id', {
      target_collapsed_groups: collapsedGroups,
      target_column_widths: columnWidths,
      target_project_view_id: projectViewId,
    })

    return mapTableViewState(rows?.[0] ?? null, 'status')
  },
  async setSharedConfig(projectViewId, input) {
    const rows = await rpcAdapter.call<TableViewStateRow[]>('set_project_table_shared_config_by_view_id', {
      target_filters: input.filters,
      target_group_by: input.groupBy,
      target_person_filter_user_id: input.personFilterUserId ?? null,
      target_project_view_id: projectViewId,
      target_sort: input.sort,
      target_visible_field_keys: input.visibleFieldKeys,
    })

    return mapTableViewState(rows?.[0] ?? null, input.groupBy)
  },
  async getGanttSharedConfig(projectViewId) {
    const row = await rpcAdapter.callSingle<{sharedConfig: Record<string, unknown>} | null>('get_gantt_shared_config_by_view_id', {
      target_project_view_id: projectViewId,
    })
    return (row?.sharedConfig ?? {}) as Record<string, unknown>
  },
  async setGanttSharedConfig(projectViewId, config) {
    const row = await rpcAdapter.callSingle<{sharedConfig: Record<string, unknown>} | null>('set_gantt_shared_config_by_view_id', {
      target_config: config,
      target_project_view_id: projectViewId,
    })
    return (row?.sharedConfig ?? {}) as Record<string, unknown>
  },
  async getOverviewSharedConfig(projectViewId) {
    const row = await rpcAdapter.callSingle<{sharedConfig: Record<string, unknown>} | null>('get_overview_shared_config_by_view_id', {
      target_project_view_id: projectViewId,
    })
    return resolveProjectOverviewConfig((row?.sharedConfig ?? {}) as Partial<ProjectOverviewConfig>)
  },
  async setOverviewSharedConfig(projectViewId, config) {
    const row = await rpcAdapter.callSingle<{sharedConfig: Record<string, unknown>} | null>('set_overview_shared_config_by_view_id', {
      target_config: config,
      target_project_view_id: projectViewId,
    })
    return resolveProjectOverviewConfig((row?.sharedConfig ?? {}) as Partial<ProjectOverviewConfig>)
  },
}
