import {describe, expect, it} from 'vitest'

import {UUID_RE} from './auth.shared.ts'

describe('UUID_RE', () => {
  it('matches a canonical UUID', () => {
    expect(UUID_RE.test('11111111-2222-3333-4444-555555555555')).toBe(true)
  })

  it('rejects non-UUIDs', () => {
    expect(UUID_RE.test('not-a-uuid')).toBe(false)
    expect(UUID_RE.test('11111111-2222-3333-4444')).toBe(false)
  })
})
