import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('deploy-health function', () => {
  it('checks edge availability directly and verifies sql through the deploy_healthcheck RPC', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/deploy-health/index.ts'), 'utf8')

    expect(source).toContain("const FUNCTION_NAME = 'deploy-health'")
    expect(source).toContain("if (req.method !== 'GET')")
    expect(source).toContain("const surface = url.searchParams.get('surface')")
    expect(source).toContain("if (surface !== 'edge' && surface !== 'sql')")
    expect(source).toContain("await supabase.rpc('deploy_healthcheck')")
    expect(source).toContain("if (surface === 'sql')")
    expect(source).toContain("return jsonResponse({ok: false, surface, error: 'Unavailable'}, 503)")
  })
})
