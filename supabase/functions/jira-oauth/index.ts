import {encryptToken} from '../_shared/github-crypto.ts'
import {
  corsHeaders,
  createServiceClient,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'
import {
  type AtlassianAccessibleResource,
  normalizeSiteUrl,
} from './resource.ts'
import {
  buildPendingJiraSiteSelection,
  parseJiraSiteChoices,
  resolveJiraCallbackResourceDecision,
} from './callback.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://rocketboard.app'
const ATLASSIAN_CLIENT_ID = Deno.env.get('ATLASSIAN_CLIENT_ID')
const ATLASSIAN_CLIENT_SECRET = Deno.env.get('ATLASSIAN_CLIENT_SECRET')
const ATLASSIAN_SCOPES = ['read:jira-work', 'read:jira-user', 'read:me', 'offline_access']

const InitiateActionSchema = z.object({
  action: z.literal('initiate'),
  organization_id: z.string().uuid(),
  return_path: z.string().nullish(),
})

const StatusActionSchema = z.object({
  action: z.literal('status'),
  organization_id: z.string().uuid(),
})

const DisconnectActionSchema = z.object({
  action: z.literal('disconnect'),
  source_id: z.string().uuid(),
})

const PendingSitesActionSchema = z.object({
  action: z.literal('pending_sites'),
  organization_id: z.string().uuid(),
  state: z.string().uuid(),
})

const CompleteSelectionActionSchema = z.object({
  action: z.literal('complete_selection'),
  cloud_id: z.string().min(1),
  organization_id: z.string().uuid(),
  state: z.string().uuid(),
})

const CancelSelectionActionSchema = z.object({
  action: z.literal('cancel_selection'),
  organization_id: z.string().uuid(),
  state: z.string().uuid(),
})

export const JiraOauthBodySchema = z.discriminatedUnion('action', [
  CancelSelectionActionSchema,
  CompleteSelectionActionSchema,
  InitiateActionSchema,
  PendingSitesActionSchema,
  StatusActionSchema,
  DisconnectActionSchema,
])

type PendingSiteSelection = {
  account_email: string | null
  account_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  expires_at: string
  organization_id: string
  requested_by: string
  resources: unknown
  scopes: string[]
  state: string
  token_expires_at: string
}

type CompletedSiteSelection = {
  cloud_id: string
  site_name: string
  site_url: string
  source_id: string
}

Deno.serve(withMonitoring('jira-oauth', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const supabase = createServiceClient()
  const url = new URL(req.url)

  if (req.method === 'GET' && url.searchParams.has('code')) {
    return handleCallback({
      code: url.searchParams.get('code') ?? '',
      state: url.searchParams.get('state') ?? '',
      supabase,
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse({error: 'Method not allowed'}, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return jsonResponse({error: 'Unauthorized'}, 401)
  }

  let body: z.infer<typeof JiraOauthBodySchema>
  try {
    body = await parseJsonBody(req, JiraOauthBodySchema)
  } catch (error) {
    return errorResponseForException(error, 'Invalid request', 'jira-oauth')
  }

  if (body.action === 'status') {
    if (!(await canAccessOrganization(supabase, body.organization_id, user.id))) {
      return jsonResponse({error: 'Forbidden', message: 'You do not have access to this organization.'}, 403)
    }

    await deleteExpiredSiteSelections(supabase, body.organization_id)

    const {data: sources, error} = await supabase
      .from('jira_connection_sources')
      .select('id, cloud_id, site_url, site_name, account_id, account_email, status, scopes, last_synced_at, created_at, updated_at')
      .eq('organization_id', body.organization_id)
      .order('updated_at', {ascending: false})

    if (error) {
      console.error('[jira-oauth] Failed to load Jira sources:', error)
      return jsonResponse({error: 'status_failed', message: 'Could not load Jira connection status.'}, 500)
    }

    return jsonResponse({
      can_manage: await canManageOrganization(supabase, body.organization_id, user.id),
      config: getConfigStatus(),
      sources: sources ?? [],
    })
  }

  if (body.action === 'pending_sites') {
    if (!(await canManageOrganization(supabase, body.organization_id, user.id))) {
      return jsonResponse({error: 'Forbidden', message: 'Only org admins can finish Jira connections.'}, 403)
    }

    const selection = await loadPendingSiteSelection(supabase, body.state, body.organization_id)
    if (!selection) {
      return jsonResponse({error: 'not_found', message: 'Jira site selection expired. Start the connection again.'}, 404)
    }

    if (selection.requested_by !== user.id) {
      return jsonResponse({error: 'Forbidden', message: 'This Jira site selection belongs to another user.'}, 403)
    }

    return jsonResponse({
      organization_id: selection.organization_id,
      sites: parseJiraSiteChoices(selection.resources),
    })
  }

  if (body.action === 'complete_selection') {
    const completion = await completePendingSiteSelection(supabase, {
      cloudId: body.cloud_id,
      organizationId: body.organization_id,
      requestedBy: user.id,
      state: body.state,
    })

    if (completion.forbidden) {
      return jsonResponse({error: 'Forbidden', message: 'Only org admins can finish Jira connections.'}, 403)
    }

    if (completion.error) {
      console.error('[jira-oauth] Failed to complete Jira site selection:', completion.error)
      return jsonResponse({error: 'save_failed', message: 'Could not save Jira connection.'}, 500)
    }

    if (!completion.source) {
      return jsonResponse({error: 'not_found', message: 'Selected Jira site is not available for this connection.'}, 404)
    }

    return jsonResponse({source: completion.source, success: true})
  }

  if (body.action === 'cancel_selection') {
    const cancellation = await cancelPendingSiteSelection(supabase, {
      organizationId: body.organization_id,
      requestedBy: user.id,
      state: body.state,
    })
    if (cancellation.forbidden) {
      return jsonResponse({error: 'Forbidden', message: 'Only org admins can cancel Jira connections.'}, 403)
    }

    if (cancellation.error) {
      console.error('[jira-oauth] Failed to cancel Jira site selection:', cancellation.error)
      return jsonResponse({error: 'cancel_failed', message: 'Could not cancel Jira connection.'}, 500)
    }

    if (!cancellation.cancelled) {
      return jsonResponse({error: 'not_found', message: 'Jira site selection expired. Start the connection again.'}, 404)
    }

    return jsonResponse({success: true})
  }

  if (body.action === 'initiate') {
    if (!(await canManageOrganization(supabase, body.organization_id, user.id))) {
      return jsonResponse({error: 'Forbidden', message: 'Only org admins can connect Jira.'}, 403)
    }

    const config = getConfigStatus()
    if (!config.configured) {
      return jsonResponse({
        error: 'jira_oauth_not_configured',
        message: `Atlassian OAuth is not configured. Missing Supabase secrets: ${config.missing_secrets.join(', ')}.`,
        missing_secrets: config.missing_secrets,
      }, 500)
    }

    const state = crypto.randomUUID()
    const {error} = await supabase
      .from('jira_oauth_states')
      .insert({
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        organization_id: body.organization_id,
        requested_by: user.id,
        return_path: normalizeReturnPath(body.return_path),
        state,
      })

    if (error) {
      console.error('[jira-oauth] Failed to create OAuth state:', error)
      return jsonResponse({error: 'state_failed', message: 'Could not start Jira connection.'}, 500)
    }

    const authorizeUrl = new URL('https://auth.atlassian.com/authorize')
    authorizeUrl.searchParams.set('audience', 'api.atlassian.com')
    authorizeUrl.searchParams.set('client_id', ATLASSIAN_CLIENT_ID!)
    authorizeUrl.searchParams.set('scope', ATLASSIAN_SCOPES.join(' '))
    authorizeUrl.searchParams.set('redirect_uri', getRedirectUri())
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('prompt', 'consent')

    return jsonResponse({auth_url: authorizeUrl.toString(), success: true})
  }

  if (body.action === 'disconnect') {
    const {data: source} = await supabase
      .from('jira_connection_sources')
      .select('id, organization_id')
      .eq('id', body.source_id)
      .maybeSingle()

    if (!source) {
      return jsonResponse({error: 'not_found', message: 'Jira source not found.'}, 404)
    }

    if (!(await canManageOrganization(supabase, String(source.organization_id), user.id))) {
      return jsonResponse({error: 'Forbidden', message: 'Only org admins can disconnect Jira.'}, 403)
    }

    const {error} = await supabase
      .from('jira_connection_sources')
      .delete()
      .eq('id', body.source_id)

    if (error) {
      console.error('[jira-oauth] Failed to disconnect Jira source:', error)
      return jsonResponse({error: 'disconnect_failed', message: 'Could not disconnect Jira.'}, 500)
    }

    return jsonResponse({success: true})
  }

  return jsonResponse({error: 'Invalid request'}, 400)
}))

async function handleCallback(input: {
  code: string
  state: string
  supabase: ReturnType<typeof createServiceClient>
}) {
  if (!input.code || !input.state) {
    return redirectToFrontend('/', {jira_status: 'error', message: 'Missing Jira OAuth callback parameters.'})
  }

  const {data: oauthState, error: stateError} = await input.supabase
    .from('jira_oauth_states')
    .select('*')
    .eq('state', input.state)
    .maybeSingle()

  if (stateError || !oauthState) {
    console.error('[jira-oauth] Invalid OAuth state:', stateError)
    return redirectToFrontend('/', {jira_status: 'error', message: 'Invalid Jira connection state.'})
  }

  const returnPath = normalizeReturnPath(String(oauthState.return_path ?? '/'))
  if (oauthState.used_at || new Date(String(oauthState.expires_at)).getTime() < Date.now()) {
    return redirectToFrontend(returnPath, {jira_status: 'error', message: 'Jira connection session expired. Try again.'})
  }

  const config = getConfigStatus()
  if (!config.configured) {
    return redirectToFrontend(returnPath, {jira_status: 'error', message: 'Atlassian OAuth is not configured.'})
  }

  try {
    const token = await exchangeCode(input.code)
    const [resources, profile] = await Promise.all([
      fetchAccessibleResources(token.access_token),
      fetchAtlassianProfile(token.access_token),
    ])
    const decision = resolveJiraCallbackResourceDecision(resources)

    if (decision.status === 'error') {
      console.warn('[jira-oauth] No Jira resource with required scope returned', {
        summary: decision.summary,
      })
      return redirectToFrontend(returnPath, {jira_status: 'error', message: 'No Jira site with the required scope was returned.'})
    }

    const encryptedAccessToken = await encryptToken(token.access_token)
    const encryptedRefreshToken = await encryptToken(token.refresh_token)
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()
    const scopes = token.scope.split(/\s+/).filter(Boolean)

    if (decision.status === 'select_site') {
      const {error: selectionError} = await input.supabase
        .from('jira_oauth_site_selections')
        .upsert(buildPendingJiraSiteSelection({
          accountEmail: profile.email ?? null,
          accountId: profile.account_id ?? String(oauthState.requested_by),
          encryptedAccessToken,
          encryptedRefreshToken,
          expiresAt: String(oauthState.expires_at),
          organizationId: String(oauthState.organization_id),
          requestedBy: String(oauthState.requested_by),
          resources: decision.resources,
          scopes,
          state: input.state,
          tokenExpiresAt: expiresAt,
        }), {onConflict: 'state'})

      if (selectionError) {
        console.error('[jira-oauth] Failed to save Jira site choices:', selectionError)
        return redirectToFrontend(returnPath, {jira_status: 'error', message: 'Could not save Jira site choices.'})
      }

      await input.supabase
        .from('jira_oauth_states')
        .update({used_at: new Date().toISOString()})
        .eq('state', input.state)

      return redirectToFrontend(returnPath, {
        jira_state: input.state,
        jira_status: 'select_site',
      })
    }

    const upsertError = await saveJiraConnection(input.supabase, {
      accountEmail: profile.email ?? null,
      accountId: profile.account_id ?? String(oauthState.requested_by),
      cloudId: decision.resource.id,
      createdBy: oauthState.requested_by,
      encryptedAccessToken,
      encryptedRefreshToken,
      organizationId: oauthState.organization_id,
      scopes,
      siteName: decision.resource.name,
      siteUrl: normalizeSiteUrl(decision.resource.url),
      tokenExpiresAt: expiresAt,
    })

    if (upsertError) {
      console.error('[jira-oauth] Failed to save Jira source:', upsertError)
      return redirectToFrontend(returnPath, {jira_status: 'error', message: 'Could not save Jira connection.'})
    }

    await input.supabase
      .from('jira_oauth_states')
      .update({used_at: new Date().toISOString()})
      .eq('state', input.state)

    return redirectToFrontend(returnPath, {jira_status: 'connected'})
  } catch (error) {
    console.error('[jira-oauth] Callback failed:', error)
    return redirectToFrontend(returnPath, {jira_status: 'error', message: 'Jira connection failed.'})
  }
}

function getConfigStatus() {
  const missing = [
    ATLASSIAN_CLIENT_ID ? null : 'ATLASSIAN_CLIENT_ID',
    ATLASSIAN_CLIENT_SECRET ? null : 'ATLASSIAN_CLIENT_SECRET',
  ].filter((value): value is string => Boolean(value))

  return {
    configured: missing.length === 0,
    missing_secrets: missing,
    redirect_uri: getRedirectUri(),
    scopes: ATLASSIAN_SCOPES,
  }
}

async function exchangeCode(code: string): Promise<{
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
}> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    body: JSON.stringify({
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Atlassian token exchange failed: ${response.status}`)
  }

  return await response.json()
}

async function fetchAccessibleResources(accessToken: string): Promise<AtlassianAccessibleResource[]> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Atlassian accessible resources failed: ${response.status}`)
  }

  return await response.json()
}

async function fetchAtlassianProfile(accessToken: string): Promise<{
  account_id?: string
  email?: string
}> {
  const response = await fetch('https://api.atlassian.com/me', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) return {}
  return await response.json()
}

async function saveJiraConnection(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    accountEmail: string | null
    accountId: string
    cloudId: string
    createdBy: string
    encryptedAccessToken: string
    encryptedRefreshToken: string
    organizationId: string
    scopes: string[]
    siteName: string
    siteUrl: string
    tokenExpiresAt: string
  },
) {
  const {error} = await supabase
    .from('jira_connection_sources')
    .upsert({
      account_email: input.accountEmail,
      account_id: input.accountId,
      cloud_id: input.cloudId,
      encrypted_access_token: input.encryptedAccessToken,
      encrypted_refresh_token: input.encryptedRefreshToken,
      organization_id: input.organizationId,
      scopes: input.scopes,
      site_name: input.siteName,
      site_url: normalizeSiteUrl(input.siteUrl),
      status: 'active',
      token_expires_at: input.tokenExpiresAt,
      updated_at: new Date().toISOString(),
      created_by: input.createdBy,
    }, {onConflict: 'organization_id,cloud_id'})

  return error
}

async function loadPendingSiteSelection(
  supabase: ReturnType<typeof createServiceClient>,
  state: string,
  organizationId: string,
): Promise<PendingSiteSelection | null> {
  const {data, error} = await supabase
    .from('jira_oauth_site_selections')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('state', state)
    .maybeSingle()

  if (error) {
    console.error('[jira-oauth] Failed to load Jira site selection:', error)
    return null
  }

  const selection = data as PendingSiteSelection | null
  if (!selection) return null

  if (new Date(selection.expires_at).getTime() < Date.now()) {
    await supabase
      .from('jira_oauth_site_selections')
      .delete()
      .eq('organization_id', organizationId)
      .eq('state', state)
    return null
  }

  return selection
}

async function completePendingSiteSelection(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    cloudId: string
    organizationId: string
    requestedBy: string
    state: string
  },
): Promise<{
  error: unknown | null
  forbidden: boolean
  source: CompletedSiteSelection | null
}> {
  const {data, error} = await supabase.rpc('complete_jira_oauth_site_selection', {
    target_cloud_id: input.cloudId,
    target_organization_id: input.organizationId,
    target_requested_by: input.requestedBy,
    target_state: input.state,
  })

  if (error) {
    return {
      error,
      forbidden: isPermissionError(error),
      source: null,
    }
  }

  const source = Array.isArray(data) ? data[0] as CompletedSiteSelection | undefined : undefined
  return {
    error: null,
    forbidden: false,
    source: source ?? null,
  }
}

async function cancelPendingSiteSelection(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string
    requestedBy: string
    state: string
  },
): Promise<{
  cancelled: boolean
  error: unknown | null
  forbidden: boolean
}> {
  const {data, error} = await supabase.rpc('cancel_jira_oauth_site_selection', {
    target_organization_id: input.organizationId,
    target_requested_by: input.requestedBy,
    target_state: input.state,
  })

  if (error) {
    return {
      cancelled: false,
      error,
      forbidden: isPermissionError(error),
    }
  }

  return {
    cancelled: data === true,
    error: null,
    forbidden: false,
  }
}

async function deleteExpiredSiteSelections(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
) {
  await supabase
    .from('jira_oauth_site_selections')
    .delete()
    .eq('organization_id', organizationId)
    .lt('expires_at', new Date().toISOString())
}

function isPermissionError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as {code?: unknown}).code === '42501')
}

async function canManageOrganization(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
  userId: string,
) {
  const {data, error} = await supabase.rpc('can_manage_organization', {
    target_org_id: organizationId,
    target_user_id: userId,
  })
  if (error) {
    console.error('[jira-oauth] Failed to resolve org manage access:', error)
    return false
  }
  return data === true
}

async function canAccessOrganization(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
  userId: string,
) {
  const {data, error} = await supabase.rpc('can_access_organization', {
    target_org_id: organizationId,
    target_user_id: userId,
  })
  if (error) {
    console.error('[jira-oauth] Failed to resolve org access:', error)
    return false
  }
  return data === true
}

function getRedirectUri() {
  return `${SUPABASE_URL}/functions/v1/jira-oauth`
}

function normalizeReturnPath(returnPath: string | null | undefined) {
  if (!returnPath) return '/'
  if (!returnPath.startsWith('/')) return '/'
  if (returnPath.startsWith('//')) return '/'
  return returnPath
}

function redirectToFrontend(returnPath: string, params: Record<string, string>): Response {
  const url = new URL(`${APP_URL}${normalizeReturnPath(returnPath)}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return new Response(null, {
    headers: {...corsHeaders, Location: url.toString()},
    status: 302,
  })
}
