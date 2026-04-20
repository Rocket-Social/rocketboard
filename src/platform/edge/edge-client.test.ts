import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {z} from 'zod'

import {callEdgeFunction, streamEdgeFunction} from './edge-client'

vi.mock('../../app/config', () => ({
  appConfig: {
    supabase: {
      publishableKey: 'pk-test',
      url: 'https://test.supabase.co',
    },
  },
}))

vi.mock('../auth/auth-adapter', () => ({
  authAdapter: {
    getAccessToken: vi.fn(),
  },
}))

const {authAdapter} = await import('../auth/auth-adapter')
const getAccessTokenMock = vi.mocked(authAdapter.getAccessToken)

describe('callEdgeFunction', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    getAccessTokenMock.mockResolvedValue('token-1')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('posts JSON body with Authorization + apikey headers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ok: true}), {status: 200}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await callEdgeFunction<{ok: boolean}>('my-fn', {body: {hello: 'world'}})

    expect(result).toEqual({ok: true})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://test.supabase.co/functions/v1/my-fn')
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify({hello: 'world'}))
    const headers = options.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer token-1')
    expect(headers.apikey).toBe('pk-test')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('retries once with a refreshed token on 401', async () => {
    getAccessTokenMock.mockResolvedValueOnce('token-stale').mockResolvedValueOnce('token-fresh')
    const responses = [
      new Response(JSON.stringify({error: 'expired'}), {status: 401}),
      new Response(JSON.stringify({ok: true}), {status: 200}),
    ]
    const fetchMock = vi.fn(async () => responses.shift()!)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await callEdgeFunction<{ok: boolean}>('my-fn', {body: {}})

    expect(result).toEqual({ok: true})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(1, {forceRefresh: false})
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(2, {forceRefresh: true})
    const secondHeaders = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(secondHeaders.Authorization).toBe('Bearer token-fresh')
  })

  it('throws EdgeFunctionError with server error message on non-ok responses', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({error: 'bad input'}), {status: 400}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(callEdgeFunction('my-fn', {body: {}})).rejects.toMatchObject({
      message: 'bad input',
      name: 'EdgeFunctionError',
      status: 400,
    })
  })

  it('falls back to errorFallback when body has no error field', async () => {
    const fetchMock = vi.fn(async () => new Response('not-json', {status: 500}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(
      callEdgeFunction('my-fn', {body: {}, errorFallback: 'Could not reach server'}),
    ).rejects.toThrow('Could not reach server')
  })

  it('throws when Supabase URL is missing', async () => {
    getAccessTokenMock.mockResolvedValueOnce(null)
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(callEdgeFunction('my-fn', {body: {}})).rejects.toThrow('Not authenticated')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates the response against a Zod schema', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({count: 3}), {status: 200}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const schema = z.object({count: z.number()})

    const result = await callEdgeFunction<{count: number}>('my-fn', {body: {}, responseSchema: schema})

    expect(result.count).toBe(3)
  })

  it('surfaces Zod validation errors when the response shape is wrong', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({count: 'three'}), {status: 200}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const schema = z.object({count: z.number()})

    await expect(
      callEdgeFunction('my-fn', {body: {}, responseSchema: schema}),
    ).rejects.toThrow()
  })

  it('applies transformResponse before Zod validation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({user_name: 'alice'}), {status: 200}))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const schema = z.object({userName: z.string()})

    const result = await callEdgeFunction<{userName: string}>('my-fn', {
      body: {},
      responseSchema: schema,
      transformResponse: (data) => ({userName: (data as {user_name: string}).user_name}),
    })

    expect(result.userName).toBe('alice')
  })

  it('supports GET method with searchParams', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ok: true}), {status: 200}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await callEdgeFunction('my-fn', {
      method: 'GET',
      searchParams: new URLSearchParams({foo: 'bar'}),
    })

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://test.supabase.co/functions/v1/my-fn?foo=bar')
    expect(options.method).toBe('GET')
    expect(options.body).toBeUndefined()
  })

  it('forwards AbortSignal', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ok: true}), {status: 200}))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await callEdgeFunction('my-fn', {body: {}, signal: controller.signal})

    const options = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(options.signal).toBe(controller.signal)
  })
})

describe('streamEdgeFunction', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    getAccessTokenMock.mockResolvedValue('token-1')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('returns the raw Response so callers can read the body stream', async () => {
    const stream = new Response('data: hi\n\n', {status: 200})
    const fetchMock = vi.fn(async () => stream)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await streamEdgeFunction('my-fn', {body: {}})

    expect(response).toBe(stream)
  })

  it('retries once with refreshed token on 401', async () => {
    getAccessTokenMock.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh')
    const responses = [
      new Response('unauthorized', {status: 401}),
      new Response('ok', {status: 200}),
    ]
    const fetchMock = vi.fn(async () => responses.shift()!)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await streamEdgeFunction('my-fn', {body: {}})

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
