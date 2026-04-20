import {sendInviteEmail} from '../access/invite-email'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {OrgMembersSnapshot} from './org-settings.types'

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
}
