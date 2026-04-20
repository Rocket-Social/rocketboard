import {canAccessGitHubSource} from '../_shared/github-source-access.ts'
import { decryptToken, getInstallationAccessToken } from '../_shared/github-crypto.ts'
import {
  createServiceClient,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'

export const GithubReposBodySchema = z.object({
  connection_source_id: z.string().uuid(),
  mode: z.enum(['project', 'manage']).optional(),
  project_id: z.string().uuid().optional(),
})

Deno.serve(withMonitoring('github-repos', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabase = createServiceClient()
    const body = await parseJsonBody(req, GithubReposBodySchema)
    const connectionSourceId = body.connection_source_id
    const mode = body.mode === 'manage' ? 'manage' : 'project'
    const projectId = body.project_id

    const { data: source } = await supabase
      .from('github_connection_sources')
      .select('*')
      .eq('id', connectionSourceId)
      .maybeSingle()

    if (!source) {
      return jsonResponse({ error: 'GitHub source not found' }, 404)
    }

    if (!(await canAccessSource(supabase, source, user.id, mode, projectId))) {
      return jsonResponse({ error: 'Forbidden', message: 'You do not have access to this GitHub source.' }, 403)
    }

    const token = await resolveGitHubToken(source)
    if (!token) {
      return jsonResponse({ error: 'Failed to get GitHub access token' }, 500)
    }

    const repos = await fetchAccessibleRepos(token, source)

    if (source.scope_type === 'organization') {
      const { data: allowed } = await supabase
        .from('github_connection_allowed_repositories')
        .select('github_repo_id')
        .eq('connection_source_id', connectionSourceId)

      const allowedRepoIds = new Set((allowed ?? []).map((row) => Number(row.github_repo_id)))

      if (mode === 'manage') {
        return jsonResponse({
          repos: repos.map((repo) => ({
            ...repo,
            is_allowed: allowedRepoIds.has(Number(repo.id)),
          })),
        })
      }

      return jsonResponse({
        repos: repos.filter((repo) => allowedRepoIds.has(Number(repo.id))),
      })
    }

    return jsonResponse({ repos })
  } catch (err) {
    console.error('[github-repos] Error:', err)
    return errorResponseForException(err, 'Internal error', 'github-repos')
  }
}))

async function canAccessSource(
  supabase: ReturnType<typeof createServiceClient>,
  source: Record<string, unknown>,
  userId: string,
  mode: 'manage' | 'project',
  projectId?: string,
) {
  return canAccessGitHubSource({
    dependencies: {
      canAccessOrganization: async (organizationId, currentUserId) => {
        const { data, error } = await supabase.rpc('can_access_organization', {
          target_org_id: organizationId,
          target_user_id: currentUserId,
        })

        if (error) {
          console.error('[github-repos] Failed to resolve org access:', error)
          return false
        }

        return data === true
      },
      canAccessProjectBoundSource: async ({projectId: targetProjectId, sourceId, userId: currentUserId}) => {
        const { data: canAccessProject, error: accessError } = await supabase.rpc('can_access_project', {
          target_project_id: targetProjectId,
          target_user_id: currentUserId,
        })

        if (accessError) {
          console.error('[github-repos] Failed to resolve project access:', accessError)
          return false
        }

        if (canAccessProject !== true) {
          return false
        }

        const { data: binding, error: bindingError } = await supabase
          .from('project_github_settings')
          .select('project_id')
          .eq('project_id', targetProjectId)
          .eq('connection_source_id', sourceId)
          .maybeSingle()

        if (bindingError) {
          console.error('[github-repos] Failed to resolve project/source binding:', bindingError)
          return false
        }

        return Boolean(binding)
      },
      canManageOrganization: async (organizationId, currentUserId) => {
        const { data, error } = await supabase.rpc('can_manage_organization', {
          target_org_id: organizationId,
          target_user_id: currentUserId,
        })

        if (error) {
          console.error('[github-repos] Failed to resolve org admin access:', error)
          return false
        }

        return data === true
      },
    },
    mode,
    projectId,
    source,
    userId,
  })
}

async function fetchAccessibleRepos(
  token: string,
  source: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  if (source.auth_type === 'github_app' || Number(source.installation_id ?? 0) > 0) {
    return fetchInstallationRepos(token)
  }

  return fetchUserRepos(token)
}

async function fetchUserRepos(token: string): Promise<Record<string, unknown>[]> {
  const allRepos: Record<string, unknown>[] = []
  const seen = new Set<number>()
  let page = 1

  while (page <= 5) {
    const response = await fetch(
      `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100&page=${page}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[github-repos] GitHub API error:', response.status, errorBody)
      break
    }

    const repos = await response.json() as Record<string, unknown>[]
    if (repos.length === 0) break

    for (const repo of repos) {
      const repoId = Number(repo.id)
      if (seen.has(repoId)) continue
      seen.add(repoId)
      allRepos.push({
        default_branch: repo.default_branch ?? 'main',
        description: repo.description ?? null,
        full_name: repo.full_name,
        id: repoId,
        language: repo.language ?? null,
        name: repo.name,
        private: repo.private ?? false,
        pushed_at: repo.pushed_at ?? null,
      })
    }

    if (repos.length < 100) break
    page++
  }

  return allRepos
}

async function fetchInstallationRepos(token: string): Promise<Record<string, unknown>[]> {
  const allRepos: Record<string, unknown>[] = []
  let page = 1

  while (page <= 5) {
    const response = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[github-repos] GitHub installation API error:', response.status, errorBody)
      break
    }

    const payload = await response.json() as {repositories?: Record<string, unknown>[]}
    const repos = payload.repositories ?? []
    if (repos.length === 0) break

    for (const repo of repos) {
      allRepos.push({
        default_branch: repo.default_branch ?? 'main',
        description: repo.description ?? null,
        full_name: repo.full_name,
        id: Number(repo.id),
        language: repo.language ?? null,
        name: repo.name,
        private: repo.private ?? false,
        pushed_at: repo.pushed_at ?? null,
      })
    }

    if (repos.length < 100) break
    page++
  }

  return allRepos
}

async function resolveGitHubToken(source: Record<string, unknown>): Promise<string | null> {
  const permissions = source.permissions as Record<string, unknown> | null

  if (permissions?.oauth_token_encrypted) {
    return decryptToken(String(permissions.oauth_token_encrypted))
  }

  const installationId = Number(source.installation_id ?? 0)
  if (installationId > 0) {
    return getInstallationAccessToken(installationId)
  }

  return null
}

