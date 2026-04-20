import {describe, expect, it} from 'vitest'

import {
  getBuiltinFieldCanonicalLabel,
  isBuiltinFieldRenamed,
  isBuiltinTableFieldKey,
  resolveBuiltinFieldLabel,
} from './builtin-fields'

describe('builtin field metadata', () => {
  it('recognizes builtin keys and canonical labels', () => {
    expect(isBuiltinTableFieldKey('effort')).toBe(true)
    expect(isBuiltinTableFieldKey('tags')).toBe(true)
    expect(isBuiltinTableFieldKey('custom_score')).toBe(false)
    expect(getBuiltinFieldCanonicalLabel('effort')).toBe('Effort')
    expect(getBuiltinFieldCanonicalLabel('tags')).toBe('Tags')
  })

  it('resolves aliases and rename state', () => {
    const labels = {effort: 'Points'} as const

    expect(resolveBuiltinFieldLabel('effort', labels)).toBe('Points')
    expect(resolveBuiltinFieldLabel('status', labels)).toBe('Status')
    expect(isBuiltinFieldRenamed('effort', labels)).toBe(true)
    expect(isBuiltinFieldRenamed('status', labels)).toBe(false)
  })
})
