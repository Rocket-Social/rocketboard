import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('granola-import function config', () => {
  it('disables the legacy gateway JWT verifier so browser preflights can reach the function handler', () => {
    const configPath = resolve(process.cwd(), 'supabase/config.toml')
    const config = readFileSync(configPath, 'utf8')

    expect(config).toMatch(/\[functions\.granola-import\][\s\S]*?verify_jwt\s*=\s*false/)
  })
})
