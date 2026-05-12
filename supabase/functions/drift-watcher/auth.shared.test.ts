import {describe, expect, it} from 'vitest'

import {UUID_RE} from './auth.shared'

describe('drift-watcher auth helpers', () => {
  describe('UUID_RE', () => {
    it('accepts canonical UUIDs of any version', () => {
      // v1
      expect(UUID_RE.test('a47ac10b-58cc-11ed-9b6a-0242ac120002')).toBe(true)
      // v4
      expect(UUID_RE.test('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
      // mixed case
      expect(UUID_RE.test('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(true)
    })

    it('rejects garbage and partial UUIDs', () => {
      expect(UUID_RE.test('')).toBe(false)
      expect(UUID_RE.test('not-a-uuid')).toBe(false)
      expect(UUID_RE.test('f47ac10b58cc4372a5670e02b2c3d479')).toBe(false)
      expect(UUID_RE.test('f47ac10b-58cc-4372-a567')).toBe(false)
      // SQL-injection attempt as the org_id query param
      expect(UUID_RE.test("' or 1=1 --")).toBe(false)
      expect(
        UUID_RE.test(
          "f47ac10b-58cc-4372-a567-0e02b2c3d479'; drop table cards; --",
        ),
      ).toBe(false)
    })
  })
})
