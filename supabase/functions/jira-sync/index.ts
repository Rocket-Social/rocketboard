import {decryptToken, encryptToken} from '../_shared/github-crypto.ts'
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

const ATLASSIAN_CLIENT_ID = Deno.env.get('ATLASSIAN_CLIENT_ID')
const ATLASSIAN_CLIENT_SECRET = Deno.env.get('ATLASSIAN_CLIENT_SECRET')
const DEFAULT_WINDOW_DAYS = 90
const MAX_SEARCHED_ISSUES = 250
const MAX_SYNC_WINDOW_DAYS = 370
const JIRA_PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/

const DateOnlySchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => isValidDateOnly(value), 'Expected a real calendar date.')

const SyncActionSchema = z.object({
  connection_source_id: z.string().uuid().nullish(),
  from: DateOnlySchema.nullish(),
  project_id: z.string().uuid(),
  to: DateOnlySchema.nullish(),
}).superRefine((value, context) => {
  if (!value.from || !value.to) return

  if (value.from > value.to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'from must be on or before to.',
      path: ['from'],
    })
  }

  if (daysBetween(value.from, value.to) > MAX_SYNC_WINDOW_DAYS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Jira sync windows cannot exceed ${MAX_SYNC_WINDOW_DAYS} days.`,
      path: ['to'],
    })
  }
})

export const JiraSyncBodySchema = SyncActionSchema

type JiraSource = {
  cloud_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  id: string
  organization_id: string
  site_url: string
  token_expires_at: string
}

type ProjectJiraSettings = {
  jiraProjectKey: string | null
  source: JiraSource | null
}

type JiraUser = {
  accountId?: string
  displayName?: string
  emailAddress?: string
}

type JiraIssue = {
  changelog?: {
    histories?: Array<{
      author?: JiraUser
      created?: string
      items?: Array<{
        field?: string
        fromString?: string | null
        toString?: string | null
      }>
    }>
  }
  fields?: {
    assignee?: JiraUser | null
    resolutiondate?: string | null
  }
  id: string
  key: string
}

type JiraWorklog = {
  author?: JiraUser
  started?: string
  timeSpentSeconds?: number
}

type ContributorAggregate = {
  contributorEmail: string | null
  contributorName: string
  jiraAccountId: string
  loggedSeconds: number
  reopenedBugs: number
  resolvedBugs: number
}

Deno.serve(withMonitoring('jira-sync', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({error: 'Method not allowed'}, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return jsonResponse({error: 'Unauthorized'}, 401)
  }

  let body: z.infer<typeof JiraSyncBodySchema>
  try {
    body = await parseJsonBody(req, JiraSyncBodySchema)
  } catch (error) {
    return errorResponseForException(error, 'Invalid request', 'jira-sync')
  }

  const supabase = createServiceClient()
  if (!(await canManageProject(supabase, body.project_id, user.id))) {
    return jsonResponse({error: 'Forbidden', message: 'Only project admins can sync Jira stats.'}, 403)
  }

  const jiraSettings = await resolveJiraSettings({
    projectId: body.project_id,
    requestedSourceId: body.connection_source_id ?? null,
    supabase,
  })
  const source = jiraSettings.source

  if (!source) {
    return jsonResponse({error: 'jira_not_connected', message: 'Connect Jira in organization settings before syncing Jira stats.'}, 400)
  }

  if (!jiraSettings.jiraProjectKey) {
    return jsonResponse({error: 'jira_project_not_configured', message: 'Set a Jira project key for this board before syncing Jira stats.'}, 400)
  }

  const window = getSyncWindow(body.from ?? null, body.to ?? null)
  if (daysBetween(window.from, window.to) > MAX_SYNC_WINDOW_DAYS) {
    return jsonResponse({
      error: 'invalid_window',
      message: `Jira sync windows cannot exceed ${MAX_SYNC_WINDOW_DAYS} days.`,
    }, 400)
  }

  try {
    const token = await resolveAccessToken(supabase, source)
    const aggregates = await fetchJiraContributorAggregates({
      source,
      jiraProjectKey: jiraSettings.jiraProjectKey,
      token,
      window,
    })

    const {error: storeError} = await supabase.rpc('replace_project_jira_contributor_stats', {
      stats: aggregates.map((aggregate) => ({
        contributor_email: aggregate.contributorEmail,
        contributor_name: aggregate.contributorName,
        jira_account_id: aggregate.jiraAccountId,
        logged_seconds: aggregate.loggedSeconds,
        reopened_bugs: aggregate.reopenedBugs,
        resolved_bugs: aggregate.resolvedBugs,
      })),
      target_connection_source_id: source.id,
      target_project_id: body.project_id,
      target_window_end_date: window.to,
      target_window_start_date: window.from,
    })

    if (storeError) {
      console.error('[jira-sync] Failed to store Jira stats:', storeError)
      return jsonResponse({error: 'store_failed', message: 'Could not store Jira stats.'}, 500)
    }

    await supabase
      .from('jira_connection_sources')
      .update({
        last_synced_at: new Date().toISOString(),
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id)

    return jsonResponse({
      contributors: aggregates.length,
      source_id: source.id,
      success: true,
      window,
    })
  } catch (error) {
    console.error('[jira-sync] Sync failed:', error)
    await supabase
      .from('jira_connection_sources')
      .update({status: 'error', updated_at: new Date().toISOString()})
      .eq('id', source.id)

    return jsonResponse({error: 'sync_failed', message: error instanceof Error ? error.message : 'Jira sync failed.'}, 500)
  }
}))

async function resolveJiraSettings(input: {
  projectId: string
  requestedSourceId: string | null
  supabase: ReturnType<typeof createServiceClient>
}): Promise<ProjectJiraSettings> {
  const {data: project} = await input.supabase
    .from('projects')
    .select('workspace_id')
    .eq('id', input.projectId)
    .maybeSingle()

  if (!project?.workspace_id) return {jiraProjectKey: null, source: null}

  const {data: workspace} = await input.supabase
    .from('workspaces')
    .select('organization_id')
    .eq('id', project.workspace_id)
    .maybeSingle()

  const organizationId = workspace?.organization_id
  if (!organizationId) return {jiraProjectKey: null, source: null}

  const {data: setting} = await input.supabase
    .from('project_jira_settings')
    .select('connection_source_id, jira_project_key')
    .eq('project_id', input.projectId)
    .maybeSingle()

  const jiraProjectKey = normalizeJiraProjectKey(setting?.jira_project_key ?? null)

  if (input.requestedSourceId) {
    const {data} = await input.supabase
      .from('jira_connection_sources')
      .select('id, organization_id, cloud_id, site_url, encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .eq('id', input.requestedSourceId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .maybeSingle()
    return {jiraProjectKey, source: data as JiraSource | null}
  }

  if (setting?.connection_source_id) {
    const {data} = await input.supabase
      .from('jira_connection_sources')
      .select('id, organization_id, cloud_id, site_url, encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .eq('id', setting.connection_source_id)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .maybeSingle()
    return {jiraProjectKey, source: data as JiraSource | null}
  }

  const {data} = await input.supabase
    .from('jira_connection_sources')
    .select('id, organization_id, cloud_id, site_url, encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('updated_at', {ascending: false})
    .limit(1)
    .maybeSingle()

  return {jiraProjectKey, source: data as JiraSource | null}
}

async function resolveAccessToken(
  supabase: ReturnType<typeof createServiceClient>,
  source: JiraSource,
) {
  const current = await decryptToken(source.encrypted_access_token)
  if (!current) {
    throw new Error('Stored Jira access token could not be decrypted.')
  }

  if (new Date(source.token_expires_at).getTime() > Date.now() + 60_000) {
    return current
  }

  if (!ATLASSIAN_CLIENT_ID || !ATLASSIAN_CLIENT_SECRET) {
    throw new Error('Atlassian OAuth is not configured.')
  }

  const refreshToken = await decryptToken(source.encrypted_refresh_token)
  if (!refreshToken) {
    throw new Error('Stored Jira refresh token could not be decrypted.')
  }

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    body: JSON.stringify({
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Atlassian token refresh failed: ${response.status}`)
  }

  const refreshed = await response.json() as {
    access_token: string
    expires_in: number
    refresh_token?: string
  }

  await supabase
    .from('jira_connection_sources')
    .update({
      encrypted_access_token: await encryptToken(refreshed.access_token),
      encrypted_refresh_token: await encryptToken(refreshed.refresh_token ?? refreshToken),
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id)

  return refreshed.access_token
}

async function fetchJiraContributorAggregates(input: {
  jiraProjectKey: string
  source: JiraSource
  token: string
  window: {from: string; to: string}
}) {
  const aggregates = new Map<string, ContributorAggregate>()
  const projectJql = `project = "${input.jiraProjectKey}"`

  const bugIssues = await searchIssues({
    expand: ['changelog'],
    fields: ['assignee', 'resolutiondate'],
    jql: `${projectJql} AND issuetype = Bug AND updated >= "${input.window.from}" AND updated <= "${input.window.to}" ORDER BY updated ASC`,
    source: input.source,
    token: input.token,
  })

  for (const issue of bugIssues) {
    collectBugTransitions(issue, input.window, aggregates)
  }

  const worklogIssues = await searchIssues({
    fields: ['summary'],
    jql: `${projectJql} AND worklogDate >= "${input.window.from}" AND worklogDate <= "${input.window.to}" ORDER BY updated ASC`,
    source: input.source,
    token: input.token,
  })

  for (const issue of worklogIssues) {
    const worklogs = await fetchIssueWorklogs({
      issueIdOrKey: issue.id,
      source: input.source,
      token: input.token,
      window: input.window,
    })

    for (const worklog of worklogs) {
      const started = worklog.started ? Date.parse(worklog.started) : Number.NaN
      if (!Number.isFinite(started)) continue
      if (dateOnly(new Date(started)) < input.window.from || dateOnly(new Date(started)) > input.window.to) continue

      const aggregate = getAggregate(aggregates, worklog.author)
      aggregate.loggedSeconds += Math.max(0, Number(worklog.timeSpentSeconds ?? 0))
    }
  }

  return [...aggregates.values()]
    .filter((aggregate) =>
      aggregate.reopenedBugs > 0 ||
      aggregate.resolvedBugs > 0 ||
      aggregate.loggedSeconds > 0
    )
    .sort((left, right) => left.contributorName.localeCompare(right.contributorName))
}

async function searchIssues(input: {
  expand?: string[]
  fields: string[]
  jql: string
  source: JiraSource
  token: string
}): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = []
  let nextPageToken: string | undefined

  while (issues.length < MAX_SEARCHED_ISSUES) {
    const response = await jiraFetch(input.source, input.token, '/rest/api/3/search/jql', {
      body: JSON.stringify({
        ...(input.expand && input.expand.length > 0 ? {expand: input.expand.join(',')} : {}),
        fields: input.fields,
        jql: input.jql,
        maxResults: 50,
        ...(nextPageToken ? {nextPageToken} : {}),
      }),
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
    })

    const data = await response.json() as {
      issues?: JiraIssue[]
      isLast?: boolean
      nextPageToken?: string
    }
    const page = data.issues ?? []
    issues.push(...page)

    if (page.length === 0 || data.isLast === true || !data.nextPageToken) break
    if (issues.length >= MAX_SEARCHED_ISSUES) {
      throw new Error(`Jira search exceeded the ${MAX_SEARCHED_ISSUES} issue safety cap. Narrow the sprint range or Jira project scope and retry.`)
    }
    nextPageToken = data.nextPageToken
  }

  return issues.slice(0, MAX_SEARCHED_ISSUES)
}

async function fetchIssueWorklogs(input: {
  issueIdOrKey: string
  source: JiraSource
  token: string
  window: {from: string; to: string}
}): Promise<JiraWorklog[]> {
  const startedAfter = new Date(`${input.window.from}T00:00:00Z`).getTime()
  const startedBefore = new Date(`${input.window.to}T23:59:59Z`).getTime()
  const worklogs: JiraWorklog[] = []
  let startAt = 0

  while (true) {
    const path = `/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}/worklog?startedAfter=${startedAfter}&startedBefore=${startedBefore}&maxResults=100&startAt=${startAt}`
    const response = await jiraFetch(input.source, input.token, path)
    const data = await response.json() as {
      maxResults?: number
      startAt?: number
      total?: number
      worklogs?: JiraWorklog[]
    }
    const page = data.worklogs ?? []
    worklogs.push(...page)

    if (page.length === 0 || worklogs.length >= Number(data.total ?? 0)) break
    startAt += Number(data.maxResults ?? page.length)
  }

  return worklogs
}

async function jiraFetch(
  source: JiraSource,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://api.atlassian.com/ex/jira/${source.cloud_id}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Jira API ${response.status}: ${body.slice(0, 200)}`)
  }

  return response
}

function collectBugTransitions(
  issue: JiraIssue,
  window: {from: string; to: string},
  aggregates: Map<string, ContributorAggregate>,
) {
  let sawResolvedTransition = false

  for (const history of issue.changelog?.histories ?? []) {
    const changedDate = history.created ? dateOnly(new Date(history.created)) : null
    if (!changedDate || changedDate < window.from || changedDate > window.to) continue

    for (const item of history.items ?? []) {
      if (item.field?.toLowerCase() !== 'status') continue

      const fromDone = isDoneStatus(item.fromString)
      const toDone = isDoneStatus(item.toString)
      if (!fromDone && toDone) {
        getAggregate(aggregates, history.author).resolvedBugs += 1
        sawResolvedTransition = true
      }
      if (fromDone && !toDone) {
        getAggregate(aggregates, history.author).reopenedBugs += 1
      }
    }
  }

  if (!sawResolvedTransition && issue.fields?.resolutiondate) {
    const resolvedDate = dateOnly(new Date(issue.fields.resolutiondate))
    if (resolvedDate >= window.from && resolvedDate <= window.to) {
      getAggregate(aggregates, issue.fields.assignee ?? undefined).resolvedBugs += 1
    }
  }
}

function getAggregate(
  aggregates: Map<string, ContributorAggregate>,
  user: JiraUser | null | undefined,
) {
  const accountId = user?.accountId || 'unassigned'
  const existing = aggregates.get(accountId)
  if (existing) return existing

  const aggregate: ContributorAggregate = {
    contributorEmail: user?.emailAddress ?? null,
    contributorName: user?.displayName ?? (accountId === 'unassigned' ? 'Unassigned' : accountId),
    jiraAccountId: accountId,
    loggedSeconds: 0,
    reopenedBugs: 0,
    resolvedBugs: 0,
  }
  aggregates.set(accountId, aggregate)
  return aggregate
}

function isDoneStatus(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return ['done', 'resolved', 'closed', 'complete', 'completed'].includes(normalized)
}

function getSyncWindow(from: string | null, to: string | null) {
  const end = to ? new Date(`${to}T12:00:00Z`) : new Date()
  const start = from
    ? new Date(`${from}T12:00:00Z`)
    : addDays(end, -DEFAULT_WINDOW_DAYS)

  return {
    from: dateOnly(start),
    to: dateOnly(end),
  }
}

function normalizeJiraProjectKey(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? ''
  return JIRA_PROJECT_KEY_PATTERN.test(normalized) ? normalized : null
}

function isValidDateOnly(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && dateOnly(date) === value
}

function daysBetween(from: string, to: string) {
  const fromMs = new Date(`${from}T12:00:00Z`).getTime()
  const toMs = new Date(`${to}T12:00:00Z`).getTime()
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000))
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateOnly(value: Date) {
  return value.toISOString().split('T')[0]!
}

async function canManageProject(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  userId: string,
) {
  const {data, error} = await supabase.rpc('can_manage_project', {
    target_project_id: projectId,
    target_user_id: userId,
  })
  if (error) {
    console.error('[jira-sync] Failed to resolve project manage access:', error)
    return false
  }
  return data === true
}
