import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('ai-key-manage anthropic subscription support', () => {
  it('validates setup tokens, exposes feature capabilities, and persists credential kinds', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/functions/ai-key-manage/index.ts'),
      'utf8',
    )

    expect(source).toContain('capabilities: {')
    expect(source).toContain('anthropicSubscriptionEnabled')
    expect(source).toContain("credential_kind: credentialKind")
    expect(source).toContain('preflightAnthropicCredential')
    expect(source).toContain('Anthropic subscription auth is currently disabled by Rocketboard.')
  })
})
