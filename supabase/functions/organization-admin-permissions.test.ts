import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('organization admin permission checks', () => {
  it('uses can_manage_organization in send-invite-email', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'supabase/functions/send-invite-email/index.ts'),
      'utf8',
    )

    expect(source).toContain("rpc('can_manage_organization'")
  })
})
