import {readFileSync} from 'node:fs'

import {describe, expect, it} from 'vitest'

describe('public security headers', () => {
  const headersPath = new URL('../../public/_headers', import.meta.url)
  const headers = readFileSync(headersPath, 'utf8')
  const cspLine = headers
    .split('\n')
    .find((line) => line.includes('Content-Security-Policy:'))

  it('allows bundled data-url fonts in the CSP font-src directive', () => {
    expect(cspLine).toContain("font-src 'self' data:")
  })

  it('allows PostHog event capture + config asset fetches for error monitoring', () => {
    // us-assets.i.posthog.com serves the dynamic config.js that posthog-js
    // pulls at init; us.i.posthog.com is the capture endpoint. Without both
    // whitelisted the browser blocks all exception events silently.
    expect(cspLine).toContain('https://us-assets.i.posthog.com')
    expect(cspLine).toContain('https://us.i.posthog.com')
  })
})
