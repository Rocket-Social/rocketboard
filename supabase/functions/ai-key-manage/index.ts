import { encryptToken } from '../_shared/github-crypto.ts'
import { preflightAnthropicCredential } from '../_shared/anthropic-auth.ts'
import { getAnthropicSubscriptionFeatureEnabled } from '../_shared/feature-flags.ts'
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
import {
  getAnthropicDisabledReason,
  isAnthropicSubscriptionCredentialKind,
  type ApiKeyCredentialKind,
} from '../../../src/features/ai/anthropic-auth.shared.ts'

const PROVIDER_PREFIXES: Record<string, string> = {
  openai: 'sk-',
  anthropic: 'sk-ant-',
  google: 'AI',
}

const ProviderSchema = z.enum(['openai', 'anthropic', 'google'])
type Provider = z.infer<typeof ProviderSchema>

const CredentialKindSchema = z.enum(['api_key', 'subscription'])
const ScopeSchema = z.enum(['user', 'org'])

const SetKeyRequestSchema = z.object({
  action: z.literal('set_key'),
  credentialKind: CredentialKindSchema.optional(),
  provider: ProviderSchema,
  key: z.string().min(1),
  scope: ScopeSchema,
  organizationId: z.string().uuid().optional(),
})

const ClearKeyRequestSchema = z.object({
  action: z.literal('clear_key'),
  credentialKind: CredentialKindSchema.optional(),
  provider: ProviderSchema,
  scope: ScopeSchema,
  organizationId: z.string().uuid().optional(),
})

const GetStatusRequestSchema = z.object({
  action: z.literal('get_status'),
  organizationId: z.string().uuid().optional(),
})

export const AiKeyManageBodySchema = z.discriminatedUnion('action', [
  SetKeyRequestSchema,
  ClearKeyRequestSchema,
  GetStatusRequestSchema,
])

type RequestBody = z.infer<typeof AiKeyManageBodySchema>

function validateKeyFormat(provider: Provider, key: string, credentialKind: ApiKeyCredentialKind): boolean {
  if (provider === 'anthropic' && credentialKind !== 'api_key') {
    return true
  }
  const prefix = PROVIDER_PREFIXES[provider]
  if (!prefix) return true
  return key.startsWith(prefix)
}

Deno.serve(withMonitoring('ai-key-manage', async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return errorResponse('Authentication required', 401)
  }

  let body: RequestBody
  try {
    body = await parseJsonBody(req, AiKeyManageBodySchema)
  } catch (err) {
    return errorResponseForException(err, 'Invalid request', 'ai-key-manage')
  }

  const supabase = createServiceClient()
  const anthropicSubscriptionEnabled = await getAnthropicSubscriptionFeatureEnabled()

  // ── get_status ────────────────────────────────────────────
  if (body.action === 'get_status') {
    const { data: userKeys } = await supabase
      .from('ai_api_keys')
      .select('provider, last_four, credential_kind, created_at, updated_at')
      .eq('user_id', user.id)

    let orgKeys: typeof userKeys = []
    if (body.organizationId) {
      // D7-4 / codex C4: admin-only existence visibility for org-scoped keys.
      // Non-admin members must not be able to infer which providers an org has
      // configured. RLS on ai_api_keys is also tightened to admin-only for
      // org-scoped rows (Phase 7-A migration); this is defense in depth.
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', body.organizationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (membership && membership.role === 'admin') {
        const { data } = await supabase
          .from('ai_api_keys')
          .select('provider, last_four, credential_kind, set_by, created_at, updated_at')
          .eq('organization_id', body.organizationId)
        orgKeys = data ?? []
      }
      // Non-admin (or non-member): silently return empty orgKeys (no error, no leak)
    }

    return jsonResponse({
      userKeys: (userKeys ?? []).map((k) => ({
        credentialKind: k.credential_kind ?? 'api_key',
        disabledReason: getAnthropicDisabledReason({
          credentialKind: (k.credential_kind ?? 'api_key') as ApiKeyCredentialKind,
          featureEnabled: anthropicSubscriptionEnabled,
          provider: k.provider,
        }),
        lastFour: k.last_four ?? null,
        provider: k.provider,
        setAt: k.updated_at,
      })),
      orgKeys: (orgKeys ?? []).map((k) => ({
        credentialKind: k.credential_kind ?? 'api_key',
        disabledReason: getAnthropicDisabledReason({
          credentialKind: (k.credential_kind ?? 'api_key') as ApiKeyCredentialKind,
          featureEnabled: anthropicSubscriptionEnabled,
          provider: k.provider,
        }),
        lastFour: k.last_four ?? null,
        provider: k.provider,
        setBy: k.set_by,
        setAt: k.updated_at,
      })),
      capabilities: {
        anthropicSubscriptionEnabled,
      },
    })
  }

  // ── set_key ───────────────────────────────────────────────
  if (body.action === 'set_key') {
    if (body.key.trim().length < 8) {
      return errorResponse('API key is required', 400)
    }
    const credentialKind = body.provider === 'anthropic'
      ? body.credentialKind ?? 'api_key'
      : 'api_key'

    if (
      body.provider === 'anthropic'
      && body.scope === 'org'
      && credentialKind !== 'api_key'
    ) {
      return errorResponse('Claude subscription credentials are only supported for personal keys.', 400)
    }

    if (
      body.provider === 'anthropic'
      && isAnthropicSubscriptionCredentialKind(credentialKind)
      && !anthropicSubscriptionEnabled
    ) {
      return errorResponse('Anthropic subscription auth is currently disabled by Rocketboard.', 403)
    }

    if (!validateKeyFormat(body.provider, body.key, credentialKind)) {
      return errorResponse(
        `Invalid key format for ${body.provider}. Expected prefix: ${PROVIDER_PREFIXES[body.provider]}`,
        400,
      )
    }

    if (body.provider === 'anthropic' && credentialKind === 'subscription') {
      try {
        await preflightAnthropicCredential({
          credentialKind,
          token: body.key.trim(),
        })
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : 'Claude subscription token validation failed.', 400)
      }
    }

    const encrypted = await encryptToken(body.key.trim())
    const lastFour = body.key.trim().slice(-4)

    if (body.scope === 'org') {
      if (!body.organizationId) {
        return errorResponse('organizationId is required for org-scoped keys', 400)
      }
      // Enforce admin role
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', body.organizationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership || membership.role !== 'admin') {
        return errorResponse('Organization admin access required', 403)
      }

      const { error } = await supabase
        .from('ai_api_keys')
        .upsert(
          {
            organization_id: body.organizationId,
            provider: body.provider,
            credential_kind: credentialKind,
            encrypted_key: encrypted,
            encrypted_refresh_token: null,
            expires_at: null,
            last_four: lastFour,
            set_by: user.id,
          },
          { onConflict: 'organization_id,provider,credential_kind' },
        )

      if (error) {
        console.error('[ai-key-manage] Failed to set org key:', error)
        return errorResponse('Failed to save API key', 500)
      }
    } else {
      const { error } = await supabase
        .from('ai_api_keys')
        .upsert(
          {
            user_id: user.id,
            provider: body.provider,
            credential_kind: credentialKind,
            encrypted_key: encrypted,
            encrypted_refresh_token: null,
            expires_at: null,
            last_four: lastFour,
            set_by: user.id,
          },
          { onConflict: 'user_id,provider,credential_kind' },
        )

      if (error) {
        console.error('[ai-key-manage] Failed to set user key:', error)
        return errorResponse('Failed to save API key', 500)
      }
    }

    return jsonResponse({ ok: true, lastFour })
  }

  // ── clear_key ─────────────────────────────────────────────
  if (body.action === 'clear_key') {
    const credentialKind = body.provider === 'anthropic'
      ? body.credentialKind ?? 'api_key'
      : 'api_key'

    if (body.scope === 'org') {
      if (!body.organizationId) {
        return errorResponse('organizationId is required for org-scoped keys', 400)
      }
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', body.organizationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership || membership.role !== 'admin') {
        return errorResponse('Organization admin access required', 403)
      }

      await supabase
        .from('ai_api_keys')
        .delete()
        .eq('organization_id', body.organizationId)
        .eq('provider', body.provider)
        .eq('credential_kind', credentialKind)
    } else {
      await supabase
        .from('ai_api_keys')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', body.provider)
        .eq('credential_kind', credentialKind)
    }

    return jsonResponse({ ok: true })
  }

  return errorResponse(`Unknown action: ${(body as { action: string }).action}`, 400)
}))
