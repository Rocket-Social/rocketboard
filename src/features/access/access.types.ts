export type OrganizationRole = 'admin' | 'member' | 'guest'
export type ScopeAccessRole = 'admin' | 'member' | 'guest'
export type ResourceAccess = 'open' | 'private'
export type EffectiveAccessRole = 'admin' | 'member' | 'guest'
export type AccessSource = 'organization' | 'workspace' | 'project'

type AccessPerson = {
  avatarUrl?: string | null
  email: string
  githubLogin: string | null
  id: string
  name: string
}

type AccessCapabilities = {
  canEdit: boolean
  canManage: boolean
  effectiveRole: EffectiveAccessRole
  orgRole: OrganizationRole
}

export type PendingScopeInvite = {
  createdAt: string
  email: string
  emailSentAt: string | null
  id: string
  role: ScopeAccessRole
}

export type ProjectDirectAccessEntry = AccessPerson & AccessCapabilities & {
  orgRole: OrganizationRole
  scopeRole: ScopeAccessRole
}

export type WorkspaceDirectAccessEntry = AccessPerson & AccessCapabilities & {
  orgRole: OrganizationRole
  scopeRole: ScopeAccessRole
}

export type ProjectCollaborator = AccessPerson & Partial<AccessCapabilities> & {
  accessSource?: AccessSource
  projectRole?: ScopeAccessRole | null
  role?: EffectiveAccessRole
  workspaceRole?: ScopeAccessRole | null
}

export type WorkspaceCollaborator = AccessPerson & Partial<AccessCapabilities> & {
  accessSource?: Exclude<AccessSource, 'project'>
  role?: EffectiveAccessRole
  workspaceRole?: ScopeAccessRole | null
}

export type ProjectAccessSnapshot = {
  canEditProject: boolean
  canManageProject: boolean
  collaborators: ProjectCollaborator[]
  currentOrgRole: OrganizationRole
  directAccess: ProjectDirectAccessEntry[]
  pendingInvites: PendingScopeInvite[]
  projectAccess: ResourceAccess
  workspaceAccess: ResourceAccess
}

export type WorkspaceAccessSnapshot = {
  canEditWorkspace: boolean
  canManageWorkspace: boolean
  collaborators: WorkspaceCollaborator[]
  currentOrgRole: OrganizationRole
  directAccess: WorkspaceDirectAccessEntry[]
  pendingInvites: PendingScopeInvite[]
  workspaceAccess: ResourceAccess
}

export type WorkspaceMemberSearchResult = {
  email: string
  name: string
  orgRole: OrganizationRole
  userId: string
}

export type WorkspaceAccessProjectSummary = {
  canAccessProject: boolean
  canManageProject: boolean
  projectAccess: ResourceAccess
  projectId: string
  projectName: string
  projectSlug: string
}

export type WorkspaceAccessRouteContext = {
  canAccessWorkspace: boolean
  canManageWorkspace: boolean
  organizationId: string
  organizationName: string
  organizationSlug: string
  workspaceAccess: ResourceAccess
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
}

export type ProjectAccessRouteContext = {
  canAccessProject: boolean
  canManageProject: boolean
  organizationId: string
  organizationName: string
  organizationSlug: string
  projectAccess: ResourceAccess
  projectId: string
  projectName: string
  projectSlug: string
  workspaceAccess: ResourceAccess
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
}

export type AddProjectAccessInput = {
  projectId: string
  role: ScopeAccessRole
  userId: string
}

export type SetProjectAccessRoleInput = {
  projectId: string
  role: ScopeAccessRole
  userId: string
}

export type RemoveProjectAccessInput = {
  projectId: string
  userId: string
}

export type AddWorkspaceAccessInput = {
  role: ScopeAccessRole
  userId: string
  workspaceId: string
}

export type SetWorkspaceAccessRoleInput = {
  role: ScopeAccessRole
  userId: string
  workspaceId: string
}

export type RemoveWorkspaceAccessInput = {
  userId: string
  workspaceId: string
}

export type SetProjectVisibilityInput = {
  access: ResourceAccess
  projectId: string
}

export type SetWorkspaceVisibilityInput = {
  access: ResourceAccess
  workspaceId: string
}

export type CreateWorkspaceInviteInput = {
  email: string
  inviterName: string
  role: ScopeAccessRole
  workspaceId: string
  workspaceName: string
}

export type CreateProjectInviteInput = {
  email: string
  inviterName: string
  projectId: string
  projectName: string
  role: ScopeAccessRole
}

// Temporary compatibility alias while the rest of the app migrates off the old name.
export type ProjectMember = ProjectCollaborator
