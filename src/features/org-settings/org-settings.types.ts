export type OrgMember = {
  createdAt: string
  email: string
  githubLogin: string | null
  invitedByName: string | null
  lastActiveAt: string | null
  name: string
  role: string
  seatStatus: string
  userId: string
}

export type OrgInvitation = {
  createdAt: string
  email: string
  emailSentAt: string | null
  id: string
  role: string
}

export type OrgInfo = {
  allowedDomains: string[]
  icon: string
  id: string
  inviteLinkEnabled: boolean
  inviteLinkToken: string
  name: string
  plan: string
  slug: string
  timezone: string | null
}

export type OrgMembersSnapshot = {
  canManage: boolean
  invitations: OrgInvitation[]
  members: OrgMember[]
  organization: OrgInfo
}
