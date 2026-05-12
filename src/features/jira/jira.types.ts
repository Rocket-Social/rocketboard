export type JiraConnectionStatus = 'active' | 'error' | 'revoked'

export type JiraConnectionSource = {
  accountEmail: string | null
  accountId: string
  cloudId: string
  createdAt: string
  id: string
  lastSyncedAt: string | null
  organizationId: string
  scopes: string[]
  siteName: string
  siteUrl: string
  status: JiraConnectionStatus
  updatedAt: string
}

export type JiraConnectionConfig = {
  configured: boolean
  missingSecrets: string[]
  redirectUri: string
  scopes: string[]
}

export type JiraConnectionStatusResponse = {
  canManage: boolean
  config: JiraConnectionConfig
  sources: JiraConnectionSource[]
}

export type JiraPendingSite = {
  cloudId: string
  siteName: string
  siteUrl: string
}

export type JiraContributorStatsRow = {
  computedAt: string
  connectionSourceId: string
  contributorEmail: string | null
  contributorName: string
  id: string
  jiraAccountId: string
  loggedSeconds: number
  projectId: string
  reopenedBugs: number
  resolvedBugs: number
  windowEndDate: string
  windowStartDate: string
}

export type ProjectJiraSettings = {
  connectionSourceId: string | null
  createdAt: string
  jiraProjectKey: string | null
  projectId: string
  updatedAt: string
}

export type JiraSyncResult = {
  contributors: number
  sourceId: string
  success: boolean
  window: {
    from: string
    to: string
  }
}
