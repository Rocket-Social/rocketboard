import {useEffect} from 'react'

/**
 * Syncs view state across browser tabs by listening for localStorage changes.
 * The `storage` event only fires in other tabs, not the tab that made the change.
 */
export function useLocalStorageSync(
  storageKey: string,
  onSync: (newValue: string | null) => void,
) {
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === storageKey) {
        onSync(event.newValue)
      }
    }

    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [storageKey, onSync])
}
