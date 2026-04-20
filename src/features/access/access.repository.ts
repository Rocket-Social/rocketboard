import {sendInviteEmail} from './invite-email'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {
  AddProjectAccessInput,
  AddWorkspaceAccessInput,
  CreateProjectInviteInput,
  CreateWorkspaceInviteInput,
  ProjectAccessRouteContext,
  ProjectAccessSnapshot,
  RemoveProjectAccessInput,
  RemoveWorkspaceAccessInput,
  ScopeAccessRole,
  SetProjectAccessRoleInput,
  SetProjectVisibilityInput,
  SetWorkspaceAccessRoleInput,
  SetWorkspaceVisibilityInput,
  WorkspaceAccessRouteContext,
  WorkspaceAccessSnapshot,
  WorkspaceAccessProjectSummary,
  WorkspaceMemberSearchResult,
} from './access.types'

export type AccessRepository = {
  addProjectAccess(input: AddProjectAccessInput): Promise<void>
  addWorkspaceAccess(input: AddWorkspaceAccessInput): Promise<void>
  createProjectInvite(input: CreateProjectInviteInput): Promise<void>
  createWorkspaceInvite(input: CreateWorkspaceInviteInput): Promise<void>
  getProjectAccessRouteContext(orgSlug: string, workspaceSlug: string, projectSlug: string): Promise<ProjectAccessRouteContext | null>
  getProjectAccessSnapshot(projectId: string): Promise<ProjectAccessSnapshot>
  getWorkspaceAccessRouteContext(orgSlug: string, workspaceSlug: string): Promise<WorkspaceAccessRouteContext | null>
  getWorkspaceAccessSnapshot(workspaceId: string): Promise<WorkspaceAccessSnapshot>
  listWorkspaceAccessProjects(workspaceId: string): Promise<WorkspaceAccessProjectSummary[]>
  removeProjectAccess(input: RemoveProjectAccessInput): Promise<void>
  removeWorkspaceAccess(input: RemoveWorkspaceAccessInput): Promise<void>
  searchWorkspaceMembers(workspaceId: string, query: string, excludeProjectId?: string): Promise<WorkspaceMemberSearchResult[]>
  setProjectAccessRole(input: SetProjectAccessRoleInput): Promise<void>
  setProjectVisibility(input: SetProjectVisibilityInput): Promise<void>
  setWorkspaceAccessRole(input: SetWorkspaceAccessRoleInput): Promise<void>
  setWorkspaceVisibility(input: SetWorkspaceVisibilityInput): Promise<void>
}

const emptyProjectAccessSnapshot: ProjectAccessSnapshot = {
  canEditProject: false,
  canManageProject: false,
  collaborators: [],
  currentOrgRole: 'guest',
  directAccess: [],
  pendingInvites: [],
  projectAccess: 'private',
  workspaceAccess: 'private',
}

const emptyWorkspaceAccessSnapshot: WorkspaceAccessSnapshot = {
  canEditWorkspace: false,
  canManageWorkspace: false,
  collaborators: [],
  currentOrgRole: 'guest',
  directAccess: [],
  pendingInvites: [],
  workspaceAccess: 'private',
}

type ScopedInviteResult = {
  acceptToken: string
  createdAt: string
  email: string
  id: string
  role: ScopeAccessRole
}

export const accessRepository: AccessRepository = {
  async addProjectAccess(input) {
    await rpcAdapter.call('add_project_member', {
      target_project_id: input.projectId,
      target_role: input.role,
      target_user_id: input.userId,
    })
  },
  async addWorkspaceAccess(input) {
    await rpcAdapter.call('add_workspace_member', {
      target_role: input.role,
      target_user_id: input.userId,
      target_workspace_id: input.workspaceId,
    })
  },
  async createProjectInvite(input) {
    const invite = await rpcAdapter.callSingle<ScopedInviteResult>('create_project_invite', {
      target_email: input.email,
      target_project_id: input.projectId,
      target_role: input.role,
    })

    if (!invite) {
      throw new Error('Rocketboard could not create the project invite.')
    }

    await sendInviteEmail({
      acceptToken: invite.acceptToken,
      email: invite.email,
      inviterName: input.inviterName,
      resourceId: input.projectId,
      resourceName: input.projectName,
      role: invite.role,
      type: 'project',
    })
  },
  async createWorkspaceInvite(input) {
    const invite = await rpcAdapter.callSingle<ScopedInviteResult>('create_workspace_invite', {
      target_email: input.email,
      target_workspace_id: input.workspaceId,
      target_role: input.role,
    })

    if (!invite) {
      throw new Error('Rocketboard could not create the workspace invite.')
    }

    await sendInviteEmail({
      acceptToken: invite.acceptToken,
      email: invite.email,
      inviterName: input.inviterName,
      resourceId: input.workspaceId,
      resourceName: input.workspaceName,
      role: invite.role,
      type: 'workspace',
    })
  },
  async getProjectAccessSnapshot(projectId) {
    return await rpcAdapter.callSingle<ProjectAccessSnapshot>('get_project_access_snapshot', {
      target_project_id: projectId,
    }) ?? emptyProjectAccessSnapshot
  },
  async getProjectAccessRouteContext(orgSlug, workspaceSlug, projectSlug) {
    return await rpcAdapter.callSingle<ProjectAccessRouteContext>('get_project_access_route_context', {
      target_org_slug: orgSlug,
      target_project_slug: projectSlug,
      target_workspace_slug: workspaceSlug,
    })
  },
  async getWorkspaceAccessRouteContext(orgSlug, workspaceSlug) {
    return await rpcAdapter.callSingle<WorkspaceAccessRouteContext>('get_workspace_access_route_context', {
      target_org_slug: orgSlug,
      target_workspace_slug: workspaceSlug,
    })
  },
  async getWorkspaceAccessSnapshot(workspaceId) {
    return await rpcAdapter.callSingle<WorkspaceAccessSnapshot>('get_workspace_access_snapshot', {
      target_workspace_id: workspaceId,
    }) ?? emptyWorkspaceAccessSnapshot
  },
  async listWorkspaceAccessProjects(workspaceId) {
    return await rpcAdapter.callAndTransform<WorkspaceAccessProjectSummary[]>('list_workspace_access_projects', {
      target_workspace_id: workspaceId,
    }) ?? []
  },
  async removeProjectAccess(input) {
    await rpcAdapter.call('remove_project_member', {
      target_project_id: input.projectId,
      target_user_id: input.userId,
    })
  },
  async removeWorkspaceAccess(input) {
    await rpcAdapter.call('remove_workspace_member', {
      target_workspace_id: input.workspaceId,
      target_user_id: input.userId,
    })
  },
  async searchWorkspaceMembers(workspaceId, query, excludeProjectId) {
    const results = await rpcAdapter.callAndTransform<WorkspaceMemberSearchResult[]>('search_workspace_members', {
      target_exclude_project_id: excludeProjectId ?? null,
      target_query: query,
      target_workspace_id: workspaceId,
    })

    return results ?? []
  },
  async setProjectAccessRole(input) {
    await rpcAdapter.call('set_project_member_role', {
      target_project_id: input.projectId,
      target_role: input.role,
      target_user_id: input.userId,
    })
  },
  async setProjectVisibility(input) {
    await rpcAdapter.call('set_project_access', {
      target_access: input.access,
      target_project_id: input.projectId,
    })
  },
  async setWorkspaceAccessRole(input) {
    await rpcAdapter.call('set_workspace_member_role', {
      target_role: input.role,
      target_user_id: input.userId,
      target_workspace_id: input.workspaceId,
    })
  },
  async setWorkspaceVisibility(input) {
    await rpcAdapter.call('set_workspace_access', {
      target_access: input.access,
      target_workspace_id: input.workspaceId,
    })
  },
}
