import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {capturePostHogEvent} from './posthog.ts'

type DenoEnvShim = {
  get: (key: string) => string | undefined
}

function stubDenoEnv(values: Record<string, string | undefined>): void {
  const env: DenoEnvShim = {
    get: (key) => values[key],
  }
  vi.stubGlobal('Deno', {env})
}

describe('capturePostHogEvent', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (originalFetch) {
      globalThis.fetch = originalFetch
    }
  })

  it('drops the event when distinctId is null and never calls fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    stubDenoEnv({POSTHOG_PROJECT_TOKEN: 'phc_test'})

    await capturePostHogEvent({event: 'agent_run_dispatched', distinctId: null})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('null distinct_id'),
      expect.any(Object),
    )
  })

  it('no-ops silently when POSTHOG_PROJECT_TOKEN is unset (no fetch, no warn)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    stubDenoEnv({})

    await capturePostHogEvent({event: 'agent_run_dispatched', distinctId: 'user-1'})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('falls back to legacy POSTHOG_API_KEY when POSTHOG_PROJECT_TOKEN is missing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('', {status: 200}))
    vi.stubGlobal('fetch', fetchSpy)
    stubDenoEnv({POSTHOG_API_KEY: 'phc_legacy'})

    await capturePostHogEvent({event: 'agent_run_started', distinctId: 'user-1'})

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.api_key).toBe('phc_legacy')
  })

  it('swallows thrown fetch errors and logs a warning', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchSpy)
    stubDenoEnv({POSTHOG_PROJECT_TOKEN: 'phc_test'})

    await expect(
      capturePostHogEvent({event: 'agent_run_failed', distinctId: 'user-1'}),
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('capture failed'),
      expect.objectContaining({event: 'agent_run_failed'}),
    )
  })

  it('swallows non-2xx responses and logs a warning', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('boom', {status: 503}))
    vi.stubGlobal('fetch', fetchSpy)
    stubDenoEnv({POSTHOG_PROJECT_TOKEN: 'phc_test'})

    await capturePostHogEvent({event: 'agent_run_completed', distinctId: 'user-1'})

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('non-2xx'),
      expect.objectContaining({event: 'agent_run_completed', status: 503}),
    )
  })

  it('posts the canonical PostHog capture body with surface + release', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('', {status: 200}))
    vi.stubGlobal('fetch', fetchSpy)
    stubDenoEnv({
      POSTHOG_PROJECT_TOKEN: 'phc_test',
      POSTHOG_HOST: 'https://us.i.posthog.com',
      GIT_SHA: 'abc1234',
    })

    await capturePostHogEvent({
      event: 'agent_run_dispatched',
      distinctId: 'user-1',
      properties: {organization_id: 'org-1', dispatch_reason: 'manual'},
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      api_key: 'phc_test',
      event: 'agent_run_dispatched',
      distinct_id: 'user-1',
      properties: {
        organization_id: 'org-1',
        dispatch_reason: 'manual',
        rocketboard_surface: 'edge',
        $release: 'abc1234',
        distinct_id: 'user-1',
      },
    })
  })
})
