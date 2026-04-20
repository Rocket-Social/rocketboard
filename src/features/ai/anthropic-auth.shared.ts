export type ApiKeyCredentialKind = 'api_key' | 'subscription'

export const anthropicSubscriptionFeatureFlagKey = 'anthropic_subscription_auth_enabled'
export const anthropicSubscriptionDisabledReason =
  'Anthropic subscription auth is currently disabled by Rocketboard.'
export const anthropicOauthClientId = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const anthropicOauthAuthorizeUrl = 'https://claude.ai/oauth/authorize'
// Anthropic's own console callback page catches the OAuth redirect and displays the
// code to the user. Works with the Claude Code public client because Anthropic
// whitelists their own console URL. Pattern shared with Claude Code, Hermes, pi-ai,
// and OpenCode. Users paste the displayed `{code}#{state}` string back into
// Rocketboard to complete the flow.
export const anthropicOauthConsoleRedirectUri = 'https://console.anthropic.com/oauth/code/callback'
export const anthropicOauthTokenUrls = [
  'https://platform.claude.com/v1/oauth/token',
  'https://console.anthropic.com/v1/oauth/token',
] as const
export const anthropicOauthScopes = [
  'org:create_api_key',
  'user:profile',
  'user:inference',
] as const
export const anthropicVersionHeader = '2023-06-01'
// The user-agent version Anthropic's OAuth infrastructure validates.
// Must stay reasonably current; Hermes' comment warns Anthropic rejects OAuth
// requests with stale user-agent versions. Bumped to current Claude Code
// release (2.1.113, 2026-04-17) after 2.1.74 started getting cryptic 429s.
export const anthropicClaudeCodeVersionFallback = '2.1.113'
// Claude Code identity system-prompt prefix — required on OAuth/subscription
// requests. Anthropic's OAuth routing layer gates on this exact string being
// the first system-prompt text; without it subscription-backed requests come
// back as minimal-body 429s like {"error":{"type":"Error"}}. Matches the
// identity Claude Code CLI / Hermes / pi-ai / OpenCode all send.
export const anthropicClaudeCodeSystemPrefix =
  "You are Claude Code, Anthropic's official CLI for Claude."
// Common betas Hermes / Claude Code / pi-ai / OpenCode send on every request.
// GA on Claude 4.6+ and harmless no-ops there, but kept for compatibility
// with older Claude models and third-party Anthropic-compatible endpoints
// that still gate on them.
export const anthropicCommonBetas = [
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
] as const
// OAuth-only betas layered on top of the common set for subscription credentials.
export const anthropicOauthOnlyBetas = ['claude-code-20250219', 'oauth-2025-04-20'] as const
// Full beta list sent alongside subscription credentials. Order-independent,
// but keep the common ones first to mirror Hermes' layout for easier diffing.
export const anthropicOauthBetas = [...anthropicCommonBetas, ...anthropicOauthOnlyBetas] as const
export const defaultAnthropicValidationModel = 'claude-sonnet-4-20250514'

export function isAnthropicSubscriptionCredentialKind(
  credentialKind: ApiKeyCredentialKind | null | undefined,
): boolean {
  return credentialKind === 'subscription'
}

export function getApiKeyCredentialKindLabel(credentialKind: ApiKeyCredentialKind): string {
  if (credentialKind === 'subscription') return 'Claude subscription'
  return 'API key'
}

export function isAnthropicCredentialDisabledByFlag(input: {
  credentialKind: ApiKeyCredentialKind | null | undefined
  featureEnabled: boolean
  provider: string
}): boolean {
  return input.provider === 'anthropic'
    && isAnthropicSubscriptionCredentialKind(input.credentialKind)
    && !input.featureEnabled
}

export function getAnthropicDisabledReason(input: {
  credentialKind: ApiKeyCredentialKind | null | undefined
  featureEnabled: boolean
  provider: string
}): null | string {
  return isAnthropicCredentialDisabledByFlag(input)
    ? anthropicSubscriptionDisabledReason
    : null
}

export function isAnthropicOauthCredentialExpiring(
  expiresAt: null | string | undefined,
  skewMs = 60_000,
): boolean {
  if (!expiresAt) return true
  const expiryMs = Date.parse(expiresAt)
  if (Number.isNaN(expiryMs)) return true
  return expiryMs <= Date.now() + skewMs
}

export async function createPkcePair() {
  const verifier = createRandomUrlSafeString(64)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = toBase64Url(new Uint8Array(digest))
  return { challenge, verifier }
}

export function buildAnthropicAuthorizeUrl(input: {
  codeChallenge: string
  redirectUri: string
  state: string
}) {
  const url = new URL(anthropicOauthAuthorizeUrl)
  url.searchParams.set('code', 'true')
  url.searchParams.set('client_id', anthropicOauthClientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', anthropicOauthScopes.join(' '))
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', input.state)
  return url.toString()
}

export function buildAnthropicHeaders(input: {
  credentialKind: ApiKeyCredentialKind
  token: string
  claudeCodeVersion?: string
}): Record<string, string> {
  const headers: Record<string, string> = {
    'anthropic-version': anthropicVersionHeader,
  }

  if (isAnthropicSubscriptionCredentialKind(input.credentialKind)) {
    headers.Authorization = `Bearer ${input.token}`
    headers['anthropic-beta'] = anthropicOauthBetas.join(',')
    headers['user-agent'] = `claude-cli/${input.claudeCodeVersion ?? anthropicClaudeCodeVersionFallback} (external, cli)`
    headers['x-app'] = 'cli'
    return headers
  }

  // Mirror Hermes' common beta set on API-key requests too. These enable
  // interleaved thinking + fine-grained tool streaming features users
  // generally want when they show up.
  headers['anthropic-beta'] = anthropicCommonBetas.join(',')
  headers['x-api-key'] = input.token
  return headers
}

export type AnthropicSystemBlock = { type: 'text'; text: string }
export type AnthropicSystemPrompt = string | AnthropicSystemBlock[]

// Subscription/OAuth requests MUST send the system prompt as a content-block
// array with the Claude Code identity as the first block. Hermes does the
// same (anthropic_adapter.py:1336-1341) — flat string concatenation passes
// our own unit tests but Anthropic's OAuth routing still returns the cryptic
// minimal-body 429 for it. API-key requests keep the plain-string form.
export function buildAnthropicSystemPrompt(input: {
  credentialKind: ApiKeyCredentialKind
  systemPrompt: string
}): AnthropicSystemPrompt {
  if (!isAnthropicSubscriptionCredentialKind(input.credentialKind)) {
    return input.systemPrompt
  }
  const identityBlock: AnthropicSystemBlock = {
    type: 'text',
    text: anthropicClaudeCodeSystemPrefix,
  }
  if (!input.systemPrompt) {
    return [identityBlock]
  }
  return [identityBlock, { type: 'text', text: input.systemPrompt }]
}

export function buildAnthropicTokenCountValidationBody(model = defaultAnthropicValidationModel) {
  return {
    messages: [{ content: 'ping', role: 'user' }],
    model,
  }
}

function createRandomUrlSafeString(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return toBase64Url(bytes).slice(0, length)
}

function toBase64Url(bytes: Uint8Array) {
  let base64: string

  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64')
  } else {
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    base64 = btoa(binary)
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
