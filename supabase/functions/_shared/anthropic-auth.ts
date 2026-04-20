import {
  anthropicClaudeCodeVersionFallback,
  anthropicOauthClientId,
  anthropicOauthTokenUrls,
  buildAnthropicHeaders,
  buildAnthropicTokenCountValidationBody,
  defaultAnthropicValidationModel,
  isAnthropicOauthCredentialExpiring,
  type ApiKeyCredentialKind,
} from '../../../src/features/ai/anthropic-auth.shared.ts'
import { decryptToken, encryptToken } from './github-crypto.ts'
import { createServiceClient } from './supabase.ts'

const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com'
type ServiceClient = ReturnType<typeof createServiceClient>

type StoredAnthropicCredentialRow = {
  credential_kind: ApiKeyCredentialKind | null
  encrypted_key: string | null
  encrypted_refresh_token: string | null
  expires_at: string | null
  id: string
}

export type ResolvedAnthropicCredential = {
  canRefresh: boolean
  credentialKind: ApiKeyCredentialKind
  expiresAt: null | string
  token: string
}

export function normalizeCredentialKind(
  credentialKind: ApiKeyCredentialKind | null | undefined,
): ApiKeyCredentialKind {
  return credentialKind ?? 'api_key'
}

export async function preflightAnthropicCredential(input: {
  credentialKind: ApiKeyCredentialKind
  model?: string
  token: string
}) {
  const response = await fetch(`${ANTHROPIC_API_BASE_URL}/v1/messages/count_tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAnthropicHeaders({
        claudeCodeVersion: anthropicClaudeCodeVersionFallback,
        credentialKind: input.credentialKind,
        token: input.token,
      }),
    },
    body: JSON.stringify(buildAnthropicTokenCountValidationBody(input.model ?? defaultAnthropicValidationModel)),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      input.credentialKind === 'api_key'
        ? `Anthropic API key validation failed (${response.status}): ${errorText.slice(0, 200)}`
        : `Claude subscription token validation failed (${response.status}): ${errorText.slice(0, 200)}`,
    )
  }
}

export async function refreshAnthropicOauthToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: anthropicOauthClientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  let lastError: Error | null = null

  for (const endpoint of anthropicOauthTokenUrls) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `claude-cli/${anthropicClaudeCodeVersionFallback} (external, cli)`,
        },
        body: body.toString(),
      })

      if (!response.ok) {
        lastError = new Error(`Anthropic OAuth refresh failed (${response.status})`)
        continue
      }

      const payload = await response.json()
      const accessToken = String(payload.access_token ?? '').trim()
      if (!accessToken) {
        lastError = new Error('Anthropic OAuth refresh response was missing access_token')
        continue
      }

      const refreshedToken = String(payload.refresh_token ?? refreshToken).trim() || refreshToken
      const expiresInSeconds = Math.max(1, Number(payload.expires_in ?? 3600))
      return {
        accessToken,
        expiresAt: new Date(Date.now() + (expiresInSeconds * 1000)).toISOString(),
        refreshToken: refreshedToken,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Anthropic OAuth refresh failed')
    }
  }

  throw lastError ?? new Error('Anthropic OAuth refresh failed')
}

export async function exchangeAnthropicAuthorizationCode(input: {
  code: string
  codeVerifier: string
  redirectUri: string
  state: string
}) {
  // Hermes / Claude Code / pi-ai / OpenCode all exchange with a JSON body that
  // includes `state` alongside the PKCE verifier. Form-urlencoded without
  // state gets a 400 from Anthropic's token endpoint for this OAuth client.
  const body = JSON.stringify({
    client_id: anthropicOauthClientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
    state: input.state,
  })

  let lastError: Error | null = null

  for (const endpoint of anthropicOauthTokenUrls) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `claude-cli/${anthropicClaudeCodeVersionFallback} (external, cli)`,
        },
        body,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        lastError = new Error(
          `Anthropic OAuth code exchange failed (${response.status})${errorText ? `: ${errorText.slice(0, 300)}` : ''}`,
        )
        continue
      }

      const payload = await response.json()
      const accessToken = String(payload.access_token ?? '').trim()
      const refreshToken = String(payload.refresh_token ?? '').trim()
      if (!accessToken || !refreshToken) {
        lastError = new Error('Anthropic OAuth code exchange response was incomplete')
        continue
      }

      const expiresInSeconds = Math.max(1, Number(payload.expires_in ?? 3600))
      return {
        accessToken,
        expiresAt: new Date(Date.now() + (expiresInSeconds * 1000)).toISOString(),
        refreshToken,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Anthropic OAuth code exchange failed')
    }
  }

  throw lastError ?? new Error('Anthropic OAuth code exchange failed')
}

export async function refreshStoredAnthropicOauthCredential(
  supabase: ServiceClient,
  row: StoredAnthropicCredentialRow,
): Promise<ResolvedAnthropicCredential> {
  if (!row.encrypted_refresh_token) {
    throw new Error('Claude subscription refresh token is missing. Reconnect with Claude.')
  }

  const refreshToken = await decryptToken(row.encrypted_refresh_token)
  if (!refreshToken) {
    throw new Error('Claude subscription refresh token could not be decrypted. Reconnect with Claude.')
  }

  const refreshed = await refreshAnthropicOauthToken(refreshToken)
  const encryptedAccessToken = await encryptToken(refreshed.accessToken)
  const encryptedRefreshToken = await encryptToken(refreshed.refreshToken)

  const { error } = await supabase
    .from('ai_api_keys')
    .update({
      encrypted_key: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  if (error) {
    throw new Error('Claude subscription credentials refreshed but could not be persisted.')
  }

  return {
    canRefresh: true,
    credentialKind: 'subscription',
    expiresAt: refreshed.expiresAt,
    token: refreshed.accessToken,
  }
}

export async function resolveStoredAnthropicCredential(
  supabase: ServiceClient,
  row: StoredAnthropicCredentialRow,
): Promise<ResolvedAnthropicCredential> {
  const credentialKind = normalizeCredentialKind(row.credential_kind)

  if (!row.encrypted_key) {
    throw new Error('Anthropic credentials are missing. Update them in API Keys.')
  }

  if (
    credentialKind === 'subscription'
    && row.encrypted_refresh_token
    && isAnthropicOauthCredentialExpiring(row.expires_at)
  ) {
    return refreshStoredAnthropicOauthCredential(supabase, row)
  }

  const token = await decryptToken(row.encrypted_key)
  if (!token) {
    throw new Error(
      credentialKind === 'api_key'
        ? 'Failed to decrypt Anthropic API key. The key may be corrupted.'
        : 'Failed to decrypt Claude subscription credentials. Reconnect with Claude.',
    )
  }

  return {
    canRefresh: Boolean(row.encrypted_refresh_token),
    credentialKind,
    expiresAt: row.expires_at,
    token,
  }
}
