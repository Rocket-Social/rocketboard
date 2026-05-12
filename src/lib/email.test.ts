import {describe, expect, it} from 'vitest'

import {isEmailFormat} from './email'

describe('isEmailFormat', () => {
  it('accepts a normal email address', () => {
    expect(isEmailFormat('alice@example.com')).toBe(true)
  })

  it('trims surrounding whitespace before validating', () => {
    expect(isEmailFormat('  user@example.com  ')).toBe(true)
  })

  it('rejects empty input', () => {
    expect(isEmailFormat('')).toBe(false)
    expect(isEmailFormat('   ')).toBe(false)
  })

  it('rejects emails with internal whitespace', () => {
    expect(isEmailFormat('foo @bar.com')).toBe(false)
    expect(isEmailFormat('foo@ bar.com')).toBe(false)
  })

  it('rejects values without an @', () => {
    expect(isEmailFormat('foo.bar.com')).toBe(false)
  })

  it('rejects values without a TLD', () => {
    expect(isEmailFormat('foo@bar')).toBe(false)
  })

  it('rejects pasted "Name <email@x.com>" form', () => {
    expect(isEmailFormat('Name <name@example.com>')).toBe(false)
  })

  it('rejects values with a trailing comma', () => {
    expect(isEmailFormat('foo@bar.com,')).toBe(false)
  })
})
