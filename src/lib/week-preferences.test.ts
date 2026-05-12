import {describe, expect, it} from 'vitest'

import {getMonthGridOffset, getWeekdayLabels, startOfWeek} from './week-preferences'

function toLocalDateString(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

describe('week preferences', () => {
  it('computes monday-based week starts', () => {
    expect(toLocalDateString(startOfWeek(new Date('2026-04-08T15:00:00.000Z'), 'monday'))).toBe('2026-04-06')
  })

  it('computes sunday-based week starts', () => {
    expect(toLocalDateString(startOfWeek(new Date('2026-04-08T15:00:00.000Z'), 'sunday'))).toBe('2026-04-05')
  })

  it('shifts calendar headers and offsets for sunday-first calendars', () => {
    expect(getWeekdayLabels('sunday')).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'])
    expect(getMonthGridOffset(2026, 2, 'sunday')).toBe(0)
    expect(getMonthGridOffset(2026, 2, 'monday')).toBe(6)
  })
})
