import {IS_SELF_HOSTED} from '../../app/config'
import {callEdgeFunction, EdgeFunctionError} from '../../platform/edge/edge-client'
import {sendInviteEmail} from '../access/invite-email'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {
  ApproveOrgInviteRequestInput,
  CreateOrgInviteRequestInput,
  DeclineOrgInviteRequestInput,
  OrgInviteRequest,
  OrgMembersSnapshot,
} from './org-settings.types'

type OrganizationInviteResult = {
  acceptToken: string
  createdAt: string
  email: string
  id: string
  role: string
}

type SendOrganizationInviteEmailInput = {
  acceptToken: string
  email: string
  inviterName: string
  message?: string
  organizationName: string
  organizationId: string
  role: string
}

async function sendOrganizationInviteEmail(input: SendOrganizationInviteEmailInput) {
  await sendInviteEmail({
    acceptToken: input.acceptToken,
    email: input.email,
    inviterName: input.inviterName,
    message: input.message,
    resourceId: input.organizationId,
    resourceName: input.organizationName,
    role: input.role,
    type: 'organization',
  })
}

async function sendInviteRequestNotification(input: {organizationId: string; requestId: string}) {
  if (IS_SELF_HOSTED) return

  try {
    await callEdgeFunction<{success?: boolean}>('send-invite-request-notification', {
      body: {
        organizationId: input.organizationId,
        requestId: input.requestId,
      },
      errorFallback: 'Rocketboard could not notify the org admins about your request.',
    })
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      throw new Error(error.message)
    }
    throw error
  }
}

export const orgSettingsRepository = {
  async getOrganizationMembers(orgId: string): Promise<OrgMembersSnapshot | null> {
    return rpcAdapter.callSingle<OrgMembersSnapshot | null>('get_organization_members', {
      target_org_id: orgId,
    })
  },

  async createOrganizationInvite(input: {
    email: string
    inviterName: string
    message?: string
    orgId: string
    organizationName: string
    role: string
  }) {
    const invite = await rpcAdapter.callSingle<OrganizationInviteResult>('create_organization_invite', {
      target_email: input.email,
      target_message: input.message ?? null,
      target_org_id: input.orgId,
      target_role: input.role,
    })

    if (!invite) {
      throw new Error('Rocketboard could not create the organization invite.')
    }

    await sendOrganizationInviteEmail({
      acceptToken: invite.acceptToken,
      email: invite.email,
      inviterName: input.inviterName,
      message: input.message,
      organizationId: input.orgId,
      organizationName: input.organizationName,
      role: invite.role,
    })

    return invite
  },
  async revokeInvitation(inviteId: string) {
    return rpcAdapter.call('revoke_invitation', {target_invite_id: inviteId})
  },

  async removeOrganizationMember(orgId: string, userId: string) {
    return rpcAdapter.call('remove_organization_member', {
      target_org_id: orgId,
      target_user_id: userId,
    })
  },

  async setOrganizationMemberRole(orgId: string, userId: string, role: string) {
    return rpcAdapter.call('set_organization_member_role', {
      target_org_id: orgId,
      target_role: role,
      target_user_id: userId,
    })
  },

  async setAllowedDomains(orgId: string, domains: string[]) {
    return rpcAdapter.call('set_organization_allowed_domains', {
      target_domains: domains,
      target_org_id: orgId,
    })
  },

  async setOrganizationTimezone(orgId: string, timezone: string) {
    return rpcAdapter.call('set_organization_timezone', {
      target_org_id: orgId,
      target_timezone: timezone,
    })
  },

  async setOrganizationAiSettings(input: {
    orgId: string
    driftWatcherEnabled: boolean
    workspaceGuidance: string | null
  }) {
    return rpcAdapter.call('set_organization_ai_settings', {
      target_drift_watcher_enabled: input.driftWatcherEnabled,
      target_org_id: input.orgId,
      target_workspace_guidance: input.workspaceGuidance,
    })
  },

  async listInviteRequests(orgId: string): Promise<OrgInviteRequest[]> {
    const rows = await rpcAdapter.callAndTransform<OrgInviteRequest[]>('list_invite_requests', {
      target_org_id: orgId,
    })
    return rows ?? []
  },

  async createInviteRequest(input: CreateOrgInviteRequestInput) {
    const row = await rpcAdapter.callSingle<{id: string; status: string}>('create_invite_request', {
      target_email: input.email,
      target_org_id: input.organizationId,
      target_role: input.role,
    })

    if (!row) {
      throw new Error('Rocketboard could not create the invite request.')
    }

    await sendInviteRequestNotification({
      organizationId: input.organizationId,
      requestId: row.id,
    })

    return row
  },

  async approveInviteRequest(input: ApproveOrgInviteRequestInput) {
    const result = await rpcAdapter.callSingle<{acceptToken: string; invitationId: string}>(
      'approve_invite_request',
      {target_request_id: input.requestId},
    )

    if (!result) {
      throw new Error('Rocketboard could not approve the invite request.')
    }

    await sendOrganizationInviteEmail({
      acceptToken: result.acceptToken,
      email: input.email,
      inviterName: input.inviterName,
      message: input.message,
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      role: input.role,
    })

    return result
  },

  async declineInviteRequest(input: DeclineOrgInviteRequestInput) {
    return rpcAdapter.call('decline_invite_request', {
      target_reason: input.reason ?? null,
      target_request_id: input.requestId,
    })
  },
}
