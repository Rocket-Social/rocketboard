import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

describe('granola disconnect handling', () => {
  it('fails disconnect if mirrored notes cannot be detached', () => {
    const source = readFileSync(resolve(process.cwd(), 'supabase/functions/granola-import/index.ts'), 'utf8')

    expect(source).toContain("console.error('[granola-import] Failed to auto-detach notes on disconnect:'")
    expect(source).toContain("console.error('[granola-import] Error auto-detaching notes on disconnect:'")
    expect(source).toContain("message: 'Rocketboard could not disconnect Granola because mirrored notes could not be made editable.'")
    expect(source).toContain("error: 'disconnect_failed'")
    expect(source).toContain(".select('id', {count: 'exact'})")
  })
})
