import {beforeEach, describe, expect, it, vi} from 'vitest'

const posthogMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
  register: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('posthog-js', () => ({
  default: posthogMock,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.unstubAllEnvs()
})

describe('posthog monitoring', () => {
  it('redacts long tokens, auth callback params, and sensitive headers recursively', async () => {
    const {sanitizeMonitoringProperties} = await import('./posthog')

    expect(sanitizeMonitoringProperties({
      authorization: 'Bearer abc',
      headers: {
        cookie: 'session=abc',
      },
      nested: {
        token: '12345678901234567890123456789012',
      },
      currentUrl: 'https://rocketboard.app/auth/callback?code=oauth-code#access_token=short&refresh_token=refresh',
      invitePath: '/accept-invite/invite-token',
      values: ['safe', 'abcdefghijklmnopqrstuvwxyz123456'],
    })).toEqual({
      authorization: '[REDACTED]',
      headers: {
        cookie: '[REDACTED]',
      },
      nested: {
        token: '[REDACTED]',
      },
      currentUrl: 'https://rocketboard.app/auth/callback?code=[REDACTED]#access_token=[REDACTED]&refresh_token=[REDACTED]',
      invitePath: '/accept-invite/[REDACTED]',
      values: ['safe', '[REDACTED]'],
    })
  })

  it('scrubs SDK-added browser context without rewriting PostHog identity fields', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')

    const {initMonitoring} = await import('./posthog')
    initMonitoring()

    expect(posthogMock.init).toHaveBeenCalledOnce()

    const initOptions = posthogMock.init.mock.calls[0]?.[1] as {
      before_send?: (event: Record<string, unknown>) => Record<string, unknown>
    }
    expect(initOptions.before_send).toBeTypeOf('function')

    const event = {
      distinct_id: 'user_12345678901234567890123456789012',
      event: '$exception',
      properties: {
        distinct_id: 'user_12345678901234567890123456789012',
        $current_url: 'https://rocketboard.app/accept-invite/invite-token?autoAccept=1#access_token=short',
        $device_id: 'device_12345678901234567890123456789012',
        $exception_list: [{type: 'Error', value: 'boom'}],
        $pathname: '/accept-invite/invite-token',
        $referrer: 'https://rocketboard.app/auth/callback#refresh_token=refresh',
      },
    }

    expect(initOptions.before_send?.(event)).toEqual({
      distinct_id: 'user_12345678901234567890123456789012',
      event: '$exception',
      properties: {
        distinct_id: 'user_12345678901234567890123456789012',
        $current_url: 'https://rocketboard.app/accept-invite/[REDACTED]?autoAccept=1#access_token=[REDACTED]',
        $device_id: 'device_12345678901234567890123456789012',
        $exception_list: [{type: 'Error', value: 'boom'}],
        $pathname: '/accept-invite/[REDACTED]',
        $referrer: 'https://rocketboard.app/auth/callback#refresh_token=[REDACTED]',
      },
    })
  })
})
