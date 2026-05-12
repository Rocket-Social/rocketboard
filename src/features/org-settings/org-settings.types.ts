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

export type OrgInviteRequest = {
  createdAt: string
  email: string
  expiresAt: string
  id: string
  requestedByEmail: string | null
  requestedByName: string
  requestedByUserId: string
  requestedRole: string
  status: string
  declineReason: string | null
}

export type CreateOrgInviteRequestInput = {
  email: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: string
}

export type ApproveOrgInviteRequestInput = {
  email: string
  inviterName: string
  message?: string
  organizationId: string
  organizationName: string
  requestId: string
  role: string
}

export type DeclineOrgInviteRequestInput = {
  reason?: string
  requestId: string
}

export type OrgInfo = {
  aiWorkspaceGuidance: string | null
  allowedDomains: string[]
  driftWatcherEnabled: boolean
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
