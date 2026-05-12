import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {URL} from 'node:url'
import type {Session, User} from '@supabase/supabase-js'
import {createClient, type SupabaseClient} from '@supabase/supabase-js'

import type {RocketboardMcpConfig, RocketboardMcpSessionConfig} from './config.js'

type SessionFilePayload = {
  savedAt: string
  session: Session
}

export type AuthenticatedClient = {
  client: SupabaseClient
  session: Session
  user: User
}

export type AccessTokenAuthenticatedClient = {
  client: SupabaseClient
  user: User
}

type CallbackResult = {
  message: string
  session: Session
}

const CALLBACK_TIMEOUT_MS = 10 * 60 * 1000

function createSupabaseClient(config: RocketboardMcpConfig) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: false,
    },
  })
}

function createSupabaseAccessTokenClient(config: RocketboardMcpConfig, accessToken: string) {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    accessToken: async () => accessToken,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function ensurePrivateDirectory(filePath: string) {
  const directoryPath = path.dirname(filePath)
  await fs.mkdir(directoryPath, {recursive: true})
  await fs.chmod(directoryPath, 0o700).catch(() => {})
}

async function persistSession(filePath: string, session: Session) {
  await ensurePrivateDirectory(filePath)
  const payload: SessionFilePayload = {
    savedAt: new Date().toISOString(),
    session,
  }

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), {encoding: 'utf8', mode: 0o600})
  await fs.chmod(filePath, 0o600).catch(() => {})
}

export function formatAuthUserName(user: User) {
  const fullName = user.user_metadata.full_name
  if (typeof fullName === 'string' && fullName.trim().length > 0) {
    return fullName.trim()
  }

  const alternateName = user.user_metadata.name
  if (typeof alternateName === 'string' && alternateName.trim().length > 0) {
    return alternateName.trim()
  }

  return user.email?.split('@')[0] ?? user.id
}

async function parseSessionFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const payload = JSON.parse(raw) as Partial<SessionFilePayload>
    return payload.session ?? null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function deleteSessionFile(filePath: string) {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

function openUrl(url: string) {
  const command =
    process.platform === 'darwin'
      ? {bin: 'open', args: [url]}
      : process.platform === 'win32'
        ? {bin: 'cmd', args: ['/c', 'start', '', url]}
        : {bin: 'xdg-open', args: [url]}

  try {
    const child = spawn(command.bin, command.args, {
      detached: true,
      stdio: 'ignore',
    })

    child.unref()
    return true
  } catch {
    return false
  }
}

function renderWaitingHtml(email: string) {
  const escapedEmail = email.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rocketboard MCP Login</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(160deg, #f8fafc, #e2e8f0);
        color: #0f172a;
      }
      main {
        width: min(32rem, calc(100vw - 2rem));
        padding: 2rem;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
      }
      h1 {
        margin-top: 0;
        font-size: 1.5rem;
      }
      p {
        line-height: 1.5;
      }
      code {
        padding: 0.15rem 0.35rem;
        border-radius: 0.35rem;
        background: #e2e8f0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Finish Rocketboard MCP sign-in</h1>
      <p>A magic link was sent to <code>${escapedEmail}</code>.</p>
      <p>Open the email and click the sign-in link. This window will complete automatically once Supabase redirects back to this local callback.</p>
    </main>
  </body>
</html>`
}

function renderCallbackHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rocketboard MCP Callback</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      main {
        width: min(28rem, calc(100vw - 2rem));
        padding: 2rem;
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
      }
      p {
        line-height: 1.5;
      }
      .muted {
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Completing sign-in…</h1>
      <p id="status">Waiting for the local Rocketboard MCP server to store your session.</p>
      <p class="muted">You can close this tab after success.</p>
    </main>
    <script>
      const status = document.getElementById('status')

      async function finish() {
        try {
          const response = await fetch('/callback/session', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
              hash: window.location.hash,
              search: window.location.search
            })
          })

          const payload = await response.json()
          if (!response.ok || !payload.ok) {
            throw new Error(payload.message || 'Authentication failed.')
          }

          status.textContent = payload.message || 'Sign-in complete. You can close this tab.'
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error)
        }
      }

      finish()
    </script>
  </body>
</html>`
}

async function readRequestBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function mergeAuthParams(search: string, hash: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)

  for (const [key, value] of hashParams.entries()) {
    if (!params.has(key)) {
      params.set(key, value)
    }
  }

  return params
}

async function finalizeSessionFromParams(client: SupabaseClient, params: URLSearchParams) {
  const authError = params.get('error_description') ?? params.get('error')
  if (authError) {
    throw new Error(authError)
  }

  if (params.get('access_token') && params.get('refresh_token')) {
    const {data, error} = await client.auth.setSession({
      access_token: params.get('access_token')!,
      refresh_token: params.get('refresh_token')!,
    })

    if (error) {
      throw error
    }

    if (!data.session) {
      throw new Error('Supabase did not return a session after the magic link callback.')
    }

    return data.session
  }

  if (params.get('code')) {
    const {data, error} = await client.auth.exchangeCodeForSession(params.get('code')!)
    if (error) {
      throw error
    }

    if (!data.session) {
      throw new Error('Supabase did not return a session after exchanging the authorization code.')
    }

    return data.session
  }

  if (params.get('token_hash') && params.get('type')) {
    const {data, error} = await client.auth.verifyOtp({
      token_hash: params.get('token_hash')!,
      type: params.get('type') as 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change' | 'email',
    })

    if (error) {
      throw error
    }

    if (!data.session) {
      throw new Error('Supabase did not return a session after verifying the email token.')
    }

    return data.session
  }

  throw new Error('The callback did not include a usable Supabase session payload.')
}

async function waitForMagicLinkSession(
  config: RocketboardMcpConfig,
  client: SupabaseClient,
  email: string,
  openBrowserWindow: boolean,
) {
  return new Promise<CallbackResult>((resolve, reject) => {
    let server: http.Server | null = null
    let settled = false

    const finish = async (result: CallbackResult | null, error: Error | null) => {
      if (settled) {
        return
      }

      settled = true
      if (server) {
        await new Promise<void>(closeResolve => {
          server!.close(() => closeResolve())
        }).catch(() => {})
      }

      if (error) {
        reject(error)
        return
      }

      if (!result) {
        reject(new Error('Rocketboard MCP did not receive a session from the callback flow.'))
        return
      }

      resolve(result)
    }

    server = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url ?? '/', `http://${config.callbackHost}`)

        if (request.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/waiting')) {
          response.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
          response.end(renderWaitingHtml(email))
          return
        }

        if (request.method === 'GET' && requestUrl.pathname === '/callback') {
          response.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
          response.end(renderCallbackHtml())
          return
        }

        if (request.method === 'POST' && requestUrl.pathname === '/callback/session') {
          const body = await readRequestBody(request)
          const payload = JSON.parse(body) as {hash?: string; search?: string}
          const params = mergeAuthParams(payload.search ?? '', payload.hash ?? '')
          const session = await finalizeSessionFromParams(client, params)

          await persistSession(config.sessionFilePath, session)

          response.writeHead(200, {'content-type': 'application/json; charset=utf-8'})
          response.end(
            JSON.stringify({
              message: 'Rocketboard MCP login complete. You can close this tab.',
              ok: true,
            }),
          )

          await finish(
            {
              message: `Authenticated as ${session.user.email ?? session.user.id}.`,
              session,
            },
            null,
          )
          return
        }

        response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'})
        response.end('Not found')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        response.writeHead(400, {'content-type': 'application/json; charset=utf-8'})
        response.end(JSON.stringify({message, ok: false}))
        await finish(null, new Error(message))
      }
    })

    server.listen(0, config.callbackHost, async () => {
      const address = server?.address()
      if (!address || typeof address === 'string') {
        await finish(null, new Error('Could not determine a callback port for Rocketboard MCP login.'))
        return
      }

      const callbackUrl = `http://${config.callbackHost}:${address.port}/callback`
      const waitingUrl = `http://${config.callbackHost}:${address.port}/waiting`

      const {error} = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: false,
        },
      })

      if (error) {
        await finish(null, error)
        return
      }

      if (openBrowserWindow) {
        openUrl(waitingUrl)
      }

      console.log(`Magic link sent to ${email}.`)
      console.log(`Waiting for the Supabase callback on ${callbackUrl}`)
      if (!openBrowserWindow) {
        console.log(`Open ${waitingUrl} in your browser if you want a local status page while you sign in.`)
      }
    })

    const timer = setTimeout(() => {
      void finish(null, new Error(`Timed out after ${Math.floor(CALLBACK_TIMEOUT_MS / 1000)} seconds waiting for the magic link callback.`))
    }, CALLBACK_TIMEOUT_MS)

    server.on('close', () => clearTimeout(timer))
    server.on('error', error => {
      void finish(null, error)
    })
  })
}

export async function loginWithMagicLink(
  config: RocketboardMcpConfig,
  emailInput: string,
  options?: {openBrowser?: boolean},
) {
  const email = emailInput.trim().toLowerCase()
  if (!email) {
    throw new Error('Email is required.')
  }

  const client = createSupabaseClient(config)
  const result = await waitForMagicLinkSession(config, client, email, options?.openBrowser !== false)
  return result
}

export async function loadAuthenticatedClient(config: RocketboardMcpConfig): Promise<AuthenticatedClient> {
  const storedSession = await parseSessionFile(config.sessionFilePath)
  if (!storedSession) {
    throw new Error(`No Rocketboard MCP session found at ${config.sessionFilePath}. Run \`rocketboard-mcp auth login\` first.`)
  }

  const client = createSupabaseClient(config)
  client.auth.onAuthStateChange((_event, session) => {
    if (session) {
      void persistSession(config.sessionFilePath, session)
      return
    }

    void deleteSessionFile(config.sessionFilePath)
  })

  const {data: setSessionData, error: setSessionError} = await client.auth.setSession({
    access_token: storedSession.access_token,
    refresh_token: storedSession.refresh_token,
  })

  if (setSessionError) {
    throw new Error(`Stored Rocketboard MCP session is invalid: ${setSessionError.message}`)
  }

  if (typeof client.auth.startAutoRefresh === 'function') {
    await client.auth.startAutoRefresh()
  }

  const session = setSessionData.session ?? storedSession
  await persistSession(config.sessionFilePath, session)

  const {data: userData, error: userError} = await client.auth.getUser()
  if (userError) {
    throw userError
  }

  if (!userData.user) {
    throw new Error('Rocketboard MCP could not load the signed-in Supabase user.')
  }

  return {
    client,
    session,
    user: userData.user,
  }
}

export async function loadAuthenticatedClientFromAccessToken(
  config: RocketboardMcpConfig,
  accessTokenInput: string,
): Promise<AccessTokenAuthenticatedClient> {
  const accessToken = accessTokenInput.trim()
  if (!accessToken) {
    throw new Error('A bearer access token is required.')
  }

  const authClient = createSupabaseClient(config)
  const {data, error} = await authClient.auth.getUser(accessToken)
  if (error) {
    throw new Error(`Rocketboard MCP bearer token is invalid: ${error.message}`)
  }

  if (!data.user) {
    throw new Error('Rocketboard MCP could not resolve the Supabase user for the bearer token.')
  }

  return {
    client: createSupabaseAccessTokenClient(config, accessToken),
    user: data.user,
  }
}

export async function logout(config: RocketboardMcpSessionConfig) {
  await deleteSessionFile(config.sessionFilePath)
}

export async function getSessionStatus(config: RocketboardMcpSessionConfig) {
  const session = await parseSessionFile(config.sessionFilePath)
  if (!session) {
    return {
      authenticated: false,
      sessionFilePath: config.sessionFilePath,
    } as const
  }

  const user = session.user
  return {
    authenticated: true,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    sessionFilePath: config.sessionFilePath,
    user: {
      email: user.email ?? null,
      id: user.id,
      name: formatAuthUserName(user),
    },
  } as const
}

export function suggestEmailFromEnvironment() {
  const candidates = [process.env.ROCKETBOARD_MCP_EMAIL, process.env.EMAIL, process.env.npm_config_email, process.env.USER]

  for (const candidate of candidates) {
    const normalized = candidate?.trim()
    if (normalized && normalized.includes('@')) {
      return normalized
    }
  }

  const username = os.userInfo().username.trim()
  return username.includes('@') ? username : null
}
