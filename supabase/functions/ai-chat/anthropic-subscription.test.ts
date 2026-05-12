import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('ai-chat anthropic subscription handling', () => {
  it('refreshes refreshable Claude credentials and retries once on unauthorized responses', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/functions/ai-chat/index.ts'),
      'utf8',
    )

    expect(source).toContain('activeCredential.canRefresh')
    expect(source).toContain("response.status === 401")
    expect(source).toContain('refreshStoredAnthropicOauthCredential')
    expect(source).toContain('getAnthropicSubscriptionFeatureEnabled')
    expect(source).toContain('getAnthropicDisabledReason')
  })

  it('wraps the Anthropic system prompt with buildAnthropicSystemPrompt so subscription requests carry the Claude Code identity', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/functions/ai-chat/index.ts'),
      'utf8',
    )

    expect(source).toContain('buildAnthropicSystemPrompt')
    expect(source).toContain('system: buildAnthropicSystemPrompt({')
    expect(source).toContain('credentialKind: route.credentialKind')
  })
})
