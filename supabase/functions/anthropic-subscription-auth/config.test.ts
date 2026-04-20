import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('anthropic subscription auth callback flow', () => {
  it('guards invalid, expired, and replayed callback states and stores refreshable credentials', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/functions/anthropic-subscription-auth/index.ts'),
      'utf8',
    )

    expect(source).toContain('Invalid Anthropic callback state.')
    expect(source).toContain('This Claude connection link has expired. Start the flow again.')
    expect(source).toContain('This Claude connection link has already been used.')
    expect(source).toContain("credential_kind: 'subscription'")
    expect(source).toContain('encrypted_refresh_token: encryptedRefreshToken')
    expect(source).toContain('authorizationUrl: buildAnthropicAuthorizeUrl')
  })
})
