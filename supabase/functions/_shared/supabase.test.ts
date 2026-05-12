import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('errorResponseForException', () => {
  it('awaits edge exception capture before returning a handled 5xx response', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/supabase.ts'), 'utf8')

    expect(source).toContain('export async function errorResponseForException')
    expect(source).toContain('await captureEdgeException(err, {functionName})')
    expect(source).not.toContain('void captureEdgeException(err, {functionName})')
  })
})
