import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import process from 'node:process'

import {createConfig} from './config.js'
import {
  formatAuthUserName,
  getSessionStatus,
  loadAuthenticatedClient,
  loginWithMagicLink,
  logout,
  suggestEmailFromEnvironment,
} from './session.js'

type SetupScope = 'local' | 'project'

export type ClaudeSetupOptions = {
  cwd: string
  email: string | null
  force: boolean
  openBrowser: boolean
  scope: SetupScope
  supabasePublishableKey: string | null
  supabaseUrl: string | null
  writesEnabled: boolean
}

export type ClaudeSetupResult = {
  configLocation: string
  installMethod: 'claude-cli' | 'file'
  scope: SetupScope
  user: {
    email: string | null
    id: string
    name: string
  }
  writesEnabled: boolean
}

type StdioServerConfig = {
  args: string[]
  command: string
  env: Record<string, string>
  type: 'stdio'
}

const LOCAL_CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json')
const SERVER_NAME = 'rocketboard'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return /^[^@\s]+@[^@\s]+$/.test(normalized) ? normalized : null
}

function readProcessEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }

  return null
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function findRepoRoot(startDir: string) {
  let currentDir = await fs.realpath(path.resolve(startDir)).catch(() => path.resolve(startDir))

  while (true) {
    if (await fileExists(path.join(currentDir, 'packages', 'mcp-server', 'package.json'))) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break
    }

    currentDir = parentDir
  }

  throw new Error('Rocketboard MCP setup must run from inside the Rocketboard repository.')
}

function parseDotenv(raw: string) {
  const result: Record<string, string> = {}

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const normalizedLine = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed
    const separatorIndex = normalizedLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = normalizedLine.slice(0, separatorIndex).trim()
    let value = normalizedLine.slice(separatorIndex + 1).trim()
    if (!key) {
      continue
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

async function readDotenvFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return parseDotenv(raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

async function resolveSupabaseConfig(options: {
  explicitPublishableKey: string | null
  explicitUrl: string | null
  repoRoot: string
}): Promise<{
  supabasePublishableKey: string
  supabaseUrl: string
}> {
  const dotEnv = await readDotenvFile(path.join(options.repoRoot, '.env'))
  const dotEnvLocal = await readDotenvFile(path.join(options.repoRoot, '.env.local'))

  const supabaseUrl =
    options.explicitUrl?.trim() ||
    readProcessEnv('SUPABASE_URL', 'VITE_SUPABASE_URL') ||
    dotEnvLocal.SUPABASE_URL ||
    dotEnvLocal.VITE_SUPABASE_URL ||
    dotEnv.SUPABASE_URL ||
    dotEnv.VITE_SUPABASE_URL ||
    null

  const supabasePublishableKey =
    options.explicitPublishableKey?.trim() ||
    readProcessEnv('SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY') ||
    dotEnvLocal.SUPABASE_PUBLISHABLE_KEY ||
    dotEnvLocal.VITE_SUPABASE_PUBLISHABLE_KEY ||
    dotEnv.SUPABASE_PUBLISHABLE_KEY ||
    dotEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    null

  const missingKeys: string[] = []
  if (!supabaseUrl) {
    missingKeys.push('SUPABASE_URL')
  }
  if (!supabasePublishableKey) {
    missingKeys.push('SUPABASE_PUBLISHABLE_KEY')
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `Rocketboard MCP setup could not resolve ${missingKeys.join(
        ' and ',
      )}. Add them to .env.local or pass --supabase-url and --supabase-publishable-key explicitly.`,
    )
  }

  const resolvedSupabaseUrl = supabaseUrl
  const resolvedSupabasePublishableKey = supabasePublishableKey
  if (!resolvedSupabaseUrl || !resolvedSupabasePublishableKey) {
    throw new Error('Rocketboard MCP setup could not normalize the resolved Supabase configuration.')
  }

  return {
    supabasePublishableKey: resolvedSupabasePublishableKey,
    supabaseUrl: resolvedSupabaseUrl,
  }
}

function isRecoverableSessionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.message.includes('No Rocketboard MCP session found') ||
    error.message.includes('Stored Rocketboard MCP session is invalid')
  )
}

async function resolveSetupEmail(sessionFileConfig: Parameters<typeof getSessionStatus>[0], explicitEmail: string | null) {
  const directEmail = normalizeEmail(explicitEmail)
  if (directEmail) {
    return directEmail
  }

  const sessionStatus = await getSessionStatus(sessionFileConfig)
  if (sessionStatus.authenticated) {
    const sessionEmail = normalizeEmail(sessionStatus.user.email)
    if (sessionEmail) {
      return sessionEmail
    }
  }

  return normalizeEmail(suggestEmailFromEnvironment())
}

async function ensureAuthenticatedUser(
  config: ReturnType<typeof createConfig>,
  options: {
    email: string | null
    force: boolean
    openBrowser: boolean
  },
) {
  if (!options.force) {
    try {
      return await loadAuthenticatedClient(config)
    } catch (error) {
      if (!isRecoverableSessionError(error)) {
        throw error
      }
    }
  }

  const email = await resolveSetupEmail(config, options.email)
  if (!email) {
    throw new Error(
      'Rocketboard MCP setup needs your email to start the magic-link sign-in flow. Re-run with `npm run mcp:setup -- --email you@company.com`.',
    )
  }

  if (options.force) {
    await logout(config)
  }

  const loginResult = await loginWithMagicLink(config, email, {
    openBrowser: options.openBrowser,
  })
  console.log(loginResult.message)

  return loadAuthenticatedClient(config)
}

async function runCommand(command: string, args: string[]) {
  return await new Promise<{stderr: string; stdout: string}>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })

    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve({stderr, stdout})
        return
      }

      reject(
        new Error(
          `Command failed with exit code ${code}.${stderr.trim() ? ` ${stderr.trim()}` : ''}${
            stdout.trim() ? ` ${stdout.trim()}` : ''
          }`,
        ),
      )
    })
  })
}

async function ensureDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), {recursive: true})
}

async function writeJsonAtomic(filePath: string, data: unknown) {
  await ensureDirectory(filePath)
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, filePath)
}

async function readJsonFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function installLocalScopeConfig(repoRoot: string, serverConfig: StdioServerConfig) {
  const existingRoot = await readJsonFile(LOCAL_CLAUDE_CONFIG_PATH)
  if (existingRoot !== null && !isPlainObject(existingRoot)) {
    throw new Error(`Claude config at ${LOCAL_CLAUDE_CONFIG_PATH} is not a JSON object.`)
  }

  const rootObject = isPlainObject(existingRoot) ? {...existingRoot} : {}
  if (rootObject.projects !== undefined && !isPlainObject(rootObject.projects)) {
    throw new Error(`Claude config at ${LOCAL_CLAUDE_CONFIG_PATH} has a non-object \`projects\` field.`)
  }

  const existingProjects = isPlainObject(rootObject.projects) ? {...rootObject.projects} : {}
  const rawProject = existingProjects[repoRoot]
  if (rawProject !== undefined && !isPlainObject(rawProject)) {
    throw new Error(`Claude config at ${LOCAL_CLAUDE_CONFIG_PATH} has a non-object project entry for ${repoRoot}.`)
  }

  const existingProject = isPlainObject(rawProject) ? {...rawProject} : {}
  if (existingProject.mcpServers !== undefined && !isPlainObject(existingProject.mcpServers)) {
    throw new Error(`Claude config at ${LOCAL_CLAUDE_CONFIG_PATH} has a non-object \`mcpServers\` field for ${repoRoot}.`)
  }

  const existingServers = isPlainObject(existingProject.mcpServers) ? {...existingProject.mcpServers} : {}

  existingServers[SERVER_NAME] = serverConfig
  existingProject.mcpServers = existingServers
  existingProjects[repoRoot] = existingProject
  rootObject.projects = existingProjects

  await writeJsonAtomic(LOCAL_CLAUDE_CONFIG_PATH, rootObject)

  return LOCAL_CLAUDE_CONFIG_PATH
}

async function installProjectScopeConfig(repoRoot: string, serverConfig: StdioServerConfig) {
  const projectConfigPath = path.join(repoRoot, '.mcp.json')
  const existingRoot = await readJsonFile(projectConfigPath)
  if (existingRoot !== null && !isPlainObject(existingRoot)) {
    throw new Error(`Project MCP config at ${projectConfigPath} is not a JSON object.`)
  }

  const rootObject = isPlainObject(existingRoot) ? {...existingRoot} : {}
  if (rootObject.mcpServers !== undefined && !isPlainObject(rootObject.mcpServers)) {
    throw new Error(`Project MCP config at ${projectConfigPath} has a non-object \`mcpServers\` field.`)
  }

  const existingServers = isPlainObject(rootObject.mcpServers) ? {...rootObject.mcpServers} : {}

  existingServers[SERVER_NAME] = serverConfig
  rootObject.mcpServers = existingServers

  await writeJsonAtomic(projectConfigPath, rootObject)

  return projectConfigPath
}

async function installWithClaudeCli(scope: SetupScope, serverConfig: StdioServerConfig) {
  try {
    await runCommand('claude', ['mcp', 'add-json', '--scope', scope, SERVER_NAME, JSON.stringify(serverConfig)])
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Claude Code CLI could not install the Rocketboard MCP entry automatically. ${message}`)
  }
}

async function installClaudeConfig(options: {
  repoRoot: string
  scope: SetupScope
  serverConfig: StdioServerConfig
}) {
  const installedWithClaudeCli = await installWithClaudeCli(options.scope, options.serverConfig)
  if (installedWithClaudeCli) {
    return {
      configLocation:
        options.scope === 'local' ? `${LOCAL_CLAUDE_CONFIG_PATH} (current project scope)` : path.join(options.repoRoot, '.mcp.json'),
      installMethod: 'claude-cli' as const,
    }
  }

  const configLocation =
    options.scope === 'local'
      ? await installLocalScopeConfig(options.repoRoot, options.serverConfig)
      : await installProjectScopeConfig(options.repoRoot, options.serverConfig)

  return {
    configLocation,
    installMethod: 'file' as const,
  }
}

async function buildServerConfig(options: {
  repoRoot: string
  supabasePublishableKey: string
  supabaseUrl: string
  writesEnabled: boolean
}) {
  const serverScriptPath = path.join(options.repoRoot, 'packages', 'mcp-server', 'dist', 'cli.js')
  if (!(await fileExists(serverScriptPath))) {
    throw new Error(`Rocketboard MCP server build not found at ${serverScriptPath}. Run \`npm run mcp:build\` first.`)
  }

  const env: Record<string, string> = {
    SUPABASE_PUBLISHABLE_KEY: options.supabasePublishableKey,
    SUPABASE_URL: options.supabaseUrl,
  }

  if (options.writesEnabled) {
    env.ROCKETBOARD_MCP_ENABLE_WRITES = 'true'
  }

  return {
    args: [serverScriptPath, 'serve'],
    command: process.execPath,
    env,
    type: 'stdio' as const,
  }
}

export async function runClaudeSetup(options: ClaudeSetupOptions): Promise<ClaudeSetupResult> {
  const repoRoot = await findRepoRoot(options.cwd)
  const supabaseConfig = await resolveSupabaseConfig({
    explicitPublishableKey: options.supabasePublishableKey,
    explicitUrl: options.supabaseUrl,
    repoRoot,
  })

  const config = createConfig({
    supabasePublishableKey: supabaseConfig.supabasePublishableKey,
    supabaseUrl: supabaseConfig.supabaseUrl,
    writesEnabled: options.writesEnabled,
  })

  const authenticatedClient = await ensureAuthenticatedUser(config, {
    email: options.email,
    force: options.force,
    openBrowser: options.openBrowser,
  })

  const serverConfig = await buildServerConfig({
    repoRoot,
    supabasePublishableKey: supabaseConfig.supabasePublishableKey,
    supabaseUrl: supabaseConfig.supabaseUrl,
    writesEnabled: options.writesEnabled,
  })

  const installation = await installClaudeConfig({
    repoRoot,
    scope: options.scope,
    serverConfig,
  })

  return {
    configLocation: installation.configLocation,
    installMethod: installation.installMethod,
    scope: options.scope,
    user: {
      email: authenticatedClient.user.email ?? null,
      id: authenticatedClient.user.id,
      name: formatAuthUserName(authenticatedClient.user),
    },
    writesEnabled: options.writesEnabled,
  }
}
