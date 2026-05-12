import {describe, expect, it} from 'vitest'
import {assignBucket, getBucketPeriodKeys, getCalendarPeriodKeys, periodKeyLabel} from './bucketHelpers'

describe('assignBucket', () => {
  it('assigns dates within first cutoff to "now"', () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(assignBucket(tomorrow.toISOString().slice(0, 10), [30, 90])).toBe('now')
  })

  it('assigns dates within second cutoff to "next"', () => {
    const today = new Date()
    const future = new Date(today)
    future.setDate(future.getDate() + 45)
    expect(assignBucket(future.toISOString().slice(0, 10), [30, 90])).toBe('next')
  })

  it('assigns dates beyond second cutoff to "later"', () => {
    const today = new Date()
    const farFuture = new Date(today)
    farFuture.setDate(farFuture.getDate() + 120)
    expect(assignBucket(farFuture.toISOString().slice(0, 10), [30, 90])).toBe('later')
  })

  it('assigns past dates to "now"', () => {
    const past = new Date()
    past.setDate(past.getDate() - 10)
    expect(assignBucket(past.toISOString().slice(0, 10), [30, 90])).toBe('now')
  })
})

describe('getBucketPeriodKeys', () => {
  it('returns now, next, later', () => {
    expect(getBucketPeriodKeys()).toEqual(['now', 'next', 'later'])
  })
})

describe('getCalendarPeriodKeys', () => {
  it('generates month keys', () => {
    const baseline = new Date(Date.UTC(2026, 0, 1))
    const keys = getCalendarPeriodKeys('month', baseline, 3)
    expect(keys).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('generates quarter keys', () => {
    const baseline = new Date(Date.UTC(2026, 0, 1))
    const keys = getCalendarPeriodKeys('quarter', baseline, 4)
    expect(keys).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'])
  })

  it('wraps across year boundary', () => {
    const baseline = new Date(Date.UTC(2026, 10, 1))
    const keys = getCalendarPeriodKeys('month', baseline, 4)
    expect(keys).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('periodKeyLabel', () => {
  it('formats bucket keys with custom labels', () => {
    expect(periodKeyLabel('now', ['Today', 'Soon', 'Future'])).toBe('Today')
    expect(periodKeyLabel('next', ['Today', 'Soon', 'Future'])).toBe('Soon')
    expect(periodKeyLabel('later', ['Today', 'Soon', 'Future'])).toBe('Future')
  })

  it('formats bucket keys with default labels', () => {
    expect(periodKeyLabel('now')).toBe('Now')
    expect(periodKeyLabel('next')).toBe('Next')
    expect(periodKeyLabel('later')).toBe('Later')
  })

  it('formats month keys', () => {
    expect(periodKeyLabel('2026-04')).toBe('Apr 2026')
    expect(periodKeyLabel('2026-12')).toBe('Dec 2026')
  })

  it('passes through quarter keys', () => {
    expect(periodKeyLabel('2026-Q2')).toBe('2026-Q2')
  })
})
