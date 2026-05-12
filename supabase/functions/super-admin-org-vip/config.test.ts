import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('super-admin-org-vip config', () => {
  it('disables gateway JWT verification and enforces internal-admin auth in-function', () => {
    const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/super-admin-org-vip/index.ts'), 'utf8')

    expect(config).toMatch(/\[functions\.super-admin-org-vip\][\s\S]*?verify_jwt\s*=\s*false/)
    expect(source).toContain('requireInternalAdmin(req)')
    expect(source).toContain('errorResponseForException(err')
  })
})
