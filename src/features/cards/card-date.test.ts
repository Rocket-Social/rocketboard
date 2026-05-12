import {describe, expect, it} from 'vitest'

import {cardDateToDayOffset, normalizeCardDateString, parseCardDate} from './card-date'

describe('card-date helpers', () => {
  it('normalizes timestamp values into calendar dates', () => {
    expect(normalizeCardDateString('2026-03-25T21:35:46.000Z')).toBe('2026-03-25')
  })

  it('parses timestamp values without returning an invalid date', () => {
    const parsed = parseCardDate('2026-03-25T21:35:46.000Z')

    expect(parsed).not.toBeNull()
    expect(Number.isNaN(parsed?.getTime() ?? Number.NaN)).toBe(false)
  })

  it('computes day offsets for timestamp values used as Gantt fallbacks', () => {
    const baseline = new Date('2026-03-23T00:00:00Z')

    expect(cardDateToDayOffset('2026-03-25T21:35:46.000Z', baseline)).toBe(2)
  })
})
