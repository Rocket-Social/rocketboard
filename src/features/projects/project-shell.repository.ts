import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {mapCardRow, type CardRecord, type CardRow, type ProjectPriorityOption, type ProjectStatusOption} from '../cards/card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {parseProjectBuiltinOptionConfig} from './builtin-option-config'
import type {ProjectGroupRecord} from './project-group.types'
import {mapTableViewState, normalizeTableGroupBy, type TableViewStateRow} from './project-view.mappers'
import {
  getProjectViewDefaultName,
  getProjectViewDisplayName,
  isProjectViewType,
  sortProjectViews,
  type ProjectViewNavItem,
} from './project-view.model'
import type {ProjectTableViewState} from './project-view.types'
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from './project-shell.types'

export type ProjectViewBackendStatus = {
  message: string | null
  status: 'ready' | 'unavailable'
}

export type ProjectTableViewStatesResult = {
  projectViewBackend: ProjectViewBackendStatus
  tableViewStates: Record<string, ProjectTableViewState>
}

export type ProjectShellRepository = {
  listWorkspaces(): Promise<WorkspaceSummary[]>
  getProjectCards(projectId: string): Promise<CardRecord[]>
  getProjectCustomFields(projectId: string): Promise<CustomFieldDefinition[]>
  getProjectStatusOptions(projectId: string): Promise<ProjectStatusOption[]>
  getProjectPriorityOptions(projectId: string): Promise<ProjectPriorityOption[]>
  getProjectGroups(projectId: string): Promise<ProjectGroupRecord[]>
  getProjectSprints(projectId: string): Promise<ProjectSprintRecord[]>
  getProjectTableViewStates(projectId: string): Promise<ProjectTableViewStatesResult>
}

type ShellSummaryRow = {
  default_project_view_id: string | null
  member_count: number | null
  project_access: 'open' | 'private' | null
  project_builtin_field_labels: Record<string, unknown> | null
  project_created_at: string
  project_icon: string | null
  project_id: string
  project_name: string
  project_position: number
  project_views: Array<{
    id?: unknown
    isDefault?: unknown
    isHidden?: unknown
    name?: unknown
    position?: unknown
    viewType?: unknown
  }> | null
  project_slug: string
  project_updated_at: string
  task_count: number | null
  workspace_can_manage: boolean | null
  workspace_color_token: string | null
  workspace_icon: string | null
  workspace_id: string
  workspace_name: string
  workspace_organization_id: string
  workspace_organization_name: string
  workspace_organization_slug: string
  workspace_slug: string
  workspace_timezone: string | null
}

type ProjectGroupRow = {
  created_at: string
  group_id: string
  label: string
  position: number
  project_id: string
  updated_at: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const objectError = error as Record<string, unknown>

    if (typeof objectError.message === 'string' && objectError.message.trim().length > 0) {
      return objectError.message
    }

    if (typeof objectError.details === 'string' && objectError.details.trim().length > 0) {
      return objectError.details
    }

    if (typeof objectError.hint === 'string' && objectError.hint.trim().length > 0) {
      return objectError.hint
    }
  }

  return 'The project view backend is temporarily unavailable.'
}

function isMissingRpcFunction(error: unknown, functionName: string) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const objectError = error as Record<string, unknown>
  const code = typeof objectError.code === 'string' ? objectError.code : null
  const message = typeof objectError.message === 'string' ? objectError.message : null
  const hint = typeof objectError.hint === 'string' ? objectError.hint : null
  const details = typeof objectError.details === 'string' ? objectError.details : null

  if (code !== 'PGRST202') {
    return false
  }

  return [message, hint, details].some((value) => value?.includes(functionName))
}

function isMissingProjectTableViewStatesFunction(error: unknown) {
  return isMissingRpcFunction(error, 'get_project_table_view_states')
}

function formatRelativeTimestamp(value: string) {
  const target = new Date(value)
  const elapsedMs = Date.now() - target.getTime()

  if (Number.isNaN(target.getTime()) || elapsedMs < 0) {
    return 'just now'
  }

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (elapsedMs < hour) {
    return `${Math.max(1, Math.floor(elapsedMs / minute))}m ago`
  }

  if (elapsedMs < day) {
    return `${Math.floor(elapsedMs / hour)}h ago`
  }

  if (elapsedMs < day * 7) {
    return `${Math.floor(elapsedMs / day)}d ago`
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(target)
}


function buildFallbackProjectViews(projectId: string): ProjectViewNavItem[] {
  return [
    {
      id: `${projectId}-overview`,
      isDefault: false,
      isHidden: false,
      name: getProjectViewDefaultName('overview'),
      position: 0,
      viewType: 'overview',
    },
    {
      id: `${projectId}-table`,
      isDefault: true,
      isHidden: false,
      name: getProjectViewDefaultName('table'),
      position: 1,
      viewType: 'table',
    },
    {
      id: `${projectId}-kanban`,
      isDefault: false,
      isHidden: false,
      name: getProjectViewDefaultName('kanban'),
      position: 2,
      viewType: 'kanban',
    },
  ]
}

function mapProjectViewNavItems(
  projectId: string,
  rows: ShellSummaryRow['project_views'],
): ProjectViewNavItem[] {
  const mappedViews = (rows ?? [])
    .map<ProjectViewNavItem | null>((view, index) => {
      // Keep reading the legacy "board" label in case an older backend response still returns it.
      const rawViewType = view.viewType === 'board' ? 'kanban' : String(view.viewType ?? '')
      if (typeof view.id !== 'string' || !isProjectViewType(rawViewType)) {
        return null
      }

      const viewType = rawViewType as ProjectViewNavItem['viewType']

      return {
        id: view.id,
        isDefault: view.isDefault === true,
        isHidden: view.isHidden === true,
        name: getProjectViewDisplayName(viewType, typeof view.name === 'string' ? view.name : null),
        position: Number.isFinite(view.position) ? Number(view.position) : index,
        viewType,
      }
    })
    .filter((view): view is ProjectViewNavItem => view !== null)

  if (mappedViews.length > 0) {
    return sortProjectViews(mappedViews)
  }

  return buildFallbackProjectViews(projectId)
}

function resolveDefaultProjectViewId(defaultProjectViewId: string | null, projectViews: ProjectViewNavItem[]) {
  if (defaultProjectViewId && projectViews.some((view) => view.id === defaultProjectViewId)) {
    return defaultProjectViewId
  }

  return projectViews.find((view) => view.isDefault)?.id ?? projectViews[0]?.id ?? ''
}

function buildWorkspaceSummaries(rows: ShellSummaryRow[]): WorkspaceSummary[] {
  const workspaces = new Map<string, WorkspaceSummary>()

  for (const row of rows) {
    const builtinConfig = parseProjectBuiltinOptionConfig(row.project_builtin_field_labels)
    const projectViews = mapProjectViewNavItems(row.project_id, row.project_views)
    const project: WorkspaceProjectSummary = {
      access: row.project_access === 'private' ? 'private' : 'open',
      builtinFieldLabels: builtinConfig.builtinFieldLabels,
      builtinOptionLabels: builtinConfig.builtinOptionLabels,
      defaultProjectViewId: resolveDefaultProjectViewId(row.default_project_view_id, projectViews),
      icon: row.project_icon ?? '📁',
      id: row.project_id,
      lastUpdatedLabel: formatRelativeTimestamp(row.project_updated_at),
      memberCount: Number(row.member_count ?? 0),
      name: row.project_name,
      projectViews,
      slug: row.project_slug,
      priorityOptions: [],
      statusOptions: [],
      taskCount: Number(row.task_count ?? 0),
    }

    const existingWorkspace = workspaces.get(row.workspace_slug)

    if (existingWorkspace) {
      existingWorkspace.projects.push(project)
      continue
    }

    workspaces.set(row.workspace_slug, {
      canManageWorkspace: row.workspace_can_manage === true,
      colorToken: row.workspace_color_token ?? 'slate',
      defaultProjectSlug: row.project_slug,
      id: row.workspace_id,
      icon: row.workspace_icon ?? (row.workspace_name.slice(0, 1).toUpperCase() || 'W'),
      name: row.workspace_name,
      organizationId: row.workspace_organization_id,
      organizationName: row.workspace_organization_name ?? '',
      organizationSlug: row.workspace_organization_slug,
      projects: [project],
      slug: row.workspace_slug,
      timezone: row.workspace_timezone ?? null,
    })
  }

  return Array.from(workspaces.values())
}

async function loadShellSummaryRows(): Promise<ShellSummaryRow[]> {
  return (await rpcAdapter.call<ShellSummaryRow[]>('get_shell_summary_rows_v2')) ?? []
}

async function loadCardRows(projectId: string): Promise<CardRow[]> {
  return (await rpcAdapter.call<CardRow[]>('get_project_card_rows', {
    target_project_id: projectId,
  })) ?? []
}

async function loadProjectTableViewStates(projectId: string): Promise<TableViewStateRow[]> {
  return (await rpcAdapter.call<TableViewStateRow[]>('get_project_table_view_states', {
    target_project_id: projectId,
  })) ?? []
}

async function loadProjectCustomFields(projectId: string): Promise<CustomFieldDefinition[]> {
  return (await rpcAdapter.callAndTransform<CustomFieldDefinition[]>('get_project_custom_fields', {
    target_project_id: projectId,
  })) ?? []
}

type StatusOptionRow = {
  category: ProjectStatusOption['category']
  color: string | null
  id: string
  is_default: boolean
  key: string
  label: string
  position: number
}

async function loadProjectStatusOptions(projectId: string): Promise<ProjectStatusOption[]> {
  const data = await rpcAdapter.call<StatusOptionRow[]>('get_project_status_options', {
    target_project_id: projectId,
  })

  return (data ?? []).map((row) => ({
    category: row.category,
    color: row.color ?? null,
    id: row.id,
    isDefault: row.is_default,
    key: row.key,
    label: row.label,
    position: row.position,
  }))
}

type PriorityOptionRow = {
  color: string | null
  id: string
  is_default: boolean
  key: string
  label: string
  sort_order: number
}

async function loadProjectPriorityOptions(projectId: string): Promise<ProjectPriorityOption[]> {
  const data = await rpcAdapter.call<PriorityOptionRow[]>('get_project_priority_options', {
    target_project_id: projectId,
  })

  return (data ?? []).map((row) => ({
    color: row.color ?? null,
    id: row.id,
    isDefault: row.is_default,
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
  }))
}

async function loadProjectGroups(projectId: string): Promise<ProjectGroupRecord[]> {
  const data = await rpcAdapter.call<ProjectGroupRow[]>('get_project_groups', {
    target_project_id: projectId,
  })

  return (data ?? []).map((group) => ({
    createdAt: group.created_at,
    id: group.group_id,
    label: group.label,
    position: group.position,
    projectId: group.project_id,
    updatedAt: group.updated_at,
  }))
}

type ProjectSprintRow = {
  completed_at: string | null
  created_at: string
  end_date: string | null
  goal: string | null
  id: string
  name: string
  position: number
  project_id: string
  start_date: string | null
  status: ProjectSprintRecord['status']
  updated_at: string
}

async function loadProjectSprints(projectId: string): Promise<ProjectSprintRecord[]> {
  const data = await rpcAdapter.call<ProjectSprintRow[]>('get_project_sprints', {
    target_project_id: projectId,
  })

  return (data ?? []).map((row) => ({
    completedAt: row.completed_at,
    createdAt: row.created_at,
    endDate: row.end_date,
    goal: row.goal,
    id: row.id,
    name: row.name,
    position: row.position,
    projectId: row.project_id,
    startDate: row.start_date,
    status: row.status,
    updatedAt: row.updated_at,
  }))
}

async function listSupabaseWorkspaces() {
  const rows = await loadShellSummaryRows()
  return buildWorkspaceSummaries(rows)
}

export const projectShellRepository: ProjectShellRepository = {
  async listWorkspaces() {
    return listSupabaseWorkspaces()
  },
  // Decomposed loaders for independent query keys (Phase 2)
  async getProjectCards(projectId) {
    const rows = await loadCardRows(projectId)
    return rows.map((row) => mapCardRow(row, projectId))
  },
  async getProjectCustomFields(projectId) {
    return loadProjectCustomFields(projectId)
  },
  async getProjectStatusOptions(projectId) {
    return loadProjectStatusOptions(projectId)
  },
  async getProjectPriorityOptions(projectId) {
    return loadProjectPriorityOptions(projectId)
  },
  async getProjectGroups(projectId) {
    return loadProjectGroups(projectId)
  },
  async getProjectSprints(projectId) {
    return loadProjectSprints(projectId)
  },
  async getProjectTableViewStates(projectId) {
    let tableViewRows: TableViewStateRow[] = []
    let projectViewBackend: ProjectViewBackendStatus = {
      message: null,
      status: 'ready',
    }

    try {
      tableViewRows = await loadProjectTableViewStates(projectId)
    } catch (error) {
      const message = isMissingProjectTableViewStatesFunction(error)
        ? 'Rocketboard loaded this project in read-only mode for board configuration until the backend migration is applied.'
        : getErrorMessage(error)

      projectViewBackend = {
        message: `Project board settings are temporarily unavailable. ${message}`,
        status: 'unavailable',
      }

      if (!isMissingProjectTableViewStatesFunction(error)) {
        console.error('Rocketboard could not load project table view states.', error)
      }
    }

    const tableViewStates = Object.fromEntries(
      tableViewRows
        .filter((row): row is TableViewStateRow & {project_view_id: string} => typeof row.project_view_id === 'string')
        .map((row) => [
          row.project_view_id,
          mapTableViewState(row, normalizeTableGroupBy(row.shared_group_by)),
        ]),
    )

    return {projectViewBackend, tableViewStates}
  },
}
