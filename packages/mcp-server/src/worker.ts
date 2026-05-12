import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import {
  createHostedConfigFromEnv,
  createHostedRocketboardService,
  getHostedCorsHeaders,
  HostedAuthenticationError,
  type HostedRocketboardEnv,
} from './hosted.js'
import {createRocketboardMcpServer} from './server.js'

function withCorsHeaders(response: Response, origin: string | null) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(getHostedCorsHeaders(origin))) {
    headers.set(name, value)
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function jsonResponse(status: number, payload: Record<string, unknown>, origin: string | null) {
  return withCorsHeaders(
    new Response(JSON.stringify(payload), {
      headers: {'content-type': 'application/json; charset=utf-8'},
      status,
    }),
    origin,
  )
}

export function createRocketboardMcpWorker(env: HostedRocketboardEnv) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const origin = request.headers.get('origin')

      if (request.method === 'OPTIONS') {
        return withCorsHeaders(new Response(null, {status: 204}), origin)
      }

      if (url.pathname === '/health') {
        return jsonResponse(200, {status: 'ok'}, origin)
      }

      if (url.pathname !== '/mcp') {
        return jsonResponse(404, {error: 'Not found'}, origin)
      }

      try {
        const config = createHostedConfigFromEnv(env)
        const service = await createHostedRocketboardService(
          config,
          request.headers.get('authorization'),
        )
        const server = createRocketboardMcpServer(service, {distribution: 'hosted'})
        const transport = new WebStandardStreamableHTTPServerTransport()
        await server.connect(transport)

        return withCorsHeaders(await transport.handleRequest(request), origin)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return jsonResponse(
          error instanceof HostedAuthenticationError ? 401 : 500,
          {error: message},
          origin,
        )
      }
    },
  }
}

export default {
  fetch(request: Request, env: HostedRocketboardEnv): Promise<Response> {
    return createRocketboardMcpWorker(env).fetch(request)
  },
}
