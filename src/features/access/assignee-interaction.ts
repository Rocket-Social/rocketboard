// Cross-component pub/sub for "is any assignee picker open right now?".
//
// AssigneePicker publishes opens/closes; AssigneeHoverCard subscribes
// and skips its hover-to-open behaviour while any picker is active.
// This prevents the regression where moving the cursor across the
// picker's portal-rendered content triggered a sibling row's hover
// card, which then dismissed the picker via focus-shift.
//
// Module-level state (not React Context) because every cell mounts
// its own picker + hover card, and threading a provider through the
// table-row tree is heavier than the value here demands.

import {useEffect, useState} from 'react'

let activePickerCount = 0
const listeners = new Set<(isOpen: boolean) => void>()

function notify() {
  const isOpen = activePickerCount > 0
  for (const fn of listeners) {
    fn(isOpen)
  }
}

export function notifyPickerOpened() {
  activePickerCount += 1
  notify()
}

export function notifyPickerClosed() {
  activePickerCount = Math.max(0, activePickerCount - 1)
  notify()
}

export function isAnyPickerOpen() {
  return activePickerCount > 0
}

export function useIsAnyPickerOpen(): boolean {
  const [open, setOpen] = useState(activePickerCount > 0)
  useEffect(() => {
    listeners.add(setOpen)
    return () => {
      listeners.delete(setOpen)
    }
  }, [])
  return open
}

// Reset hook for tests so module-level state doesn't leak between cases.
export function _resetAssigneeInteractionState() {
  activePickerCount = 0
  listeners.clear()
}
