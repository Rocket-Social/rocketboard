import { callEdgeFunction } from '../../platform/edge/edge-client'
import type { AiProvider, ApiKeyConfig } from './ai.types'
import { type ApiKeyCredentialKind } from './anthropic-auth.shared'

async function callKeyManage<T>(body: Record<string, unknown>): Promise<T> {
  return callEdgeFunction<T>('ai-key-manage', {body})
}

export async function getApiKeyStatus(organizationId?: string): Promise<ApiKeyConfig> {
  const result = await callKeyManage<{
    capabilities?: {anthropicSubscriptionEnabled?: boolean}
    orgKeys?: ApiKeyConfig['orgKeys']
    userKeys?: ApiKeyConfig['userKeys']
  }>({
    action: 'get_status',
    organizationId,
  })

  return {
    capabilities: {
      anthropicSubscriptionEnabled: Boolean(result.capabilities?.anthropicSubscriptionEnabled),
    },
    userKeys: result.userKeys ?? [],
    orgKeys: result.orgKeys ?? [],
  }
}

export async function setApiKey(
  provider: AiProvider,
  key: string,
  scope: 'user' | 'org',
  credentialKind?: ApiKeyCredentialKind,
  organizationId?: string,
): Promise<{ lastFour: string }> {
  return callKeyManage<{lastFour: string}>({
    action: 'set_key',
    credentialKind,
    provider,
    key,
    scope,
    organizationId,
  })
}

export async function clearApiKey(
  provider: AiProvider,
  scope: 'user' | 'org',
  credentialKind?: ApiKeyCredentialKind,
  organizationId?: string,
): Promise<void> {
  await callKeyManage<unknown>({
    action: 'clear_key',
    credentialKind,
    provider,
    scope,
    organizationId,
  })
}

export type BeginAnthropicSubscriptionAuthResult = {
  authorizationUrl: string
  state: string
}

export async function beginAnthropicSubscriptionAuth(
  returnPath: string,
): Promise<BeginAnthropicSubscriptionAuthResult> {
  const payload = await callEdgeFunction<{authorizationUrl?: string; state?: string}>(
    'anthropic-subscription-auth',
    {
      body: {action: 'initiate', returnPath},
      errorFallback: 'Could not start Claude subscription connection.',
    },
  )

  if (!payload.authorizationUrl || !payload.state) {
    throw new Error('Claude connection did not return an authorization URL.')
  }

  return {
    authorizationUrl: payload.authorizationUrl,
    state: payload.state,
  }
}

export async function submitAnthropicSubscriptionCode(input: {
  code: string
  state: string
}): Promise<void> {
  const trimmedCode = input.code.trim()
  if (!trimmedCode || !input.state) {
    throw new Error('Missing Claude authorization code.')
  }

  // Anthropic's console callback page hands the user a `{code}#{state}` string.
  // Accept that shape, but if the user trimmed or only pasted the code portion,
  // fall back to the initiate-response state we stored alongside it.
  const [pastedCode, pastedState] = trimmedCode.split('#', 2)
  const state = pastedState && pastedState.trim() ? pastedState.trim() : input.state

  await callEdgeFunction<{success?: boolean}>('anthropic-subscription-auth', {
    body: {action: 'submit_code', code: pastedCode.trim(), state},
    errorFallback: 'Could not complete Claude subscription connection.',
  })
}
