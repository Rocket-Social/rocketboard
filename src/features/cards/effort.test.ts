import {describe, expect, it} from 'vitest'

import {compareEffortValues, formatEffortValue, parseEffortInput} from './effort'

describe('effort helpers', () => {
  it('formats null as blank and preserves decimals', () => {
    expect(formatEffortValue(null)).toBe('')
    expect(formatEffortValue(0)).toBe('0')
    expect(formatEffortValue(2.5)).toBe('2.5')
  })

  it('parses blank, zero, and decimal values', () => {
    expect(parseEffortInput('')).toBeNull()
    expect(parseEffortInput('  ')).toBeNull()
    expect(parseEffortInput('0')).toBe(0)
    expect(parseEffortInput('2.5')).toBe(2.5)
  })

  it('rejects invalid or negative input', () => {
    expect(parseEffortInput('-1')).toBeUndefined()
    expect(parseEffortInput('abc')).toBeUndefined()
  })

  it('sorts null effort values last', () => {
    expect(compareEffortValues(1, 2)).toBeLessThan(0)
    expect(compareEffortValues(2, 1)).toBeGreaterThan(0)
    expect(compareEffortValues(null, 1)).toBeGreaterThan(0)
    expect(compareEffortValues(1, null)).toBeLessThan(0)
    expect(compareEffortValues(null, null)).toBe(0)
  })
})
