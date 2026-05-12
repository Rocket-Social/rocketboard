/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, renderHook} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'

import {
  _resetAssigneeInteractionState,
  isAnyPickerOpen,
  notifyPickerClosed,
  notifyPickerOpened,
  useIsAnyPickerOpen,
} from './assignee-interaction'

afterEach(() => {
  _resetAssigneeInteractionState()
})

describe('assignee-interaction', () => {
  it('isAnyPickerOpen returns false when no picker is open', () => {
    expect(isAnyPickerOpen()).toBe(false)
  })

  it('reflects open + close events', () => {
    notifyPickerOpened()
    expect(isAnyPickerOpen()).toBe(true)
    notifyPickerClosed()
    expect(isAnyPickerOpen()).toBe(false)
  })

  it('handles concurrent pickers via reference counting', () => {
    notifyPickerOpened()
    notifyPickerOpened()
    expect(isAnyPickerOpen()).toBe(true)
    notifyPickerClosed()
    expect(isAnyPickerOpen()).toBe(true) // still one open
    notifyPickerClosed()
    expect(isAnyPickerOpen()).toBe(false)
  })

  it('clamps the count at zero', () => {
    notifyPickerClosed() // unbalanced close
    notifyPickerClosed()
    expect(isAnyPickerOpen()).toBe(false)
    notifyPickerOpened()
    expect(isAnyPickerOpen()).toBe(true)
  })

  it('useIsAnyPickerOpen subscribes and updates on changes', () => {
    const {result} = renderHook(() => useIsAnyPickerOpen())
    expect(result.current).toBe(false)

    act(() => {
      notifyPickerOpened()
    })
    expect(result.current).toBe(true)

    act(() => {
      notifyPickerClosed()
    })
    expect(result.current).toBe(false)
  })

  it('useIsAnyPickerOpen unsubscribes on unmount', () => {
    const {result, unmount} = renderHook(() => useIsAnyPickerOpen())
    unmount()

    // After unmount, the listener should be removed; firing notify
    // shouldn't throw on a stale setter.
    expect(() => {
      notifyPickerOpened()
      notifyPickerClosed()
    }).not.toThrow()
    expect(result.current).toBe(false)
  })
})
