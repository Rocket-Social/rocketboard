import {useCallback, useEffect, useRef} from 'react'

const AUTO_SAVE_DEBOUNCE_MS = 300

type AutoSavePersonalConfigOptions = {
  debounceMs?: number
  enabled?: boolean
  flushOnViewChange?: boolean
}

/**
 * Auto-saves a personal view config to localStorage with debouncing.
 * Skips the first enabled render to avoid overwriting before initialization completes.
 * Flushes any pending save on unmount so navigating away doesn't lose changes.
 */
export function useAutoSavePersonalConfig<T>(
  viewId: string,
  config: T,
  saveFn: (viewId: string, config: T) => void,
  {
    debounceMs = AUTO_SAVE_DEBOUNCE_MS,
    enabled = true,
    flushOnViewChange = false,
  }: AutoSavePersonalConfigOptions = {},
) {
  const initializedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRef = useRef<{viewId: string; config: T} | null>(null)
  const saveFnRef = useRef(saveFn)
  const activeViewIdRef = useRef(viewId)
  const wasEnabledRef = useRef(enabled)
  saveFnRef.current = saveFn

  const flushPendingSave = useCallback((expectedViewId?: string) => {
    const pending = pendingRef.current

    if (!pending || (expectedViewId && pending.viewId !== expectedViewId)) {
      return
    }

    clearTimeout(timerRef.current)
    timerRef.current = undefined
    pendingRef.current = null
    saveFnRef.current(pending.viewId, pending.config)
  }, [])

  useEffect(() => {
    if (!initializedRef.current) {
      activeViewIdRef.current = viewId
      return
    }

    if (flushOnViewChange && activeViewIdRef.current !== viewId) {
      flushPendingSave(activeViewIdRef.current)
    }

    activeViewIdRef.current = viewId
  }, [flushOnViewChange, flushPendingSave, viewId])

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      wasEnabledRef.current = enabled
      return
    }

    if (!enabled) {
      wasEnabledRef.current = false
      return
    }

    if (!wasEnabledRef.current) {
      wasEnabledRef.current = true
      return
    }

    pendingRef.current = {viewId, config}
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      flushPendingSave(viewId)
    }, debounceMs)

    return () => clearTimeout(timerRef.current)
  }, [config, debounceMs, enabled, flushPendingSave, viewId])

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      flushPendingSave()
    }
  }, [flushPendingSave])
}
