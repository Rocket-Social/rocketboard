import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {getBrowserTimeZone} from '../../lib/timezone'
import type {
  BootstrapWorkspaceInput,
  CreateProjectInput,
  CreateWorkspaceInput,
  InviteAcceptResult,
  InviteAcceptSnapshot,
  ProjectRouteTarget,
} from './setup.types'

export type SetupRepository = {
  acceptInvite(inviteToken: string): Promise<InviteAcceptResult>
  bootstrapWorkspace(input: BootstrapWorkspaceInput): Promise<ProjectRouteTarget>
  createProject(input: CreateProjectInput): Promise<ProjectRouteTarget>
  createWorkspace(input: CreateWorkspaceInput): Promise<ProjectRouteTarget>
  getInviteSnapshot(inviteToken: string): Promise<InviteAcceptSnapshot | null>
}

export const setupRepository: SetupRepository = {
  async acceptInvite(inviteToken) {
    return (await rpcAdapter.callSingle<InviteAcceptResult>('accept_invite', {
      target_accept_token: inviteToken,
    }))!
  },
  async bootstrapWorkspace(input) {
    const row = await rpcAdapter.callSingle<{route: ProjectRouteTarget}>('bootstrap_workspace', {
      target_project_name: input.projectName,
      target_timezone: getBrowserTimeZone(),
      target_workspace_name: input.workspaceName,
    })
    return row!.route
  },
  async createProject(input) {
    const row = await rpcAdapter.callSingle<{route: ProjectRouteTarget}>('create_project', {
      target_access: input.access ?? 'open',
      target_default_starter_view_type: input.defaultStarterViewType ?? null,
      target_name: input.projectName,
      target_starter_view_types: input.starterViewTypes ?? null,
      target_workspace_id: input.workspaceId,
    })
    return row!.route
  },
  async createWorkspace(input) {
    const row = await rpcAdapter.callSingle<{route: ProjectRouteTarget}>('create_workspace', {
      target_project_name: input.projectName,
      target_timezone: getBrowserTimeZone(),
      target_workspace_name: input.workspaceName,
    })
    return row!.route
  },
  async getInviteSnapshot(inviteToken) {
    return rpcAdapter.callSingle<InviteAcceptSnapshot | null>('get_invite_snapshot', {
      target_accept_token: inviteToken,
    })
  },
}
