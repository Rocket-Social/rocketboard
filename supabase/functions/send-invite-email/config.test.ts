import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('send-invite-email function config', () => {
  it('disables the legacy gateway JWT verifier and relies on in-function auth checks', () => {
    const configPath = resolve(process.cwd(), 'supabase/config.toml')
    const config = readFileSync(configPath, 'utf8')

    expect(config).toMatch(/\[functions\.send-invite-email\][\s\S]*?verify_jwt\s*=\s*false/)
  })
})
