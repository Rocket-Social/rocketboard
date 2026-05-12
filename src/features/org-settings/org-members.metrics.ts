import type {OrgMember} from './org-settings.types'

type OrgMemberRole = Pick<OrgMember, 'role'>

export type OrgAccessMetrics = {
  adminCount: number
  guestCount: number
  memberSeatCount: number
  peopleCount: number
}

export function isGuestOrgMember(member: OrgMemberRole): boolean {
  return member.role === 'guest'
}

// AI agent users (organization_role='agent', synthetic users provisioned by
// `provision_agent_user` for assistant/monitor personas) are stored in
// `organization_members` but should NEVER appear in human-facing access lists
// or count toward billable seats. Defense in depth alongside the SQL filter
// in `get_organization_members` (migration 20260507115000).
export function isAgentOrgMember(member: OrgMemberRole): boolean {
  return member.role === 'agent'
}

export function getOrgAccessMetrics(members: readonly OrgMemberRole[]): OrgAccessMetrics {
  const humans = members.filter((member) => !isAgentOrgMember(member))
  const peopleCount = humans.length
  const guestCount = humans.filter(isGuestOrgMember).length
  const adminCount = humans.filter((member) => member.role === 'admin').length

  return {
    adminCount,
    guestCount,
    memberSeatCount: peopleCount - guestCount,
    peopleCount,
  }
}
