export type GitHubSourceAccessMode = 'manage' | 'project'

export type GitHubSourceRecord = {
  id?: unknown
  organization_id?: unknown
  owner_user_id?: unknown
  scope_type?: unknown
}

export type GitHubSourceAccessDependencies = {
  canAccessOrganization: (organizationId: string, userId: string) => Promise<boolean>
  canAccessProjectBoundSource: (input: {
    projectId: string
    sourceId: string
    userId: string
  }) => Promise<boolean>
  canManageOrganization: (organizationId: string, userId: string) => Promise<boolean>
}

export async function canAccessGitHubSource(input: {
  dependencies: GitHubSourceAccessDependencies
  mode: GitHubSourceAccessMode
  projectId?: string
  source: GitHubSourceRecord
  userId: string
}) {
  const {dependencies, mode, projectId, source, userId} = input

  if (source.scope_type === 'personal') {
    return source.owner_user_id === userId
  }

  if (source.scope_type !== 'organization' || typeof source.organization_id !== 'string') {
    return false
  }

  if (mode === 'manage') {
    return dependencies.canManageOrganization(source.organization_id, userId)
  }

  if (await dependencies.canAccessOrganization(source.organization_id, userId)) {
    return true
  }

  if (typeof source.id !== 'string' || !projectId) {
    return false
  }

  return dependencies.canAccessProjectBoundSource({
    projectId,
    sourceId: source.id,
    userId,
  })
}
