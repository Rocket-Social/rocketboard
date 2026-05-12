import {describe, expect, it} from 'vitest'

import {hideVisibleFieldKey, insertVisibleFieldKey, moveVisibleFieldKey, reorderVisibleFieldKey} from './table-column-operations'

describe('table column operations', () => {
  it('moves visible fields left and right', () => {
    expect(moveVisibleFieldKey(['status', 'effort', 'priority'], 'effort', 'left')).toEqual([
      'effort',
      'status',
      'priority',
    ])
    expect(moveVisibleFieldKey(['status', 'effort', 'priority'], 'effort', 'right')).toEqual([
      'status',
      'priority',
      'effort',
    ])
  })

  it('hides a visible field', () => {
    expect(hideVisibleFieldKey(['status', 'effort', 'priority'], 'effort')).toEqual([
      'status',
      'priority',
    ])
  })

  it('inserts only missing fields at the requested index', () => {
    expect(insertVisibleFieldKey(['status', 'priority'], 'effort', 1)).toEqual([
      'status',
      'effort',
      'priority',
    ])
    expect(insertVisibleFieldKey(['status', 'priority'], 'priority', 0)).toEqual([
      'status',
      'priority',
    ])
  })

  it('reorders a field to a new index', () => {
    expect(reorderVisibleFieldKey(['status', 'effort', 'priority'], 'priority', 0)).toEqual([
      'priority',
      'status',
      'effort',
    ])
    expect(reorderVisibleFieldKey(['status', 'effort', 'priority'], 'status', 2)).toEqual([
      'effort',
      'priority',
      'status',
    ])
    // No-op when already at target
    expect(reorderVisibleFieldKey(['status', 'effort', 'priority'], 'effort', 1)).toEqual([
      'status',
      'effort',
      'priority',
    ])
    // No-op when field not found
    expect(reorderVisibleFieldKey(['status', 'effort'], 'missing', 0)).toEqual([
      'status',
      'effort',
    ])
  })
})
