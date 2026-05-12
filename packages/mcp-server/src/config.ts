import os from 'node:os'
import path from 'node:path'

export type RocketboardMcpConfig = {
  callbackHost: string
  sessionFilePath: string
  supabasePublishableKey: string
  supabaseUrl: string
  writesEnabled: boolean
}

export type RocketboardMcpSessionConfig = Pick<RocketboardMcpConfig, 'sessionFilePath'>

export type RocketboardMcpConfigInput = {
  callbackHost?: string
  sessionFilePath?: string
  supabasePublishableKey: string
  supabaseUrl: string
  writesEnabled?: boolean
}

function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

function readRequiredEnv(...names: string[]) {
  for (const name of names) {
    const value = readEnv(name)
    if (value) {
      return value
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`)
}

function resolveSessionFilePath() {
  const explicitPath = readEnv('ROCKETBOARD_MCP_SESSION_FILE')
  if (explicitPath) {
    return explicitPath
  }

  const configHome = readEnv('XDG_CONFIG_HOME') ?? path.join(os.homedir(), '.config')
  return path.join(configHome, 'rocketboard', 'mcp-session.json')
}

function readBooleanEnv(name: string) {
  const value = readEnv(name)
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function createConfig(input: RocketboardMcpConfigInput): RocketboardMcpConfig {
  return {
    callbackHost: input.callbackHost ?? '127.0.0.1',
    sessionFilePath: input.sessionFilePath ?? resolveSessionFilePath(),
    supabasePublishableKey: input.supabasePublishableKey,
    supabaseUrl: input.supabaseUrl,
    writesEnabled: input.writesEnabled ?? false,
  }
}

export function loadSessionConfig(): RocketboardMcpSessionConfig {
  return {
    sessionFilePath: resolveSessionFilePath(),
  }
}

export function loadConfig(): RocketboardMcpConfig {
  return createConfig({
    supabasePublishableKey: readRequiredEnv('SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'),
    supabaseUrl: readRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL'),
    writesEnabled: readBooleanEnv('ROCKETBOARD_MCP_ENABLE_WRITES'),
  })
}
