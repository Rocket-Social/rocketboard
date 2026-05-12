import { callEdgeFunction } from '../../platform/edge/edge-client'
import { getSupabaseBrowserClient } from '../../platform/supabase/client'
import { rpcAdapter } from '../../platform/data/rpc-adapter'
import type {
  GitHubAllowedRepository,
  GitHubConnectionSource,
  GitHubProjectSettings,
  GitHubRepository,
} from './github.types'

type ConnectionSourceRow = {
  id: string
  organization_id: string | null
  owner_user_id: string | null
  scope_type: string
  auth_type: string
  installation_id: number
  account_login: string
  account_type: string
  account_avatar_url: string | null
  status: string
  installed_by: string | null
  last_validated_at: string | null
  created_at: string
  updated_at: string
}

type ProjectSettingsRow = {
  project_id: string
  connection_source_id: string | null
  auto_transitions_enabled: boolean | null
  configured_by: string | null
  analytics_sprint_length_weeks: number | null
  analytics_last_sprint_end_date: string | null
  analytics_timezone: string | null
  created_at: string
  updated_at: string
  github_connection_sources?: ConnectionSourceRow | null
}

type AllowedRepositoryRow = {
  id: string
  connection_source_id: string
  github_repo_id: number
  full_name: string
  name: string
  default_branch: string
  is_private: boolean
  created_at: string
  updated_at: string
}

type RepositoryRow = {
  id: string
  project_id: string
  installation_id: string | null
  connection_source_id: string
  github_repo_id: number
  full_name: string
  name: string
  default_branch: string
  is_private: boolean
  color_index: number
  history_backfilled_at: string | null
  last_synced_at: string | null
  created_at: string
}

function supabase() {
  return getSupabaseBrowserClient()
}

function mapConnectionSource(row: ConnectionSourceRow): GitHubConnectionSource {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerUserId: row.owner_user_id,
    scopeType: row.scope_type as GitHubConnectionSource['scopeType'],
    authType: row.auth_type as GitHubConnectionSource['authType'],
    installationId: Number(row.installation_id ?? 0),
    accountLogin: row.account_login,
    accountType: row.account_type as GitHubConnectionSource['accountType'],
    accountAvatarUrl: row.account_avatar_url,
    status: row.status as GitHubConnectionSource['status'],
    installedBy: row.installed_by,
    lastValidatedAt: row.last_validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProjectSettings(row: ProjectSettingsRow): GitHubProjectSettings {
  return {
    projectId: row.project_id,
    connectionSourceId: row.connection_source_id,
    autoTransitionsEnabled: row.auto_transitions_enabled ?? true,
    configuredBy: row.configured_by,
    analyticsSprintLengthWeeks: row.analytics_sprint_length_weeks,
    analyticsLastSprintEndDate: row.analytics_last_sprint_end_date,
    analyticsTimezone: row.analytics_timezone,
    connectionSource: row.github_connection_sources
      ? mapConnectionSource(row.github_connection_sources)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAllowedRepository(
  row: AllowedRepositoryRow,
): GitHubAllowedRepository {
  return {
    id: row.id,
    connectionSourceId: row.connection_source_id,
    githubRepoId: row.github_repo_id,
    fullName: row.full_name,
    name: row.name,
    defaultBranch: row.default_branch,
    isPrivate: row.is_private,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRepository(row: RepositoryRow): GitHubRepository {
  return {
    id: row.id,
    projectId: row.project_id,
    connectionSourceId: row.connection_source_id,
    githubRepoId: row.github_repo_id,
    fullName: row.full_name,
    name: row.name,
    defaultBranch: row.default_branch,
    isPrivate: row.is_private,
    colorIndex: row.color_index,
    historyBackfilledAt: row.history_backfilled_at,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
  }
}

export const githubConnectionRepository = {
  async listOrganizationSources(
    organizationId: string,
  ): Promise<GitHubConnectionSource[]> {
    const { data, error } = await supabase()
      .from('github_connection_sources')
      .select('*')
      .eq('scope_type', 'organization')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return []
      throw error
    }

    return (data ?? []).map((row) =>
      mapConnectionSource(row as ConnectionSourceRow),
    )
  },

  async listPersonalSources(): Promise<GitHubConnectionSource[]> {
    const { data, error } = await supabase()
      .from('github_connection_sources')
      .select('*')
      .eq('scope_type', 'personal')
      .order('updated_at', { ascending: false })

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return []
      throw error
    }

    return (data ?? []).map((row) =>
      mapConnectionSource(row as ConnectionSourceRow),
    )
  },

  async getProjectGitHubSettings(
    projectId: string,
  ): Promise<GitHubProjectSettings | null> {
    const { data, error } = await supabase()
      .from('project_github_settings')
      .select('*, github_connection_sources(*)')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return null
      throw error
    }

    return data ? mapProjectSettings(data as ProjectSettingsRow) : null
  },

  async setProjectGitHubSource(
    projectId: string,
    connectionSourceId: string,
  ): Promise<void> {
    await rpcAdapter.call('set_project_github_source', {
      target_project_id: projectId,
      target_connection_source_id: connectionSourceId,
    })
  },

  async clearProjectGitHubSource(projectId: string): Promise<void> {
    await rpcAdapter.call('clear_project_github_source', {
      target_project_id: projectId,
    })
  },

  async setProjectAutoTransitions(
    projectId: string,
    enabled: boolean,
  ): Promise<void> {
    const { error } = await supabase()
      .from('project_github_settings')
      .update({
        auto_transitions_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)

    if (error) throw error
  },

  async getAllowedRepositoriesForSource(
    connectionSourceId: string,
  ): Promise<GitHubAllowedRepository[]> {
    const { data, error } = await supabase()
      .from('github_connection_allowed_repositories')
      .select('*')
      .eq('connection_source_id', connectionSourceId)
      .order('full_name')

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return []
      throw error
    }

    return (data ?? []).map((row) =>
      mapAllowedRepository(row as AllowedRepositoryRow),
    )
  },

  async allowRepositoryForSource(
    connectionSourceId: string,
    repo: {
      githubRepoId: number
      fullName: string
      name: string
      defaultBranch: string
      isPrivate: boolean
    },
  ): Promise<GitHubAllowedRepository> {
    const { data, error } = await supabase()
      .from('github_connection_allowed_repositories')
      .upsert(
        {
          connection_source_id: connectionSourceId,
          default_branch: repo.defaultBranch,
          full_name: repo.fullName,
          github_repo_id: repo.githubRepoId,
          is_private: repo.isPrivate,
          name: repo.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_source_id,github_repo_id' },
      )
      .select('*')
      .single()

    if (error) throw error
    return mapAllowedRepository(data as AllowedRepositoryRow)
  },

  async removeAllowedRepositoryFromSource(
    connectionSourceId: string,
    githubRepoId: number,
  ): Promise<void> {
    const { error } = await supabase()
      .from('github_connection_allowed_repositories')
      .delete()
      .eq('connection_source_id', connectionSourceId)
      .eq('github_repo_id', githubRepoId)

    if (error) throw error
  },

  async getRepositoriesForProject(
    projectId: string,
  ): Promise<GitHubRepository[]> {
    const { data, error } = await supabase()
      .from('github_repositories')
      .select('*')
      .eq('project_id', projectId)
      .order('full_name')

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission'))
        return []
      throw error
    }

    return (data ?? []).map((row) => mapRepository(row as RepositoryRow))
  },

  async connectRepoToProject(
    projectId: string,
    connectionSourceId: string,
    repo: {
      githubRepoId: number
      fullName: string
      name: string
      defaultBranch: string
      isPrivate: boolean
    },
    colorIndex: number,
  ): Promise<GitHubRepository> {
    const { data, error } = await supabase()
      .from('github_repositories')
      .insert({
        project_id: projectId,
        connection_source_id: connectionSourceId,
        github_repo_id: repo.githubRepoId,
        full_name: repo.fullName,
        name: repo.name,
        default_branch: repo.defaultBranch,
        is_private: repo.isPrivate,
        color_index: colorIndex,
      })
      .select('*')
      .single()

    if (error) throw error
    return mapRepository(data as RepositoryRow)
  },

  async disconnectRepo(repoId: string): Promise<void> {
    const { error } = await supabase()
      .from('github_repositories')
      .delete()
      .eq('id', repoId)

    if (error) throw error
  },

  async syncRepo(repoId: string): Promise<{ synced: number; linked: number }> {
    return callEdgeFunction<{ synced: number; linked: number }>('github-sync', {
      body: { repo_id: repoId },
      errorFallback: 'Sync failed',
    })
  },
}
