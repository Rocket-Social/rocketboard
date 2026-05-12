import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('deploy-health function config', () => {
  it('disables the gateway JWT verifier so hosted deploy probes can call it directly', () => {
    const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')

    expect(config).toMatch(/\[functions\.deploy-health\][\s\S]*?verify_jwt\s*=\s*false/)
  })
})
