import type {ProjectRouteTarget as ShellProjectRouteTarget} from '../projects/project-shell.types'
import type {ProjectViewType} from '../projects/project-view.model'

export type ProjectRouteTarget = ShellProjectRouteTarget

export type BootstrapWorkspaceInput = {
  projectName: string
  workspaceName: string
}

export type CreateWorkspaceInput = {
  projectName: string
  workspaceName: string
}

export type CreateProjectInput = {
  access?: 'open' | 'private'
  defaultStarterViewType?: ProjectViewType
  projectName: string
  starterViewTypes?: ProjectViewType[]
  workspaceId: string
}

export type InviteAcceptSnapshot = {
  email: string
  inviterName: string
  organization?: {
    icon: string
    name: string
  } | null
  project?: {
    icon: string
    name: string
  } | null
  resourceType: 'organization' | 'project' | 'workspace'
  role: string
  route?: ProjectRouteTarget | null
  status: 'accepted' | 'expired' | 'pending' | 'revoked'
  workspace?: {
    icon: string
    name: string
  } | null
}

export type InviteAcceptResult = {
  organizationName?: string
  resourceType: 'organization' | 'project' | 'workspace'
  route?: ProjectRouteTarget | null
  workspaceCount?: number
}
