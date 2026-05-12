import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('ai-chat persona route fallback handling', () => {
  it('routes by provider and credential kind with one hard-failure fallback', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/functions/ai-chat/index.ts'),
      'utf8',
    )

    expect(source).toContain("fallback_provider")
    expect(source).toContain("fallback_credential_kind")
    expect(source).toContain("function buildPersonaRoutes")
    expect(source).toContain(".eq('credential_kind', credentialKind)")
    expect(source).toContain("route.provider === 'google'")
    expect(source).toContain("routeIndex === 0")
    expect(source).toContain("routes.length > 1")
    expect(source).toContain("isHardProviderRequestError(error)")
    expect(source).toContain("Anthropic credentials could not be loaded. Update them in API Keys.")
    expect(source).toContain("Claude subscription credentials could not be refreshed. Reconnect them in API Keys.")
  })
})
