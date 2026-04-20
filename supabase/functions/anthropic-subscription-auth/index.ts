import {
  anthropicOauthConsoleRedirectUri,
  buildAnthropicAuthorizeUrl,
  createPkcePair,
} from '../../../src/features/ai/anthropic-auth.shared.ts'
import { exchangeAnthropicAuthorizationCode } from '../_shared/anthropic-auth.ts'
import { getAnthropicSubscriptionFeatureEnabled } from '../_shared/feature-flags.ts'
import { encryptToken } from '../_shared/github-crypto.ts'
import {
  createServiceClient,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  errorResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'

const STATE_TTL_MS = 10 * 60 * 1000

const InitiateRequestSchema = z.object({
  action: z.literal('initiate'),
  returnPath: z.string().optional(),
})

const SubmitCodeRequestSchema = z.object({
  action: z.literal('submit_code'),
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
})

export const AnthropicSubscriptionAuthBodySchema = z.discriminatedUnion('action', [
  InitiateRequestSchema,
  SubmitCodeRequestSchema,
])

type ActionRequest = z.infer<typeof AnthropicSubscriptionAuthBodySchema>

Deno.serve(withMonitoring('anthropic-subscription-auth', async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return errorResponse('Authentication required', 401)
  }

  if (!await getAnthropicSubscriptionFeatureEnabled()) {
    return errorResponse('Anthropic subscription auth is currently disabled by Rocketboard.', 403)
  }

  let body: ActionRequest
  try {
    body = await parseJsonBody(req, AnthropicSubscriptionAuthBodySchema)
  } catch (err) {
    return errorResponseForException(err, 'Invalid request', 'anthropic-subscription-auth')
  }

  if (body.action === 'initiate') {
    return handleInitiate({ userId: user.id, returnPath: body.returnPath })
  }

  return handleSubmitCode({ userId: user.id, code: body.code, state: body.state })
}))

async function handleInitiate(input: { userId: string; returnPath?: string }) {
  const supabase = createServiceClient()
  const returnPath = normalizeReturnPath(input.returnPath)
  const pkce = await createPkcePair()
  const state = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()

  const { error } = await supabase
    .from('ai_provider_oauth_states')
    .insert({
      code_verifier: pkce.verifier,
      expires_at: expiresAt,
      provider: 'anthropic',
      return_path: returnPath,
      state,
      user_id: input.userId,
    })

  if (error) {
    console.error('[anthropic-subscription-auth] Failed to persist auth state:', error)
    return errorResponse('Could not start Claude subscription connection.', 500)
  }

  return jsonResponse({
    authorizationUrl: buildAnthropicAuthorizeUrl({
      codeChallenge: pkce.challenge,
      redirectUri: anthropicOauthConsoleRedirectUri,
      state,
    }),
    state,
  })
}

async function handleSubmitCode(input: { userId: string; code: string; state: string }) {
  const { code, state } = input

  const supabase = createServiceClient()
  const { data: authState, error: authStateError } = await supabase
    .from('ai_provider_oauth_states')
    .select('id, user_id, return_path, code_verifier, expires_at, consumed_at')
    .eq('provider', 'anthropic')
    .eq('state', state)
    .maybeSingle()

  if (authStateError) {
    console.error('[anthropic-subscription-auth] Failed to load auth state:', authStateError)
    return errorResponse('Claude connection state could not be loaded.', 500)
  }

  if (!authState) {
    return errorResponse('Invalid Anthropic callback state.', 400)
  }

  if (authState.user_id !== input.userId) {
    // Don't leak whether the state exists under a different user; respond the same as "invalid".
    return errorResponse('Invalid Anthropic callback state.', 400)
  }

  if (authState.consumed_at) {
    return errorResponse('This Claude connection link has already been used.', 400)
  }

  if (Date.parse(authState.expires_at) <= Date.now()) {
    return errorResponse('This Claude connection link has expired. Start the flow again.', 400)
  }

  let exchanged: Awaited<ReturnType<typeof exchangeAnthropicAuthorizationCode>>
  try {
    exchanged = await exchangeAnthropicAuthorizationCode({
      code,
      codeVerifier: authState.code_verifier,
      redirectUri: anthropicOauthConsoleRedirectUri,
      state,
    })
  } catch (error) {
    console.error('[anthropic-subscription-auth] Code exchange failed:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Claude connection failed.',
      400,
    )
  }

  const encryptedAccessToken = await encryptToken(exchanged.accessToken)
  const encryptedRefreshToken = await encryptToken(exchanged.refreshToken)
  const now = new Date().toISOString()

  const { error: saveError } = await supabase
    .from('ai_api_keys')
    .upsert({
      credential_kind: 'subscription',
      encrypted_key: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      expires_at: exchanged.expiresAt,
      last_four: null,
      provider: 'anthropic',
      set_by: authState.user_id,
      updated_at: now,
      user_id: authState.user_id,
    }, { onConflict: 'user_id,provider,credential_kind' })

  if (saveError) {
    console.error('[anthropic-subscription-auth] Failed to save Anthropic credentials:', saveError)
    return errorResponse('Claude subscription credentials could not be saved.', 500)
  }

  await supabase
    .from('ai_provider_oauth_states')
    .update({ consumed_at: now })
    .eq('id', authState.id)

  return jsonResponse({
    returnPath: normalizeReturnPath(authState.return_path),
    success: true,
  })
}

function normalizeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/'
  }

  return value
}
