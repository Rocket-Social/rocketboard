import { afterEach, describe, expect, it, vi } from 'vitest'

const { getAccessTokenMock } = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(),
}))

vi.mock('../../app/config', () => ({
  appConfig: {
    supabase: {
      publishableKey: 'publishable-key',
      url: 'https://example.supabase.co',
    },
  },
}))

vi.mock('../../platform/auth/auth-adapter', () => ({
  authAdapter: {
    getAccessToken: getAccessTokenMock,
  },
}))

import { getApiKeyStatus } from './api-key.repository'

describe('getApiKeyStatus', () => {
  afterEach(() => {
    getAccessTokenMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('uses a refreshed access token when calling ai-key-manage', async () => {
    getAccessTokenMock.mockResolvedValue('fresh-token')

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      capabilities: {
        anthropicSubscriptionEnabled: true,
      },
      orgKeys: [],
      userKeys: [
        {
          credentialKind: 'api_key',
          disabledReason: null,
          lastFour: '1234',
          provider: 'openai',
          setAt: '2026-04-12T18:00:00.000Z',
        },
      ],
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getApiKeyStatus('org-1')).resolves.toEqual({
      capabilities: {
        anthropicSubscriptionEnabled: true,
      },
      orgKeys: [],
      userKeys: [
        {
          credentialKind: 'api_key',
          disabledReason: null,
          lastFour: '1234',
          provider: 'openai',
          setAt: '2026-04-12T18:00:00.000Z',
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/ai-key-manage',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'get_status',
          organizationId: 'org-1',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
          apikey: 'publishable-key',
        }),
        method: 'POST',
      }),
    )
  })

  it('fails fast when there is no authenticated access token', async () => {
    getAccessTokenMock.mockResolvedValue(null)

    await expect(getApiKeyStatus('org-1')).rejects.toThrow('Not authenticated')
  })

  it('refreshes the session and retries once when ai-key-manage returns 401', async () => {
    getAccessTokenMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        capabilities: {
          anthropicSubscriptionEnabled: false,
        },
        orgKeys: [],
        userKeys: [],
      }), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getApiKeyStatus('org-1')).resolves.toEqual({
      capabilities: {
        anthropicSubscriptionEnabled: false,
      },
      orgKeys: [],
      userKeys: [],
    })

    expect(getAccessTokenMock).toHaveBeenNthCalledWith(1, { forceRefresh: false })
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(2, { forceRefresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://example.supabase.co/functions/v1/ai-key-manage',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
        }),
      }),
    )
  })

  it('throws an auth error when ai-key-manage still returns 401 after a forced refresh', async () => {
    getAccessTokenMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getApiKeyStatus('org-1')).rejects.toThrow('Not authenticated')

    expect(getAccessTokenMock).toHaveBeenNthCalledWith(1, { forceRefresh: false })
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(2, { forceRefresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
