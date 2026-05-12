/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { describe, expect, it, vi } from 'vitest'

import {
  anthropicClaudeCodeSystemPrefix,
  anthropicCommonBetas,
  anthropicOauthBetas,
  anthropicSubscriptionDisabledReason,
  buildAnthropicAuthorizeUrl,
  buildAnthropicHeaders,
  buildAnthropicSystemPrompt,
  buildAnthropicTokenCountValidationBody,
  createPkcePair,
  defaultAnthropicValidationModel,
  getAnthropicDisabledReason,
  isAnthropicCredentialDisabledByFlag,
  isAnthropicOauthCredentialExpiring,
} from './anthropic-auth.shared'

describe('anthropic auth shared helpers', () => {
  it('builds Claude subscription headers with bearer auth and Claude Code betas', () => {
    expect(buildAnthropicHeaders({
      credentialKind: 'subscription',
      token: 'token-123',
    })).toMatchObject({
      Authorization: 'Bearer token-123',
      'anthropic-beta': anthropicOauthBetas.join(','),
      'anthropic-version': '2023-06-01',
      'user-agent': 'claude-cli/2.1.113 (external, cli)',
      'x-app': 'cli',
    })
  })

  it('builds API-key headers with x-api-key auth and common betas', () => {
    expect(buildAnthropicHeaders({
      credentialKind: 'api_key',
      token: 'sk-ant-api-test',
    })).toEqual({
      'anthropic-beta': anthropicCommonBetas.join(','),
      'anthropic-version': '2023-06-01',
      'x-api-key': 'sk-ant-api-test',
    })
  })

  it('marks Anthropic subscription credentials disabled when the flag is off', () => {
    expect(isAnthropicCredentialDisabledByFlag({
      credentialKind: 'subscription',
      featureEnabled: false,
      provider: 'anthropic',
    })).toBe(true)

    expect(getAnthropicDisabledReason({
      credentialKind: 'subscription',
      featureEnabled: false,
      provider: 'anthropic',
    })).toBe(anthropicSubscriptionDisabledReason)
  })

  it('detects expiring OAuth credentials', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T12:00:00.000Z'))

    expect(isAnthropicOauthCredentialExpiring('2026-04-11T12:00:30.000Z')).toBe(true)
    expect(isAnthropicOauthCredentialExpiring('2026-04-11T12:05:00.000Z')).toBe(false)

    vi.useRealTimers()
  })

  it('creates PKCE pairs and authorize URLs with the expected parameters', async () => {
    const pkce = await createPkcePair()
    const url = new URL(buildAnthropicAuthorizeUrl({
      codeChallenge: pkce.challenge,
      redirectUri: 'https://example.supabase.co/functions/v1/anthropic-subscription-auth',
      state: 'state-123',
    }))

    expect(pkce.verifier).toHaveLength(64)
    expect(pkce.challenge.length).toBeGreaterThan(20)
    expect(url.origin).toBe('https://claude.ai')
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('9d1c250a-e61b-44d9-88ed-5944d1962f5e')
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.supabase.co/functions/v1/anthropic-subscription-auth')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses the canonical Anthropic validation model by default', () => {
    expect(defaultAnthropicValidationModel).toBe('claude-sonnet-4-20250514')
    expect(buildAnthropicTokenCountValidationBody()).toMatchObject({
      model: 'claude-sonnet-4-20250514',
    })
  })

  it('returns a content-block array with the Claude Code identity first on subscription requests', () => {
    expect(buildAnthropicSystemPrompt({
      credentialKind: 'subscription',
      systemPrompt: 'You are Claire, a Rocketboard helper.',
    })).toEqual([
      { type: 'text', text: anthropicClaudeCodeSystemPrefix },
      { type: 'text', text: 'You are Claire, a Rocketboard helper.' },
    ])

    expect(buildAnthropicSystemPrompt({
      credentialKind: 'subscription',
      systemPrompt: '',
    })).toEqual([
      { type: 'text', text: anthropicClaudeCodeSystemPrefix },
    ])
  })

  it('leaves the system prompt as a plain string on api-key requests', () => {
    const persona = 'You are Claire, a Rocketboard helper.'
    expect(buildAnthropicSystemPrompt({
      credentialKind: 'api_key',
      systemPrompt: persona,
    })).toBe(persona)
  })
})
