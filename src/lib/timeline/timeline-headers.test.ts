process.env.TZ = 'America/Los_Angeles'

import {describe, expect, it} from 'vitest'

import {generateHeaders} from './timeline-headers'
import {addDays} from './timeline-math'

describe('timeline date math', () => {
  it('advances UTC dates cleanly across the March 2026 DST boundary', () => {
    const baseline = new Date('2026-03-04T00:00:00Z')

    expect(addDays(baseline, 5).toISOString()).toBe('2026-03-09T00:00:00.000Z')
  })
})

describe('generateHeaders', () => {
  it('renders consecutive day headers across the March 2026 DST boundary', () => {
    const baseline = new Date('2026-03-04T00:00:00Z')
    const {bottomRow} = generateHeaders('day', 1, 17, baseline)

    expect(bottomRow.map((cell) => cell.label)).toEqual([
      'We 4',
      'Th 5',
      'Fr 6',
      'Sa 7',
      'Su 8',
      'Mo 9',
      'Tu 10',
    ])
  })
})
