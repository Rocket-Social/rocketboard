import {
  buildGitHubAppStatusPayload,
  getGitHubAppConfigStatus,
} from '../_shared/github-app-setup.ts'
import {
  completeGitHubAppInstallAction,
  fetchInstallationDetailsFromGitHub,
} from './complete.ts'
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const GITHUB_APP_SLUG = Deno.env.get('GITHUB_APP_SLUG')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://rocketboard.app'
const GITHUB_APP_ID = Deno.env.get('GITHUB_APP_ID')
const GITHUB_APP_PRIVATE_KEY = Deno.env.get('GITHUB_APP_PRIVATE_KEY')
const GITHUB_WEBHOOK_SECRET = Deno.env.get('GITHUB_WEBHOOK_SECRET')

const InitiateActionSchema = z.object({
  action: z.literal('initiate'),
  organization_id: z.string().uuid().nullish(),
  return_path: z.string().nullish(),
  workspace_id: z.string().uuid().nullish(),
})

const CompleteActionSchema = z.object({
  action: z.literal('complete'),
  installation_id: z.union([z.string(), z.number()]),
  state: z.string().min(1),
})

const StatusActionSchema = z.object({
  action: z.literal('status'),
  organization_id: z.string().uuid().nullish(),
  workspace_id: z.string().uuid().nullish(),
})

export const GithubInstallBodySchema = z.discriminatedUnion('action', [
  InitiateActionSchema,
  CompleteActionSchema,
  StatusActionSchema,
])

Deno.serve(withMonitoring('github-install', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const supabase = createServiceClient()
  const url = new URL(req.url)

  if (req.method === 'GET' && url.searchParams.has('initiate')) {
    return await handleInitiateRequest({
      organizationId: url.searchParams.get('organization_id'),
      returnPath: url.searchParams.get('return_path'),
      supabase,
      user: await getAuthenticatedUser(req),
      workspaceId: url.searchParams.get('workspace_id'),
    })
  }

  if (req.method === 'GET' && url.searchParams.has('setup_action')) {
    const installationId = url.searchParams.get('installation_id')
    const state = url.searchParams.get('state') ?? ''

    if (!installationId || !state) {
      return redirectToFrontend({ error: 'Missing GitHub installation callback parameters.' })
    }

    return redirectToFrontend({
      installation_id: installationId,
      mode: 'github_app',
      state,
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: z.infer<typeof GithubInstallBodySchema>
  try {
    body = await parseJsonBody(req, GithubInstallBodySchema)
  } catch (err) {
    return errorResponseForException(err, 'Invalid request', 'github-install')
  }

  if (body.action === 'initiate') {
    return await handleInitiateRequest({
      organizationId: body.organization_id,
      returnPath: body.return_path,
      supabase,
      user,
      workspaceId: body.workspace_id,
    })
  }

  if (body.action === 'complete') {
    const installationId = Number(body.installation_id ?? 0)
    const state = body.state

    if (!state || !Number.isFinite(installationId) || installationId <= 0) {
      return jsonResponse({ error: 'state and installation_id required' }, 400)
    }

    const completion = await completeGitHubAppInstallAction({
      installationId,
      state,
      userId: user.id,
    }, {
      canManageOrganization: (organizationId, currentUserId) =>
        canManageOrganization(supabase, organizationId, currentUserId),
      fetchInstallState: async (targetState) => {
        // Do NOT filter on `used_at IS NULL` here — completeGitHubAppInstallAction
        // needs to see already-finalized states so it can return an idempotent
        // success on callback retries instead of a hard invalid_state failure.
        const { data: installState } = await supabase
          .from('github_connection_install_states')
          .select('*')
          .eq('state', targetState)
          .maybeSingle()

        return installState ?? null
      },
      fetchInstallationDetails,
      markInstallStateUsed: async (targetState, usedAt) => {
        const {data: updatedInstallState, error} = await supabase
          .from('github_connection_install_states')
          .update({ used_at: usedAt })
          .eq('state', targetState)
          .is('used_at', null)
          .select('state')
          .maybeSingle()

        if (error) {
          console.error('[github-install] Failed to mark install state used:', error)
          return 'error'
        }

        if (!updatedInstallState) {
          // Another concurrent callback already finalized the state. The install
          // source was still persisted (idempotent on installation_id) so this
          // is not a user-visible failure.
          console.warn('[github-install] install state already finalized by a concurrent request')
          return 'already_used'
        }

        return 'marked'
      },
      persistSource: async (payload) => {
        // github_connection_sources has two partial unique indexes that can fire
        // during github_app installs into an org:
        //   1. (installation_id) WHERE installation_id > 0
        //   2. (organization_id, auth_type, account_login) WHERE organization_id is not null
        // Postgres cannot infer either partial index from a bare ON CONFLICT
        // target, and supabase-js upsert does not emit the matching WHERE clause.
        // So we insert first and fall back to update on unique_violation (23505).
        //
        // Three real scenarios reach this fallback:
        //   a) Duplicate-callback race: two callers insert the same installation_id.
        //      Second hit fires index (1). Update by installation_id locates the
        //      winning row and overwrites with the same payload (no-op in content).
        //   b) GitHub account rename: existing row's installation_id is unchanged,
        //      but account_login differs. Insert with the new account_login fires
        //      index (1) on installation_id. Update by installation_id finds the
        //      row with the old account_login and rewrites it with the new payload.
        //   c) Re-install with a new installation_id: same org/account, different
        //      installation_id. Insert fires index (2) on the account tuple.
        //      Update by installation_id matches nothing; fall through to update
        //      by (organization_id, auth_type, account_login), which locates the
        //      stale row and overwrites its installation_id + permissions.
        //
        // Try update-by-installation_id first (covers a + b), then update-by-
        // account-tuple (covers c). At least one must match or we fail hard so
        // an unexpected 23505 source cannot silently leave the org pointing at
        // stale data.
        //
        // created_at is left out of the payload so the column default fires on
        // fresh inserts and is preserved on both update paths.
        const { error: insertError } = await supabase
          .from('github_connection_sources')
          .insert(payload)

        if (!insertError) {
          return true
        }

        if (insertError.code !== '23505') {
          console.error('[github-install] Failed to insert source:', insertError)
          return false
        }

        const byInstallation = await supabase
          .from('github_connection_sources')
          .update(payload)
          .eq('installation_id', payload.installation_id)
          .select('id')
          .maybeSingle()

        if (byInstallation.error) {
          console.error('[github-install] Failed to update source by installation_id:', byInstallation.error)
          return false
        }

        if (byInstallation.data) {
          return true
        }

        const byAccount = await supabase
          .from('github_connection_sources')
          .update(payload)
          .eq('organization_id', payload.organization_id)
          .eq('auth_type', payload.auth_type)
          .eq('account_login', payload.account_login)
          .select('id')
          .maybeSingle()

        if (byAccount.error) {
          console.error('[github-install] Failed to update source by account tuple:', byAccount.error)
          return false
        }

        if (!byAccount.data) {
          // 23505 came from an index we did not expect to hit, or the row
          // disappeared between insert and update. Fail hard.
          console.error('[github-install] Unique violation with no matching row to update:', insertError)
          return false
        }

        return true
      },
    })

    return jsonResponse(completion.body, completion.status)
  }

  if (body.action === 'status') {
    const organizationId = await resolveOrganizationId(
      supabase,
      body.organization_id,
      body.workspace_id,
    )

    if (!organizationId) {
      return jsonResponse({ error: 'organization_id required' }, 400)
    }

    if (!(await canManageOrganization(supabase, organizationId, user.id))) {
      return jsonResponse({ error: 'Forbidden', message: 'Only org admins can view the GitHub App status.' }, 403)
    }

    const { data: source } = await supabase
      .from('github_connection_sources')
      .select('id, installation_id, account_login, account_type, account_avatar_url, created_at, updated_at')
      .eq('organization_id', organizationId)
      .eq('auth_type', 'github_app')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return jsonResponse(await buildGitHubAppStatusPayload({
      env: {
        appUrl: APP_URL,
        githubAppId: GITHUB_APP_ID,
        githubAppPrivateKey: GITHUB_APP_PRIVATE_KEY,
        githubAppSlug: GITHUB_APP_SLUG,
        githubWebhookSecret: GITHUB_WEBHOOK_SECRET,
        supabaseUrl: SUPABASE_URL,
      },
      installation: source ?? null,
    }))
  }

  return jsonResponse({ error: 'Invalid request' }, 400)
}))

async function handleInitiateRequest(input: {
  organizationId: string | null | undefined
  returnPath: string | null | undefined
  supabase: ReturnType<typeof createServiceClient>
  user: {id: string} | null
  workspaceId: string | null | undefined
}) {
  const organizationId = await resolveOrganizationId(
    input.supabase,
    input.organizationId,
    input.workspaceId,
  )

  if (!organizationId) {
    return jsonResponse({ error: 'organization_id required' }, 400)
  }

  if (!input.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  if (!(await canManageOrganization(input.supabase, organizationId, input.user.id))) {
    return jsonResponse({ error: 'Forbidden', message: 'Only org admins can install the GitHub App.' }, 403)
  }

  const configStatus = await getGitHubAppConfigStatus({
    appUrl: APP_URL,
    githubAppId: GITHUB_APP_ID,
    githubAppPrivateKey: GITHUB_APP_PRIVATE_KEY,
    githubAppSlug: GITHUB_APP_SLUG,
    githubWebhookSecret: GITHUB_WEBHOOK_SECRET,
    supabaseUrl: SUPABASE_URL,
  })
  if (!configStatus.installable) {
    const missingOrInvalidSecrets = Array.from(new Set([
      ...configStatus.missing_secrets,
      ...configStatus.invalid_secrets,
    ]))

    return jsonResponse({
      error: configStatus.invalid_secrets.length > 0 ? 'github_app_key_invalid' : 'github_app_not_configured',
      message: `GitHub App install is not configured. Missing or invalid Supabase secrets: ${missingOrInvalidSecrets.join(', ')}.`,
      invalid_secrets: configStatus.invalid_secrets,
      missing_secrets: configStatus.missing_secrets,
      present_secrets: configStatus.present_secrets,
    }, 500)
  }

  const state = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + (30 * 60 * 1000)).toISOString()
  const returnPath = normalizeReturnPath(input.returnPath)
  const { error } = await input.supabase
    .from('github_connection_install_states')
    .insert({
      expires_at: expiresAt,
      organization_id: organizationId,
      requested_by: input.user.id,
      return_path: returnPath,
      state,
    })

  if (error) {
    console.error('[github-install] Failed to create install state:', error)
    return jsonResponse({ error: 'install_state_failed', message: 'Could not start GitHub App install.' }, 500)
  }

  return jsonResponse({
    install_url: `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`,
    success: true,
  })
}

async function canManageOrganization(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: string,
  userId: string,
) {
  const { data, error } = await supabase.rpc('can_manage_organization', {
    target_org_id: organizationId,
    target_user_id: userId,
  })

  if (error) {
    console.error('[github-install] Failed to resolve org admin access:', error)
    return false
  }

  return data === true
}

async function resolveOrganizationId(
  supabase: ReturnType<typeof createServiceClient>,
  organizationId: unknown,
  workspaceId: unknown,
) {
  const normalizedOrganizationId = typeof organizationId === 'string' ? organizationId.trim() : ''
  if (normalizedOrganizationId) {
    return normalizedOrganizationId
  }

  const normalizedWorkspaceId = typeof workspaceId === 'string' ? workspaceId.trim() : ''
  if (!normalizedWorkspaceId) {
    return null
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('organization_id')
    .eq('id', normalizedWorkspaceId)
    .maybeSingle()

  return typeof workspace?.organization_id === 'string' ? workspace.organization_id : null
}

function normalizeReturnPath(returnPath: string | null | undefined) {
  if (!returnPath) {
    return '/'
  }

  return returnPath.startsWith('/') ? returnPath : '/'
}

async function fetchInstallationDetails(installationId: number) {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    console.error('[github-install] Missing GitHub App credentials for installation lookup')
    return {
      error: 'github_app_not_configured' as const,
      message: 'Could not fetch installation details from GitHub.',
      ok: false as const,
    }
  }

  return fetchInstallationDetailsFromGitHub({
    appId: GITHUB_APP_ID,
    installationId,
    privateKey: GITHUB_APP_PRIVATE_KEY,
  })
}

function redirectToFrontend(params: Record<string, string>): Response {
  const searchParams = new URLSearchParams(params)
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, 'Location': `${APP_URL}/integrations/github/callback?${searchParams}` },
  })
}

