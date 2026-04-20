import {useEffect, useRef} from 'react'

const AUTO_SAVE_DEBOUNCE_MS = 300

/**
 * Auto-saves a personal view config to localStorage with debouncing.
 * Skips the first render to avoid overwriting before initialization completes.
 * Flushes any pending save on unmount so navigating away doesn't lose changes.
 */
export function useAutoSavePersonalConfig<T>(
  viewId: string,
  config: T,
  saveFn: (viewId: string, config: T) => void,
) {
  const initializedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRef = useRef<{viewId: string; config: T} | null>(null)
  const saveFnRef = useRef(saveFn)
  saveFnRef.current = saveFn

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }

    pendingRef.current = {viewId, config}
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      pendingRef.current = null
      saveFn(viewId, config)
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timerRef.current)
  }, [viewId, config, saveFn])

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      const pending = pendingRef.current
      if (pending) {
        saveFnRef.current(pending.viewId, pending.config)
        pendingRef.current = null
      }
    }
  }, [])
}
