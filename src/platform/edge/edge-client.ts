import type {ZodType} from 'zod'

import {appConfig} from '../../app/config'
import {authAdapter} from '../auth/auth-adapter'

export type EdgeRequestInit<TResponse> = {
  body?: Record<string, unknown>
  errorFallback?: string
  method?: 'GET' | 'POST'
  responseSchema?: ZodType<TResponse>
  searchParams?: URLSearchParams
  signal?: AbortSignal
  transformResponse?: (data: unknown) => TResponse
}

export class EdgeFunctionError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.status = status
    this.data = data
  }
}

function extractFunctionErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') {
    return fallback
  }

  const objectData = data as {error?: string; message?: string}
  return objectData.message ?? objectData.error ?? fallback
}

async function buildAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const accessToken = await authAdapter.getAccessToken({forceRefresh})

  if (!accessToken) {
    throw new Error('Not authenticated')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  }

  if (appConfig.supabase.publishableKey) {
    headers.apikey = appConfig.supabase.publishableKey
  }

  return headers
}

function buildEdgeUrl(name: string, searchParams?: URLSearchParams): string {
  if (!appConfig.supabase.url) {
    throw new Error('Supabase URL is not configured.')
  }

  const url = new URL(`${appConfig.supabase.url}/functions/v1/${name}`)
  if (searchParams) {
    url.search = searchParams.toString()
  }
  return url.toString()
}

async function issueEdgeRequest<TResponse>(
  name: string,
  init: EdgeRequestInit<TResponse>,
  forceRefresh: boolean,
): Promise<Response> {
  const authHeaders = await buildAuthHeaders(forceRefresh)
  const method = init.method ?? 'POST'
  const hasBody = init.body !== undefined

  const headers: Record<string, string> = {...authHeaders}
  if (hasBody) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(buildEdgeUrl(name, init.searchParams), {
    body: hasBody ? JSON.stringify(init.body) : undefined,
    headers,
    method,
    signal: init.signal,
  })
}

export async function callEdgeFunction<TResponse = unknown>(
  name: string,
  init: EdgeRequestInit<TResponse> = {},
): Promise<TResponse> {
  let response = await issueEdgeRequest(name, init, false)

  if (response.status === 401) {
    response = await issueEdgeRequest(name, init, true)
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const defaultForStatus =
      response.status === 401
        ? 'Not authenticated'
        : init.errorFallback ?? `${name} failed`
    throw new EdgeFunctionError(
      extractFunctionErrorMessage(data, defaultForStatus),
      response.status,
      data,
    )
  }

  if (init.transformResponse) {
    const transformed = init.transformResponse(data)
    if (init.responseSchema) {
      return init.responseSchema.parse(transformed)
    }
    return transformed
  }

  if (init.responseSchema) {
    return init.responseSchema.parse(data)
  }

  return data as TResponse
}

export type StreamEdgeFunctionInit = {
  body?: Record<string, unknown>
  method?: 'GET' | 'POST'
  searchParams?: URLSearchParams
  signal?: AbortSignal
}

export async function streamEdgeFunction(
  name: string,
  init: StreamEdgeFunctionInit = {},
): Promise<Response> {
  let response = await issueEdgeRequest(name, init, false)

  if (response.status === 401) {
    response = await issueEdgeRequest(name, init, true)
  }

  return response
}
