import {realpathSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {loadEnv} from 'vite'

export const LOCAL_SUPABASE_BUILD_OVERRIDE = 'ROCKETBOARD_ALLOW_LOCAL_SUPABASE_BUILD'

function readOptionalEnv(...values) {
  for (const value of values) {
    const normalized = value?.trim()

    if (normalized) {
      return normalized
    }
  }

  return null
}

function isTruthy(value) {
  const normalized = value?.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function isLocalSupabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return value.includes('127.0.0.1') || value.includes('localhost')
  }
}

export function validateBuildEnv({cwd = process.cwd(), env: providedEnv, mode = 'production'} = {}) {
  if (mode !== 'production') {
    return
  }

  const env = providedEnv ?? loadEnv(mode, cwd, '')
  const supabaseUrl = readOptionalEnv(env.VITE_SUPABASE_URL, env.SUPABASE_URL)
  const allowLocalSupabaseBuild = isTruthy(env[LOCAL_SUPABASE_BUILD_OVERRIDE])

  if (!supabaseUrl || allowLocalSupabaseBuild || !isLocalSupabaseUrl(supabaseUrl)) {
    return
  }

  throw new Error(
    [
      `Refusing to build a production bundle with Supabase URL "${supabaseUrl}".`,
      'This usually means a local .env file leaked into a deploy and would ship localhost auth endpoints to production.',
      `If you intentionally want a local-only bundle, set ${LOCAL_SUPABASE_BUILD_OVERRIDE}=true and rerun the build.`,
    ].join(' '),
  )
}

const isCliInvocation =
  process.argv[1]
  && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))

if (isCliInvocation) {
  validateBuildEnv({mode: process.argv[2] ?? 'production'})
}
