import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import process from 'node:process'

import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import type {RocketboardMcpConfig} from './config.js'
import {
  createHostedRocketboardService,
  getHostedCorsHeaders,
  HostedAuthenticationError,
} from './hosted.js'
import {createRocketboardMcpServer} from './server.js'

export type ServeRocketboardMcpHttpOptions = {
  host?: string
  port?: number
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  if (response.headersSent) {
    return
  }

  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function applyCorsHeaders(request: IncomingMessage, response: ServerResponse) {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : null
  const headers = getHostedCorsHeaders(origin)
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value)
  }
}

function resolveAuthorizationHeader(request: IncomingMessage) {
  return typeof request.headers.authorization === 'string'
    ? request.headers.authorization
    : null
}

export async function serveHostedRocketboardMcpHttp(
  config: RocketboardMcpConfig,
  options: ServeRocketboardMcpHttpOptions = {},
) {
  const host = options.host ?? process.env.ROCKETBOARD_MCP_HTTP_HOST ?? '127.0.0.1'
  const port = options.port ?? Number.parseInt(process.env.ROCKETBOARD_MCP_HTTP_PORT ?? process.env.MCP_PORT ?? '8787', 10)

  const server = createServer(async (request, response) => {
    applyCorsHeaders(request, response)

    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }

    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (url.pathname === '/health') {
      writeJson(response, 200, {status: 'ok'})
      return
    }

    if (url.pathname !== '/mcp') {
      writeJson(response, 404, {error: 'Not found'})
      return
    }

    try {
      const service = await createHostedRocketboardService(
        config,
        resolveAuthorizationHeader(request),
      )
      const server = createRocketboardMcpServer(service, {distribution: 'hosted'})
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })

      await server.connect(transport)
      await transport.handleRequest(request, response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeJson(
        response,
        error instanceof HostedAuthenticationError ? 401 : 500,
        {error: message},
      )
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  console.log(`Rocketboard hosted MCP listening on http://${host}:${port}/mcp`)
  console.log(`Health check: http://${host}:${port}/health`)

  return server
}

export async function closeHostedRocketboardMcpHttp(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}
