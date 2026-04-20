/** @vitest-environment jsdom */
import {beforeAll, describe, expect, it} from 'vitest'

import {resolveSameOriginPath} from './GitHubCallbackPage'

beforeAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('https://rocketboard.app/integrations/github/callback'),
  })
})

describe('GitHubCallbackPage.resolveSameOriginPath', () => {
  it('accepts a simple same-origin path', () => {
    expect(resolveSameOriginPath('/org/main-workspace/projects/starter'))
      .toBe('/org/main-workspace/projects/starter')
  })

  it('preserves query and hash on safe paths', () => {
    expect(resolveSameOriginPath('/org/main-workspace/settings?tab=github#repos'))
      .toBe('/org/main-workspace/settings?tab=github#repos')
  })

  it('rejects protocol-relative URLs that redirect off-site', () => {
    // `//evil.com/x` passed the old `startsWith('/')` check and then
    // `window.location.href = "//evil.com/x"` redirected the browser to
    // https://evil.com/x. Origin comparison catches this.
    expect(resolveSameOriginPath('//evil.com/x')).toBeNull()
    expect(resolveSameOriginPath('//evil.com')).toBeNull()
    expect(resolveSameOriginPath('///evil.com')).toBeNull()
  })

  it('rejects absolute URLs to foreign origins', () => {
    expect(resolveSameOriginPath('https://evil.com/')).toBeNull()
    expect(resolveSameOriginPath('http://rocketboard.app/')).toBeNull() // scheme mismatch
  })

  it('rejects malformed inputs gracefully', () => {
    expect(resolveSameOriginPath('')).toBeNull()
    expect(resolveSameOriginPath(null)).toBeNull()
    expect(resolveSameOriginPath(undefined)).toBeNull()
    expect(resolveSameOriginPath(42 as unknown)).toBeNull()
  })

  it('accepts an absolute URL to our own origin (normalizes to path)', () => {
    expect(resolveSameOriginPath('https://rocketboard.app/org/foo'))
      .toBe('/org/foo')
  })
})
