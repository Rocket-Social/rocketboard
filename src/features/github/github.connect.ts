import {callEdgeFunction, EdgeFunctionError} from '../../platform/edge/edge-client'
import {getSupabaseBrowserClient} from '../../platform/supabase/client'

type SavedSourcePayload = {
  account_login: string
  auth_type: 'pat' | 'github_app'
  id: string
  scope_type: 'organization' | 'personal'
}

export type GitHubAppSetupStatus = {
  can_manage: boolean
  config: {
    installable: boolean
    invalid_secrets?: string[]
    missing_secrets: string[]
    present_secrets: string[]
  }
  connected: boolean
  derived: {
    callback_url: string
    homepage_url: string
    setup_url: string
    webhook_url: string
  }
  installation: null | {
    account_avatar_url: string | null
    account_login: string
    account_type: string
    created_at: string
    id: string
    installation_id: number
    updated_at: string
  }
  requirements: {
    events: string[]
    permissions: string[]
  }
}

type ValidateResult =
  | {
      success: true
      source: SavedSourcePayload
      scopes: string[]
      user: {avatar_url: string | null; login: string}
    }
  | {
      success: false
      error: string
      message: string
      missing?: string[]
    }

type GitHubFunctionName = 'github-install' | 'github-repos' | 'github-validate-token'

function isOrgAdminError(message: string) {
  return message.includes('Only org admins can')
    || message.includes('Only organization admins can')
}

async function getSignedInEmail() {
  const supabase = getSupabaseBrowserClient()
  const {data: {user}} = await supabase.auth.getUser()
  return user?.email ?? null
}

async function buildOrgAdminErrorMessage(message: string) {
  const email = await getSignedInEmail()
  if (!email) {
    return message
  }

  return `${message} Signed in as ${email}. If this should be your org admin account, refresh the page or sign out and back in with Google, then retry.`
}

type GitHubFunctionResult = {
  data: unknown
  response: {ok: boolean; status: number}
}

async function callGitHubFunction(input: {
  body?: Record<string, unknown>
  method?: 'GET' | 'POST'
  name: GitHubFunctionName
  searchParams?: URLSearchParams
}): Promise<GitHubFunctionResult> {
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

async function requestGitHubAppInstall(input: {
  method: 'GET' | 'POST'
  organizationId: string
  returnPath: string
}) {
  if (input.method === 'GET') {
    const searchParams = new URLSearchParams()
    searchParams.set('initiate', 'true')
    searchParams.set('organization_id', input.organizationId)
    searchParams.set('return_path', input.returnPath)

    return callGitHubFunction({
      method: 'GET',
      name: 'github-install',
      searchParams,
    })
  }

  return callGitHubFunction({
    body: {
      action: 'initiate',
      organization_id: input.organizationId,
      return_path: input.returnPath,
    },
    method: 'POST',
    name: 'github-install',
  })
}

function extractErrorMessage(result: GitHubFunctionResult, fallback: string) {
  if (result.data && typeof result.data === 'object') {
    const obj = result.data as {error?: string; message?: string}
    return obj.message ?? obj.error ?? fallback
  }
  return fallback
}

export async function validateAndSaveGitHubToken(input: {
  organizationId?: string
  scopeType: 'organization' | 'personal'
  token: string
}): Promise<ValidateResult> {
  let result: GitHubFunctionResult

  try {
    result = await callGitHubFunction({
      body: {
        organization_id: input.organizationId ?? null,
        scope_type: input.scopeType,
        token: input.token,
      },
      method: 'POST',
      name: 'github-validate-token',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Not authenticated') {
      return {success: false, error: 'not_logged_in', message: 'Not logged in. Please log in and try again.'}
    }

    throw error
  }

  if (!result.response.ok) {
    const message = extractErrorMessage(result, 'Failed to validate token')
    const data = result.data as {error?: string; missing?: string[]} | null
    return {
      success: false,
      error: data?.error ?? 'unknown',
      message: result.response.status === 403 && isOrgAdminError(message)
        ? await buildOrgAdminErrorMessage(message)
        : message,
      missing: data?.missing,
    }
  }

  return {
    success: true,
    source: (result.data as {source: SavedSourcePayload}).source,
    scopes: (result.data as {scopes: string[]}).scopes ?? [],
    user: (result.data as {user: {avatar_url: string | null; login: string}}).user,
  }
}

export async function disconnectGitHub(sourceId: string): Promise<void> {
  const result = await callGitHubFunction({
    body: {action: 'disconnect', source_id: sourceId},
    method: 'POST',
    name: 'github-validate-token',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Failed to disconnect GitHub source'))
  }
}

export async function initiateGitHubAppInstall(organizationId: string, returnPath?: string) {
  const normalizedReturnPath = returnPath ?? window.location.pathname

  const primaryAttempt = await requestGitHubAppInstall({
    method: 'POST',
    organizationId,
    returnPath: normalizedReturnPath,
  })

  if (primaryAttempt.response.ok && typeof (primaryAttempt.data as {install_url?: string}).install_url === 'string') {
    window.location.href = (primaryAttempt.data as {install_url: string}).install_url
    return
  }

  const legacyAttempt = await requestGitHubAppInstall({
    method: 'GET',
    organizationId,
    returnPath: normalizedReturnPath,
  })

  if (legacyAttempt.response.ok && typeof (legacyAttempt.data as {install_url?: string}).install_url === 'string') {
    window.location.href = (legacyAttempt.data as {install_url: string}).install_url
    return
  }

  const primaryMessage = extractErrorMessage(primaryAttempt, 'Failed to initiate GitHub App install')
  const legacyMessage = extractErrorMessage(legacyAttempt, 'Failed to initiate GitHub App install')
  const message = primaryMessage !== 'Failed to initiate GitHub App install' ? primaryMessage : legacyMessage

  if (
    (primaryAttempt.response.status === 403 && isOrgAdminError(primaryMessage))
    || (legacyAttempt.response.status === 403 && isOrgAdminError(legacyMessage))
  ) {
    throw new Error(await buildOrgAdminErrorMessage(message))
  }

  throw new Error(message)
}

export async function getGitHubAppSetupStatus(organizationId: string): Promise<GitHubAppSetupStatus> {
  const result = await callGitHubFunction({
    body: {action: 'status', organization_id: organizationId},
    method: 'POST',
    name: 'github-install',
  })

  if (!result.response.ok) {
    const message = extractErrorMessage(result, 'Failed to load GitHub App setup status')
    if (result.response.status === 403 && isOrgAdminError(message)) {
      throw new Error(await buildOrgAdminErrorMessage(message))
    }

    throw new Error(message)
  }

  return result.data as GitHubAppSetupStatus
}

export async function completeGitHubAppInstall(state: string, installationId: number) {
  const result = await callGitHubFunction({
    body: {action: 'complete', installation_id: installationId, state},
    method: 'POST',
    name: 'github-install',
  })

  if (!result.response.ok) {
    const message = extractErrorMessage(result, 'Failed to complete GitHub App install')
    if (result.response.status === 403 && isOrgAdminError(message)) {
      throw new Error(await buildOrgAdminErrorMessage(message))
    }

    throw new Error(message)
  }

  return result.data as {
    return_path?: string
    source?: {id: string}
    success: true
  }
}

export type GitHubRepoInventoryItem = {
  default_branch: string
  description: string | null
  full_name: string
  id: number
  is_allowed?: boolean
  language: string | null
  name: string
  private: boolean
  pushed_at?: string | null
}

export async function listAvailableGitHubRepos(input: {
  connectionSourceId: string
  mode?: 'manage' | 'project'
  projectId?: string
}) {
  const result = await callGitHubFunction({
    body: {
      connection_source_id: input.connectionSourceId,
      mode: input.mode ?? 'project',
      project_id: input.projectId ?? null,
    },
    method: 'POST',
    name: 'github-repos',
  })

  if (!result.response.ok) {
    throw new Error(extractErrorMessage(result, 'Failed to fetch repositories'))
  }

  return ((result.data as {repos?: GitHubRepoInventoryItem[]}).repos ?? []) as GitHubRepoInventoryItem[]
}
