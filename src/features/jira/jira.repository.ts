import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import type {JiraContributorStatsRow, ProjectJiraSettings} from './jira.types'

type JiraContributorStatsDbRow = {
  computed_at: string
  connection_source_id: string
  contributor_email: string | null
  contributor_name: string
  id: string
  jira_account_id: string
  logged_seconds: number
  project_id: string
  reopened_bugs: number
  resolved_bugs: number
  window_end_date: string
  window_start_date: string
}

type ProjectJiraSettingsDbRow = {
  connection_source_id: string | null
  created_at: string
  jira_project_key: string | null
  project_id: string
  updated_at: string
}

function supabase() {
  return getSupabaseBrowserClient()
}

function mapJiraContributorStatsRow(
  row: JiraContributorStatsDbRow,
): JiraContributorStatsRow {
  return {
    computedAt: row.computed_at,
    connectionSourceId: row.connection_source_id,
    contributorEmail: row.contributor_email,
    contributorName: row.contributor_name,
    id: row.id,
    jiraAccountId: row.jira_account_id,
    loggedSeconds: row.logged_seconds,
    projectId: row.project_id,
    reopenedBugs: row.reopened_bugs,
    resolvedBugs: row.resolved_bugs,
    windowEndDate: row.window_end_date,
    windowStartDate: row.window_start_date,
  }
}

function mapProjectJiraSettingsRow(
  row: ProjectJiraSettingsDbRow,
): ProjectJiraSettings {
  return {
    connectionSourceId: row.connection_source_id,
    createdAt: row.created_at,
    jiraProjectKey: row.jira_project_key,
    projectId: row.project_id,
    updatedAt: row.updated_at,
  }
}

export const jiraRepository = {
  async getProjectContributorStats(
    projectId: string,
    from?: string | null,
    to?: string | null,
    connectionSourceId?: string | null,
  ): Promise<JiraContributorStatsRow[]> {
    let query = supabase()
      .from('jira_contributor_stats')
      .select('*')
      .eq('project_id', projectId)
      .order('contributor_name')

    if (from && to) {
      query = query
        .eq('window_start_date', from)
        .eq('window_end_date', to)
    }

    if (connectionSourceId) {
      query = query.eq('connection_source_id', connectionSourceId)
    }

    const {data, error} = await query

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission')) {
        return []
      }
      throw error
    }

    return (data ?? []).map((row) =>
      mapJiraContributorStatsRow(row as JiraContributorStatsDbRow),
    )
  },

  async getProjectJiraSettings(
    projectId: string,
  ): Promise<ProjectJiraSettings | null> {
    const {data, error} = await supabase()
      .from('project_jira_settings')
      .select('project_id, connection_source_id, jira_project_key, created_at, updated_at')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission')) {
        return null
      }
      throw error
    }

    return data ? mapProjectJiraSettingsRow(data as ProjectJiraSettingsDbRow) : null
  },

  async setProjectJiraSource(
    projectId: string,
    connectionSourceId: string,
    jiraProjectKey: string,
  ): Promise<void> {
    await rpcAdapter.call('set_project_jira_source', {
      target_connection_source_id: connectionSourceId,
      target_jira_project_key: jiraProjectKey,
      target_project_id: projectId,
    })
  },

  async clearProjectJiraSource(projectId: string): Promise<void> {
    await rpcAdapter.call('clear_project_jira_source', {
      target_project_id: projectId,
    })
  },
}
