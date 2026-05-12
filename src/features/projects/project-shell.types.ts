import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {ProjectBuiltinFieldLabels} from './builtin-fields'
import type {ProjectBuiltinOptionLabels} from './builtin-option-config'
import type {ProjectViewNavItem} from './project-view.model'

export type WorkspaceProjectSummary = {
  access: 'open' | 'private'
  builtinOptionLabels: ProjectBuiltinOptionLabels
  builtinFieldLabels: ProjectBuiltinFieldLabels
  defaultProjectViewId: string
  id: string
  icon: string
  lastUpdatedLabel: string
  memberCount: number
  name: string
  projectViews: ProjectViewNavItem[]
  slug: string
  priorityOptions: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
  taskCount: number
}

export type WorkspaceSummary = {
  canManageWorkspace: boolean
  colorToken: string
  defaultProjectSlug: string
  id: string
  icon: string
  name: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  projects: WorkspaceProjectSummary[]
  slug: string
  timezone: string | null
}

export type ProjectRouteTarget = {
  orgSlug: string
  projectSlug: string
  viewId: string
  workspaceSlug: string
}

export type ProjectShellRouteParams = ProjectRouteTarget & {
  viewType: import('./project-view.model').ProjectViewType
}
