import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendChatMessage } from './ai-chat.repository'

const PAGE_ID = '44444444-4444-4444-8444-444444444444'

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

function createSseResponse(lines: string[]) {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n`))
        }
        controller.close()
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'X-Conversation-Id': 'conversation-1',
      },
      status: 200,
    },
  )
}

describe('sendChatMessage', () => {
  afterEach(() => {
    getAccessTokenMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('streams Gemini SSE chunks to onToken and onComplete', async () => {
    getAccessTokenMock.mockResolvedValue('fresh-token')

    const fetchMock = vi.fn().mockResolvedValue(createSseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    await sendChatMessage(
      {
        message: 'Hi',
        personaId: 'persona-1',
        surface: 'global',
      },
      {
        onComplete,
        onError,
        onToken,
      },
    )

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('Hello world', 'conversation-1')
    })

    expect(onToken).toHaveBeenNthCalledWith(1, 'Hello')
    expect(onToken).toHaveBeenNthCalledWith(2, ' world')
    expect(onError).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/ai-chat',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
          apikey: 'publishable-key',
        }),
      }),
    )
  })

  it('surfaces a missing access token without calling the chat function', async () => {
    getAccessTokenMock.mockResolvedValue(null)

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    await sendChatMessage(
      {
        message: 'Hi',
        personaId: 'persona-1',
        surface: 'global',
      },
      {
        onComplete,
        onError,
        onToken,
      },
    )

    expect(onError).toHaveBeenCalledWith('Not authenticated')
    expect(onToken).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes the session and retries once when ai-chat returns 401', async () => {
    getAccessTokenMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(createSseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Recovered"}]}}]}',
      ]))
    vi.stubGlobal('fetch', fetchMock)

    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    await sendChatMessage(
      {
        message: 'Hi',
        personaId: 'persona-1',
        surface: 'global',
      },
      {
        onComplete,
        onError,
        onToken,
      },
    )

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('Recovered', 'conversation-1')
    })

    expect(getAccessTokenMock).toHaveBeenNthCalledWith(1, { forceRefresh: false })
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(2, { forceRefresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://example.supabase.co/functions/v1/ai-chat',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
        }),
      }),
    )
    expect(onError).not.toHaveBeenCalled()
    expect(onToken).toHaveBeenCalledWith('Recovered')
  })

  it('surfaces an auth error when ai-chat still returns 401 after a forced refresh', async () => {
    getAccessTokenMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const onToken = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    await sendChatMessage(
      {
        message: 'Hi',
        personaId: 'persona-1',
        surface: 'global',
      },
      {
        onComplete,
        onError,
        onToken,
      },
    )

    expect(getAccessTokenMock).toHaveBeenNthCalledWith(1, { forceRefresh: false })
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(2, { forceRefresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith('Not authenticated')
    expect(onToken).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('includes the wiki surface resource context in the ai-chat request body', async () => {
    getAccessTokenMock.mockResolvedValue('fresh-token')

    const fetchMock = vi.fn().mockResolvedValue(createSseResponse([
      'data: [DONE]',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await sendChatMessage(
      {
        message: 'Hi',
        personaId: 'persona-1',
        surface: 'wiki',
        surfaceContext: {
          resourceId: `wiki:page:${PAGE_ID}`,
          wikiPageTitle: 'Roadmap',
          wikiView: 'page',
        },
      },
      {
        onComplete: vi.fn(),
        onError: vi.fn(),
        onToken: vi.fn(),
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      message: 'Hi',
      personaId: 'persona-1',
      surface: 'wiki',
      surfaceContext: {
        resourceId: `wiki:page:${PAGE_ID}`,
        wikiPageTitle: 'Roadmap',
        wikiView: 'page',
      },
    })
  })
})
