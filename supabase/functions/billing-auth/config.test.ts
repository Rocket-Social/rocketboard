import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('billing function config', () => {
  it('disables the gateway JWT verifier and relies on in-function org-admin auth checks', () => {
    const configPath = resolve(process.cwd(), 'supabase/config.toml')
    const config = readFileSync(configPath, 'utf8')

    expect(config).toMatch(/\[functions\.billing-checkout\][\s\S]*?verify_jwt\s*=\s*false/)
    expect(config).toMatch(/\[functions\.billing-invoices\][\s\S]*?verify_jwt\s*=\s*false/)
    expect(config).toMatch(/\[functions\.billing-payment-method\][\s\S]*?verify_jwt\s*=\s*false/)
    expect(config).toMatch(/\[functions\.billing-portal-session\][\s\S]*?verify_jwt\s*=\s*false/)
  })

  it('maps auth failures to 401/403 instead of bubbling them as 500s', () => {
    const shared = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/supabase.ts'), 'utf8')

    expect(shared).toContain("throw new HttpError('Unauthorized', 401)")
    expect(shared).toContain("throw new HttpError('Organization admin access required', 403)")
    expect(shared).toContain('return errorResponse(err.message, err.status, err.code)')

    for (const path of [
      'supabase/functions/billing-checkout/index.ts',
      'supabase/functions/billing-invoices/index.ts',
      'supabase/functions/billing-payment-method/index.ts',
      'supabase/functions/billing-portal-session/index.ts',
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8')
      expect(source).toContain('errorResponseForException(err')
    }
  })
})
