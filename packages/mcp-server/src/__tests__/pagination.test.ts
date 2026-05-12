import {describe, expect, it} from 'vitest'

import {decodeCursor, encodeCursor, normalizePageLimit, paginateItems} from '../server.js'

// ---------------------------------------------------------------------------
// encodeCursor
// ---------------------------------------------------------------------------

describe('encodeCursor', () => {
  it('returns a string representation of the offset', () => {
    expect(encodeCursor(0)).toBe('0')
    expect(encodeCursor(42)).toBe('42')
    expect(encodeCursor(100)).toBe('100')
  })
})

// ---------------------------------------------------------------------------
// decodeCursor
// ---------------------------------------------------------------------------

describe('decodeCursor', () => {
  it('returns 0 for null', () => {
    expect(decodeCursor(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(decodeCursor(undefined)).toBe(0)
  })

  it('returns 0 for an empty string', () => {
    expect(decodeCursor('')).toBe(0)
  })

  it('parses a valid numeric cursor string', () => {
    expect(decodeCursor('10')).toBe(10)
    expect(decodeCursor('0')).toBe(0)
  })

  it('throws for a negative cursor', () => {
    expect(() => decodeCursor('-5')).toThrow(/Invalid cursor/)
  })

  it('throws for a non-numeric string', () => {
    expect(() => decodeCursor('abc')).toThrow(/Invalid cursor/)
  })

  it('throws for NaN-producing strings', () => {
    expect(() => decodeCursor('NaN')).toThrow(/Invalid cursor/)
  })
})

// ---------------------------------------------------------------------------
// normalizePageLimit
// ---------------------------------------------------------------------------

describe('normalizePageLimit', () => {
  it('returns the default when limit is null', () => {
    expect(normalizePageLimit(null)).toBe(50) // DEFAULT_PAGE_SIZE
  })

  it('returns the default when limit is undefined', () => {
    expect(normalizePageLimit(undefined)).toBe(50)
  })

  it('returns a custom default when provided', () => {
    expect(normalizePageLimit(undefined, 25)).toBe(25)
  })

  it('returns the default when limit is NaN', () => {
    expect(normalizePageLimit(NaN)).toBe(50)
  })

  it('clamps to MAX_PAGE_SIZE (200) when above', () => {
    expect(normalizePageLimit(500)).toBe(200)
  })

  it('clamps to 1 when limit is 0 or negative', () => {
    expect(normalizePageLimit(0)).toBe(1)
    expect(normalizePageLimit(-10)).toBe(1)
  })

  it('passes through a limit within range', () => {
    expect(normalizePageLimit(75)).toBe(75)
  })

  it('truncates fractional limits', () => {
    expect(normalizePageLimit(10.9)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// paginateItems
// ---------------------------------------------------------------------------

describe('paginateItems', () => {
  const alphabet = Array.from({length: 10}, (_, i) => String.fromCharCode(65 + i)) // A-J

  describe('first page', () => {
    it('returns up to limit items from the start', () => {
      const result = paginateItems(alphabet, null, 3)
      expect(result.items).toEqual(['A', 'B', 'C'])
      expect(result.nextCursor).toBe('3')
    })

    it('uses the default page size when limit is null', () => {
      const result = paginateItems(alphabet, null, null, 5)
      expect(result.items).toEqual(['A', 'B', 'C', 'D', 'E'])
      expect(result.nextCursor).toBe('5')
    })
  })

  describe('middle page', () => {
    it('returns items starting from the cursor offset', () => {
      const result = paginateItems(alphabet, '3', 3)
      expect(result.items).toEqual(['D', 'E', 'F'])
      expect(result.nextCursor).toBe('6')
    })
  })

  describe('last page', () => {
    it('returns remaining items and null nextCursor', () => {
      const result = paginateItems(alphabet, '8', 5)
      expect(result.items).toEqual(['I', 'J'])
      expect(result.nextCursor).toBeNull()
    })

    it('returns null nextCursor when items exactly fill the page', () => {
      const result = paginateItems(alphabet, '5', 5)
      expect(result.items).toEqual(['F', 'G', 'H', 'I', 'J'])
      expect(result.nextCursor).toBeNull()
    })
  })

  describe('empty list', () => {
    it('returns empty items and null nextCursor', () => {
      const result = paginateItems([], null, 10)
      expect(result.items).toEqual([])
      expect(result.nextCursor).toBeNull()
    })
  })

  describe('cursor beyond list length', () => {
    it('returns empty items when cursor exceeds array length', () => {
      const result = paginateItems(alphabet, '100', 5)
      expect(result.items).toEqual([])
      expect(result.nextCursor).toBeNull()
    })
  })
})
