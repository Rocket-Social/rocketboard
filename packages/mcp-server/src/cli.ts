#!/usr/bin/env node

import readline from 'node:readline/promises'
import process from 'node:process'

import {loadConfig, loadSessionConfig} from './config.js'
import {serveHostedRocketboardMcpHttp} from './http.js'
import {serveRocketboardMcp} from './server.js'
import {RocketboardService} from './service.js'
import {runClaudeSetup} from './setup.js'
import {
  getSessionStatus,
  loadAuthenticatedClient,
  loginWithMagicLink,
  logout,
  suggestEmailFromEnvironment,
} from './session.js'

function printUsage() {
  console.log(`Usage:
  rocketboard-mcp serve
  rocketboard-mcp serve-http [--host 127.0.0.1] [--port 8787]
  rocketboard-mcp auth login [email] [--no-open]
  rocketboard-mcp auth logout
  rocketboard-mcp auth status
  rocketboard-mcp setup claude [--writes] [--scope local|project] [--email you@company.com] [--no-open] [--force]

Advanced setup flags:
  --supabase-url https://your-project.supabase.co
  --supabase-publishable-key sb_publishable_xxx`)
}

async function promptForEmail() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const suggestion = suggestEmailFromEnvironment()
    const question = suggestion ? `Email [${suggestion}]: ` : 'Email: '
    const response = (await rl.question(question)).trim()
    return response || suggestion
  } finally {
    rl.close()
  }
}

function getOptionValue(args: string[], name: string) {
  const prefix = `${name}=`
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === name) {
      return args[index + 1] ?? null
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length)
    }
  }
  return null
}

function getPositionalArgs(args: string[]) {
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (!value.startsWith('-')) {
      positional.push(value)
      continue
    }
    if ((value === '--email' || value === '-e') && args[index + 1]) {
      index += 1
    }
  }
  return positional
}

function hasFlag(args: string[], name: string) {
  return args.includes(name)
}

async function runServe() {
  const config = loadConfig()
  const {client, user} = await loadAuthenticatedClient(config)
  const service = new RocketboardService(client, user, config.writesEnabled)
  await serveRocketboardMcp(service)
}

async function runServeHttp(args: string[]) {
  const config = loadConfig()
  const rawPort = getOptionValue(args, '--port')
  const port =
    rawPort && rawPort.trim().length > 0 ? Number.parseInt(rawPort, 10) : undefined

  if (typeof port === 'number' && (!Number.isFinite(port) || port <= 0)) {
    throw new Error(`Invalid --port value: ${rawPort}`)
  }

  await serveHostedRocketboardMcpHttp(config, {
    host: getOptionValue(args, '--host') ?? undefined,
    port,
  })
}

async function runAuth(args: string[]) {
  const sessionConfig = loadSessionConfig()
  const subcommand = args[0]

  switch (subcommand) {
    case 'login': {
      const config = loadConfig()
      const positional = getPositionalArgs(args.slice(1))
      const email = positional[0] ?? getOptionValue(args.slice(1), '--email') ?? getOptionValue(args.slice(1), '-e') ?? (await promptForEmail())
      if (!email) {
        throw new Error('Email is required to start the Rocketboard MCP login flow.')
      }

      const result = await loginWithMagicLink(config, email, {
        openBrowser: !args.includes('--no-open'),
      })
      console.log(result.message)
      return
    }
    case 'logout': {
      await logout(sessionConfig)
      console.log(`Removed the local Rocketboard MCP session at ${sessionConfig.sessionFilePath}.`)
      return
    }
    case 'status': {
      const status = await getSessionStatus(sessionConfig)
      if (!status.authenticated) {
        console.log(`No Rocketboard MCP session found at ${status.sessionFilePath}.`)
        return
      }

      console.log(`Authenticated as ${status.user.name} (${status.user.email ?? status.user.id}).`)
      console.log(`Session file: ${status.sessionFilePath}`)
      console.log(`Expires at: ${status.expiresAt ?? 'unknown'}`)
      return
    }
    default:
      throw new Error(`Unknown auth subcommand: ${subcommand ?? '(missing)'}`)
  }
}

async function runSetup(args: string[]) {
  const subcommand = args[0]

  switch (subcommand) {
    case 'claude': {
      const setupArgs = args.slice(1)
      const rawScope = getOptionValue(setupArgs, '--scope') ?? 'local'
      if (rawScope !== 'local' && rawScope !== 'project') {
        throw new Error(`Invalid setup scope: ${rawScope}. Expected \`local\` or \`project\`.`)
      }

      const result = await runClaudeSetup({
        cwd: process.cwd(),
        email: getOptionValue(setupArgs, '--email') ?? getOptionValue(setupArgs, '-e'),
        force: hasFlag(setupArgs, '--force'),
        openBrowser: !hasFlag(setupArgs, '--no-open'),
        scope: rawScope,
        supabasePublishableKey: getOptionValue(setupArgs, '--supabase-publishable-key'),
        supabaseUrl: getOptionValue(setupArgs, '--supabase-url'),
        writesEnabled: hasFlag(setupArgs, '--writes'),
      })

      console.log(
        `Installed Rocketboard MCP in Claude ${result.scope} scope via ${
          result.installMethod === 'claude-cli' ? 'the Claude CLI' : 'a direct config update'
        }.`,
      )
      console.log(`Config location: ${result.configLocation}`)
      console.log(`Writes enabled: ${result.writesEnabled ? 'yes' : 'no'}`)
      console.log(`Authenticated as ${result.user.name} (${result.user.email ?? result.user.id}).`)
      console.log('Try this in Claude Code: "List my Rocketboard workspaces."')
      return
    }
    default:
      throw new Error(`Unknown setup subcommand: ${subcommand ?? '(missing)'}`)
  }
}

async function main() {
  const [, , command, ...rest] = process.argv
  if (!command || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command === 'serve') {
    await runServe()
    return
  }

  if (command === 'serve-http') {
    await runServeHttp(rest)
    return
  }

  if (command === 'auth') {
    await runAuth(rest)
    return
  }

  if (command === 'setup') {
    await runSetup(rest)
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
