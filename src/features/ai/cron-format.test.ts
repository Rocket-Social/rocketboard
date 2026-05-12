import {describe, expect, it} from 'vitest'

import {describeCron, shortTimezone} from './cron-format'

describe('describeCron', () => {
  it('formats the daily preset', () => {
    expect(describeCron('0 9 * * *', 'UTC')).toBe('Every day at 09:00 UTC')
  })

  it('formats the weekly Monday preset', () => {
    expect(describeCron('0 9 * * 1', 'UTC')).toBe('Every Monday at 09:00 UTC')
  })

  it('formats the Daily Crash Log Triage cron (weekdays at 10:00 UTC)', () => {
    expect(describeCron('0 10 * * 1-5', 'UTC')).toBe('Every weekday at 10:00 UTC')
  })

  it('formats the Customer Feedback cron (Friday at 16:00 UTC)', () => {
    expect(describeCron('0 16 * * 5', 'UTC')).toBe('Every Friday at 16:00 UTC')
  })

  it('formats the weekend cron', () => {
    expect(describeCron('0 9 * * 0,6', 'UTC')).toBe('Every weekend day at 09:00 UTC')
  })

  it('uses short timezone labels when known (PT)', () => {
    expect(describeCron('0 10 * * 1-5', 'America/Los_Angeles')).toBe(
      'Every weekday at 10:00 PT',
    )
  })

  it('uses short timezone labels when known (IST)', () => {
    expect(describeCron('0 10 * * 1-5', 'Asia/Kolkata')).toBe(
      'Every weekday at 10:00 IST',
    )
  })

  it('falls back to the trailing IANA segment for unknown timezones', () => {
    expect(describeCron('0 9 * * *', 'Pacific/Auckland')).toBe('Every day at 09:00 Auckland')
  })

  it('falls back to raw cron for unsupported expressions (specific day of month)', () => {
    expect(describeCron('0 9 15 * *', 'UTC')).toBe('0 9 15 * *')
  })

  it('falls back to raw cron for non-numeric minute', () => {
    expect(describeCron('*/15 9 * * *', 'UTC')).toBe('*/15 9 * * *')
  })

  it('falls back to raw cron for malformed input', () => {
    expect(describeCron('not a cron', 'UTC')).toBe('not a cron')
    expect(describeCron('', 'UTC')).toBe('')
    expect(describeCron('0 9 *', 'UTC')).toBe('0 9 *')
  })

  it('Sunday weekday accepts both 0 and 7', () => {
    expect(describeCron('0 9 * * 0', 'UTC')).toBe('Every Sunday at 09:00 UTC')
    expect(describeCron('0 9 * * 7', 'UTC')).toBe('Every Sunday at 09:00 UTC')
  })
})

describe('shortTimezone', () => {
  it('returns UTC for empty input', () => {
    expect(shortTimezone('')).toBe('UTC')
  })

  it('returns canonical short labels for known IANA zones', () => {
    expect(shortTimezone('America/Los_Angeles')).toBe('PT')
    expect(shortTimezone('Europe/London')).toBe('GMT')
  })

  it('falls back to the trailing IANA segment when unknown', () => {
    expect(shortTimezone('Pacific/Auckland')).toBe('Auckland')
    expect(shortTimezone('Atlantic/Azores')).toBe('Azores')
  })
})
