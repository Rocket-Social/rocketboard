import {useEffect, useRef} from 'react'

import {rpcAdapter} from '../../platform/data/rpc-adapter'

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000
const MIN_HEARTBEAT_GAP_MS = 60 * 1000

export async function touchUserActive(): Promise<void> {
  await rpcAdapter.call('touch_user_active')
}

export function useUserActiveHeartbeat(enabled: boolean): void {
  const lastFiredAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const fire = () => {
      const now = Date.now()
      if (now - lastFiredAtRef.current < MIN_HEARTBEAT_GAP_MS) return
      lastFiredAtRef.current = now
      void touchUserActive().catch(() => {
        // Heartbeat failures are non-critical — drop silently.
      })
    }

    fire()

    const interval = window.setInterval(fire, HEARTBEAT_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fire()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])
}
