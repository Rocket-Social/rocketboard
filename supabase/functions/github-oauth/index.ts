import { encryptToken } from '../_shared/github-crypto.ts'
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

const GITHUB_CLIENT_ID = Deno.env.get('GITHUB_CLIENT_ID')
const GITHUB_CLIENT_SECRET = Deno.env.get('GITHUB_CLIENT_SECRET')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://rocketboard.app'

const SaveActionSchema = z.object({
  action: z.literal('save'),
  encrypted_token: z.string().min(1),
  workspace_id: z.string().uuid().optional(),
  github_username: z.string().optional(),
  github_avatar_url: z.string().optional(),
})

const StatusActionSchema = z.object({
  action: z.literal('status'),
  workspace_id: z.string().uuid(),
})

export const GithubOauthBodySchema = z.discriminatedUnion('action', [
  SaveActionSchema,
  StatusActionSchema,
])

Deno.serve(withMonitoring('github-oauth', async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const url = new URL(req.url)

    // Initiate OAuth: redirect user to GitHub
    if (req.method === 'GET' && url.searchParams.has('initiate')) {
      return await handleInitiate(url)
    }

    // OAuth callback: exchange code for token
    if (req.method === 'GET' && url.searchParams.has('code')) {
      return await handleCallback(url)
    }

    // Save integration or check status
    if (req.method === 'POST') {
      return await handlePost(req)
    }

    return jsonResponse({ error: 'Invalid request' }, 400)
  } catch (error) {
    console.error('[github-oauth] Error:', error)
    return errorResponseForException(error, 'Internal error', 'github-oauth')
  }
}))

// ---------------------------------------------------------------------------
// Initiate OAuth
// ---------------------------------------------------------------------------

async function handleInitiate(url: URL): Promise<Response> {
  const workspaceId = url.searchParams.get('workspace_id') ?? ''
  const returnPath = url.searchParams.get('return_path') ?? ''

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return jsonResponse({ error: 'GitHub OAuth not configured' }, 500)
  }

  const payload = `${workspaceId}:${returnPath}`
  const sig = await hmacSign(GITHUB_CLIENT_SECRET!, payload)
  const state = `${base64url(sig)}.${base64url(new TextEncoder().encode(payload))}`

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? url.origin
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${supabaseUrl}/functions/v1/github-oauth`,
    scope: 'repo read:user read:org',
    state,
  })

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, 'Location': `https://github.com/login/oauth/authorize?${params}` },
  })
}

// ---------------------------------------------------------------------------
// OAuth Callback
// ---------------------------------------------------------------------------

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const error = url.searchParams.get('error')

  if (error) {
    return redirectToFrontend({ error: url.searchParams.get('error_description') ?? error })
  }

  if (!code) {
    return redirectToFrontend({ error: 'Missing authorization code' })
  }

  let workspaceId = ''
  let returnPath = ''
  try {
    const dotIndex = state.indexOf('.')
    if (dotIndex < 0) {
      return redirectToFrontend({ error: 'Invalid OAuth state' })
    }
    const sigBytes = base64urlDecode(state.slice(0, dotIndex))
    const payloadBytes = base64urlDecode(state.slice(dotIndex + 1))
    const payload = new TextDecoder().decode(payloadBytes)
    if (!await hmacVerify(GITHUB_CLIENT_SECRET!, payload, sigBytes)) {
      return redirectToFrontend({ error: 'Invalid OAuth state' })
    }
    const colonIndex = payload.indexOf(':')
    workspaceId = colonIndex >= 0 ? payload.slice(0, colonIndex) : payload
    returnPath = colonIndex >= 0 ? payload.slice(colonIndex + 1) : ''
  } catch {
    return redirectToFrontend({ error: 'Invalid OAuth state' })
  }

  // Exchange code for token
  const tokenData = await exchangeCodeForToken(code)
  if (!tokenData) {
    return redirectToFrontend({ error: 'Failed to exchange code for token' })
  }

  // Get GitHub user info
  const githubUser = await fetchGitHubUser(tokenData.access_token)
  if (!githubUser) {
    return redirectToFrontend({ error: 'Failed to get GitHub user info' })
  }

  // Encrypt the token
  const encryptedToken = await encryptToken(tokenData.access_token)

  return redirectToFrontend({
    success: 'true',
    github_username: githubUser.login,
    github_user_id: String(githubUser.id),
    github_avatar_url: githubUser.avatar_url ?? '',
    encrypted_token: encryptedToken,
    workspace_id: workspaceId,
    return_path: returnPath,
  })
}

// ---------------------------------------------------------------------------
// POST handlers (save integration, check status)
// ---------------------------------------------------------------------------

async function handlePost(req: Request): Promise<Response> {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return jsonResponse({ error: 'Unauthorized', detail: 'missing or invalid auth header' }, 401)
    }

    const supabase = createServiceClient()
    const body = await parseJsonBody(req, GithubOauthBodySchema)
    console.log('[github-oauth] POST action:', body.action, 'workspace_id:', body.workspace_id)

    if (body.action === 'save') {
      return await handleSave(supabase, user.id, body)
    }

    return await handleStatus(supabase, user.id, body.workspace_id)
  } catch (err) {
    console.error('[github-oauth] POST handler error:', err)
    return errorResponseForException(err, 'Internal error', 'github-oauth')
  }
}

async function handleSave(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  body: z.infer<typeof SaveActionSchema>,
): Promise<Response> {
  let workspaceId = body.workspace_id?.trim() ?? ''
  const encryptedToken = body.encrypted_token

  // If workspace_id is missing, look up the user's first workspace
  if (!workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    workspaceId = membership?.workspace_id ?? ''
    console.log('[github-oauth] workspace_id fallback:', workspaceId ? 'found' : 'not found')
  }

  if (!workspaceId) {
    return jsonResponse({ error: 'No workspace found for user' }, 400)
  }

  // Tenant gate: the caller must be able to manage this workspace before we
  // upsert a github_installations row keyed by workspace_id. Without this,
  // any authed user could overwrite another workspace's oauth integration
  // by supplying its workspace_id in the request body.
  const { data: canManage, error: canManageError } = await supabase.rpc('can_manage_workspace', {
    target_workspace_id: workspaceId,
    target_user_id: userId,
  })
  if (canManageError) {
    console.error('[github-oauth] can_manage_workspace RPC failed:', canManageError)
    return jsonResponse({ error: 'Internal error' }, 500)
  }
  if (canManage !== true) {
    return jsonResponse({ error: 'Forbidden', message: 'Only workspace admins can save a GitHub integration.' }, 403)
  }

  console.log('[github-oauth] saving integration for workspace:', workspaceId, 'user:', userId)

  const { error: upsertError } = await supabase
    .from('github_installations')
    .upsert({
      workspace_id: workspaceId,
      installation_id: 0,
      account_login: body.github_username || 'unknown',
      account_type: 'User',
      account_avatar_url: body.github_avatar_url ?? null,
      permissions: { oauth_token_encrypted: encryptedToken },
      installed_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,installation_id' })

  if (upsertError) {
    console.error('[github-oauth] Save error:', JSON.stringify(upsertError))
    return jsonResponse({
      error: 'Failed to save integration',
      detail: upsertError.message ?? upsertError.code ?? 'unknown',
    }, 500)
  }

  return jsonResponse({
    success: true,
    github_username: body.github_username,
  })
}

async function handleStatus(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  workspaceId: string,
): Promise<Response> {
  if (!workspaceId) {
    return jsonResponse({ error: 'workspace_id required' }, 400)
  }

  const { data: canAccess, error: canAccessError } = await supabase.rpc('can_access_workspace', {
    target_workspace_id: workspaceId,
    target_user_id: userId,
  })
  if (canAccessError) {
    console.error('[github-oauth] can_access_workspace RPC failed:', canAccessError)
    return jsonResponse({ error: 'Internal error' }, 500)
  }
  if (canAccess !== true) {
    return jsonResponse({ connected: false, installation: null })
  }

  const { data: installation } = await supabase
    .from('github_installations')
    .select('id, account_login, account_type, account_avatar_url, created_at')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle()

  return jsonResponse({
    connected: !!installation,
    installation: installation ?? null,
  })
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

async function exchangeCodeForToken(code: string): Promise<{ access_token: string } | null> {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    console.error('[github-oauth] Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET')
    return null
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  const data = await response.json()
  if (data.error || !data.access_token) {
    console.error('[github-oauth] Token exchange failed:', data.error_description ?? data.error)
    return null
  }

  return data
}

async function fetchGitHubUser(token: string): Promise<{ id: number; login: string; avatar_url: string } | null> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Rocketboard',
    },
  })

  if (!response.ok) {
    console.error('[github-oauth] Failed to fetch user:', response.status)
    return null
  }

  return response.json()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redirectToFrontend(params: Record<string, string>): Response {
  const searchParams = new URLSearchParams(params)
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, 'Location': `${APP_URL}/integrations/github/callback?${searchParams}` },
  })
}

function base64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - str.length % 4) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return new Uint8Array(sig)
}

async function hmacVerify(secret: string, data: string, signature: Uint8Array): Promise<boolean> {
  const expected = await hmacSign(secret, data)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ signature[i]
  return diff === 0
}

