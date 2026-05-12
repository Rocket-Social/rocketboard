import {createConfig, type RocketboardMcpConfig} from './config.js'
import {RocketboardService} from './service.js'
import {loadAuthenticatedClientFromAccessToken} from './session.js'

export class HostedAuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HostedAuthenticationError'
  }
}

export type HostedRocketboardEnv = {
  ROCKETBOARD_MCP_CALLBACK_HOST?: string
  SUPABASE_PUBLISHABLE_KEY?: string
  SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
  VITE_SUPABASE_URL?: string
}

export function createHostedConfigFromEnv(env: HostedRocketboardEnv): RocketboardMcpConfig {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const supabasePublishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Hosted Rocketboard MCP requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  return createConfig({
    callbackHost: env.ROCKETBOARD_MCP_CALLBACK_HOST,
    supabasePublishableKey,
    supabaseUrl,
    writesEnabled: true,
  })
}

export function getHostedCorsHeaders(origin: string | null = null) {
  return {
    'access-control-allow-headers':
      'Authorization, Content-Type, Last-Event-ID, mcp-protocol-version, mcp-session-id',
    'access-control-allow-methods': 'DELETE, GET, OPTIONS, POST',
    'access-control-allow-origin': origin ?? '*',
    'access-control-expose-headers': 'mcp-protocol-version, mcp-session-id',
    vary: 'Origin',
  }
}

export function requireBearerToken(authorizationHeader: string | null | undefined) {
  if (!authorizationHeader) {
    throw new HostedAuthenticationError(
      'Hosted Rocketboard MCP requires an Authorization: Bearer <token> header.',
    )
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/iu)
  if (!match) {
    throw new HostedAuthenticationError(
      'Hosted Rocketboard MCP expected an Authorization: Bearer <token> header.',
    )
  }

  const token = match[1]?.trim()
  if (!token) {
    throw new HostedAuthenticationError(
      'Hosted Rocketboard MCP expected a non-empty bearer token.',
    )
  }

  return token
}

export async function createHostedRocketboardService(
  config: RocketboardMcpConfig,
  authorizationHeader: string | null | undefined,
) {
  const token = requireBearerToken(authorizationHeader)
  let authenticatedClient
  try {
    authenticatedClient = await loadAuthenticatedClientFromAccessToken(config, token)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new HostedAuthenticationError(message)
  }

  const {client, user} = authenticatedClient
  return new RocketboardService(client, user, true)
}
