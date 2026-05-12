// Monitoring smoke test — fires captureException synchronously (outside any
// ErrorBoundary path) so we can verify end-to-end ingestion independently of
// React's error-boundary plumbing. TanStack Router has its own internal error
// boundary that can swallow render-time throws before our app ErrorBoundary
// sees them, which would prevent captureException from firing via the normal
// path. Calling it here directly side-steps that and proves the wire works.
//
// Gated by import.meta.env.DEV or VITE_ALLOW_SMOKE so the route is a no-op in
// production builds (see deploy-hosted.yml — staging=true, production=false).

import {captureException, isMonitoringEnabled} from '../platform/monitoring'

export function DevThrowPage() {
  const allowed = import.meta.env.DEV || import.meta.env.VITE_ALLOW_SMOKE === 'true'
  if (!allowed) {
    return null
  }

  const smokeError = new Error('monitoring smoke test — delete this route after verification if you want')

  console.info('[smoke] capturing exception', {monitoring_initialized: isMonitoringEnabled()})
  captureException(smokeError, {
    smoke_test: true,
    route: '/dev/throw',
    timestamp: new Date().toISOString(),
  })
  console.info('[smoke] captureException returned — event queued')

  throw smokeError
}
