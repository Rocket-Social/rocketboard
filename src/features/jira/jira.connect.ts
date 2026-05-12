import {getErrorMessage, snakeToCamel} from '../../platform/data/rpc-adapter'
import {callEdgeFunction, EdgeFunctionError} from '../../platform/edge/edge-client'
import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import type {JiraConnectionStatusResponse, JiraPendingSite, JiraSyncResult} from './jira.types'

type JiraFunctionName = 'jira-oauth' | 'jira-sync'

type JiraFunctionResult = {
  data: unknown
  response: {ok: boolean; status: number}
}

async function getSignedInEmail() {
  const supabase = getSupabaseBrowserClient()
  const {data: {user}} = await supabase.auth.getUser()
  return user?.email ?? null
}

async function buildOrgAdminErrorMessage(message: string) {
  const email = await getSignedInEmail()
  if (!email) return message

  return `${message} Signed in as ${email}. If this should be your org admin account, refresh the page or sign out and back in with Google, then retry.`
}

function isOrgAdminError(message: string) {
  return message.includes('Only org admins can')
    || message.includes('Only organization admins can')
}

async function callJiraFunction(input: {
  body?: Record<string, unknown>
  method?: 'GET' | 'POST'
  name: JiraFunctionName
  searchParams?: URLSearchParams
}): Promise<JiraFunctionResult> {
  try {
    const data = await callEdgeFunction<unknown>(input.name, {
      body: input.body,
      method: input.method,
      searchParams: input.searchParams,
    })
    return {data, response: {ok: true, status: 200}}
  } catch (error) {
    if (error instanceof EdgeFunctionError) {
      return {data: error.data, response: {ok: false, status: error.status}}
    }
    throw error
  }
}

function extractErrorMessage(result: JiraFunctionResult, fallback: string) {
  return getErrorMessage(result.data, fallback)
}

export async function getJiraConnectionStatus(
  organizationId: string,
): Promise<JiraConnectionStatusResponse> {
  const result = await callJiraFunction({
    body: {action: 'status', organization_id: organizationId},
    method: 'POST',
    name: 'jira-oauth',
  })

  if (!result.response.ok) {
    const message = extractErrorMessage(result, 'Failed to load Jira connection status.')
    if (result.response.status === 403 && isOrgAdminError(message)) {
      throw new Error(await buildOrgAdminErrorMessage(message))
    }
    throw new Error(message)
  }

  return snakeToCamel<JiraConnectionStatusResponse>(result.data)
}

export async function initiateJiraConnection(
  organizationId: string,
  returnPath?: string,
) {
  const result = await callJiraFunction({
    body: {
      action: 'initiate',
      organization_id: organizationId,
      return_path: returnPath ?? window.location.pathname,
    },
    method: 'POST',
    name: 'jira-oauth',
  })

  if (result.response.ok && typeof (result.data as {auth_url?: string}).auth_url === 'string') {
    window.location.href = (result.data as {auth_url: string}).auth_url
    return
  }

  const message = extractErrorMessage(result, 'Could not start Jira connection.')
  if (result.response.status === 403 && isOrgAdminError(message)) {
    throw new Error(await buildOrgAdminErrorMessage(message))
  }
  throw new Error(message)
}

export async function disconnectJira(sourceId: string): Promise<void> {
  const result = await callJiraFunction({
    body: {action: 'disconnect', source_id: sourceId},
    method: 'POST',
    name: 'jira-oauth',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Could not disconnect Jira.'))
  }
}

export async function getPendingJiraSites(
  state: string,
  organizationId: string,
): Promise<JiraPendingSite[]> {
  const result = await callJiraFunction({
    body: {action: 'pending_sites', organization_id: organizationId, state},
    method: 'POST',
    name: 'jira-oauth',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Could not load Jira site choices.'))
  }

  return snakeToCamel<{sites: JiraPendingSite[]}>(result.data).sites ?? []
}

export async function completeJiraConnectionSelection(
  state: string,
  cloudId: string,
  organizationId: string,
): Promise<void> {
  const result = await callJiraFunction({
    body: {action: 'complete_selection', cloud_id: cloudId, organization_id: organizationId, state},
    method: 'POST',
    name: 'jira-oauth',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Could not save Jira connection.'))
  }
}

export async function cancelJiraConnectionSelection(
  state: string,
  organizationId: string,
): Promise<void> {
  const result = await callJiraFunction({
    body: {action: 'cancel_selection', organization_id: organizationId, state},
    method: 'POST',
    name: 'jira-oauth',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Could not cancel Jira connection.'))
  }
}

export async function syncProjectJiraStats(input: {
  connectionSourceId?: string | null
  from?: string | null
  projectId: string
  to?: string | null
}): Promise<JiraSyncResult> {
  const result = await callJiraFunction({
    body: {
      connection_source_id: input.connectionSourceId ?? null,
      from: input.from ?? null,
      project_id: input.projectId,
      to: input.to ?? null,
    },
    method: 'POST',
    name: 'jira-sync',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Could not sync Jira stats.'))
  }

  return snakeToCamel<JiraSyncResult>(result.data)
}
