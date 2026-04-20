import type {Session} from '@supabase/supabase-js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {getSessionMock, refreshSessionMock} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}))

vi.mock('../supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
    },
  }),
}))

import {authAdapter} from './auth-adapter'

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token: 'cached-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    user: {} as Session['user'],
    ...overrides,
  } as Session
}

describe('authAdapter.getAccessToken', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T16:00:00.000Z'))
    getSessionMock.mockReset()
    refreshSessionMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the cached token when the current session is still fresh', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: buildSession({access_token: 'cached-token'}),
      },
    })

    await expect(authAdapter.getAccessToken()).resolves.toBe('cached-token')
    expect(refreshSessionMock).not.toHaveBeenCalled()
  })

  it('refreshes the session when the cached token is expired', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: buildSession({
          access_token: 'expired-token',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        }),
      },
    })
    refreshSessionMock.mockResolvedValue({
      data: {
        session: buildSession({access_token: 'fresh-token'}),
      },
      error: null,
    })

    await expect(authAdapter.getAccessToken()).resolves.toBe('fresh-token')
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when the cached token is expired and refresh fails', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: buildSession({
          access_token: 'expired-token',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        }),
      },
    })
    refreshSessionMock.mockResolvedValue({
      data: {
        session: buildSession({
          access_token: 'expired-token',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        }),
      },
      error: new Error('refresh failed'),
    })

    await expect(authAdapter.getAccessToken()).resolves.toBeNull()
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('forces a session refresh when requested even if the cached token looks fresh', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: buildSession({access_token: 'cached-token'}),
      },
    })
    refreshSessionMock.mockResolvedValue({
      data: {
        session: buildSession({access_token: 'fresh-token'}),
      },
      error: null,
    })

    await expect(authAdapter.getAccessToken({forceRefresh: true})).resolves.toBe('fresh-token')
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the cached token when a forced refresh cannot produce a usable one', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: buildSession({access_token: 'cached-token'}),
      },
    })
    refreshSessionMock.mockResolvedValue({
      data: {
        session: buildSession({
          access_token: 'expired-after-refresh',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        }),
      },
      error: new Error('refresh failed'),
    })

    await expect(authAdapter.getAccessToken({forceRefresh: true})).resolves.toBe('cached-token')
    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when a forced refresh fails and there is no usable cached token', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: buildSession({
          access_token: 'expired-token',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        }),
      },
    })
    refreshSessionMock.mockResolvedValue({
      data: {
        session: buildSession({
          access_token: 'expired-after-refresh',
          expires_at: Math.floor(Date.now() / 1000) - 10,
        }),
      },
      error: new Error('refresh failed'),
    })

    await expect(authAdapter.getAccessToken({forceRefresh: true})).resolves.toBeNull()
    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })
})
