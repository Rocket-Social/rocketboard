import {realpathSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

function readOptionalEnv(...values) {
  for (const value of values) {
    const normalized = value?.trim()

    if (normalized) {
      return normalized
    }
  }

  return null
}

export function expectedSupabaseDbHost(projectRef) {
  return `db.${projectRef}.supabase.co`
}

export function isSupabasePoolerHost(value) {
  const hostname = normalizeHost(value)

  if (!hostname) {
    return false
  }

  return /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname)
}

export function formatSupabaseDbUser({dbHost, projectRef, user}) {
  const normalizedUser = user?.trim()

  if (!normalizedUser) {
    return ''
  }

  if (!projectRef || !isSupabasePoolerHost(dbHost)) {
    return normalizedUser
  }

  return normalizedUser.includes('.') ? normalizedUser : `${normalizedUser}.${projectRef}`
}

export function normalizeHost(value) {
  const normalized = value?.trim()

  if (!normalized) {
    return null
  }

  try {
    return new URL(normalized).hostname.toLowerCase()
  } catch {
    return normalized.replace(/\/+$/, '').toLowerCase()
  }
}

export function parseSupabaseProjectRefFromUrl(value) {
  const hostname = normalizeHost(value)

  if (!hostname) {
    return null
  }

  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)
  return match?.[1] ?? null
}

export function buildSupabaseAuthSettingsUrl(value) {
  return new URL('/auth/v1/settings', value).toString()
}

export async function verifyPublishableKeyMatchesProject({
  fetchImpl = globalThis.fetch,
  publishableKey,
  supabaseProjectRef,
  supabaseUrl,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable, so SUPABASE_PUBLISHABLE_KEY could not be verified.')
  }

  const response = await fetchImpl(buildSupabaseAuthSettingsUrl(supabaseUrl), {
    headers: {
      apikey: publishableKey,
    },
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(
      `SUPABASE_PUBLISHABLE_KEY is not accepted by SUPABASE_URL "${supabaseUrl}" (received ${response.status} from /auth/v1/settings).`,
    )
  }

  const responseProjectRef = response.headers.get('sb-project-ref')?.trim()

  if (responseProjectRef && responseProjectRef !== supabaseProjectRef) {
    throw new Error(
      `SUPABASE_PUBLISHABLE_KEY was accepted by project ref "${responseProjectRef}", but SUPABASE_PROJECT_REF is "${supabaseProjectRef}".`,
    )
  }
}

export async function validateHostedDeployEnv({env = process.env, fetchImpl} = {}) {
  const supabaseProjectRef = readOptionalEnv(env.SUPABASE_PROJECT_REF)
  const supabaseUrl = readOptionalEnv(env.VITE_SUPABASE_URL, env.SUPABASE_URL)
  const supabaseDbHost = readOptionalEnv(env.SUPABASE_DB_HOST)
  const supabasePublishableKey = readOptionalEnv(
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
  )

  if (supabaseUrl) {
    if (!supabaseProjectRef) {
      throw new Error('SUPABASE_PROJECT_REF must be set when SUPABASE_URL is configured.')
    }

    const projectRefFromUrl = parseSupabaseProjectRefFromUrl(supabaseUrl)

    if (!projectRefFromUrl) {
      throw new Error(
        `SUPABASE_URL "${supabaseUrl}" must point to a hosted Supabase project like https://<project-ref>.supabase.co.`,
      )
    }

    if (projectRefFromUrl !== supabaseProjectRef) {
      throw new Error(
        `SUPABASE_URL "${supabaseUrl}" points to project ref "${projectRefFromUrl}", but SUPABASE_PROJECT_REF is "${supabaseProjectRef}".`,
      )
    }
  }

  if (supabaseDbHost) {
    if (!supabaseProjectRef) {
      throw new Error('SUPABASE_PROJECT_REF must be set when SUPABASE_DB_HOST is configured.')
    }

    const normalizedDbHost = normalizeHost(supabaseDbHost)
    const expectedDbHost = expectedSupabaseDbHost(supabaseProjectRef)

    if (normalizedDbHost !== expectedDbHost && !isSupabasePoolerHost(normalizedDbHost)) {
      throw new Error(
        `SUPABASE_DB_HOST "${supabaseDbHost}" does not match SUPABASE_PROJECT_REF "${supabaseProjectRef}". Expected "${expectedDbHost}" or a Supabase pooler host like "aws-1-us-west-2.pooler.supabase.com".`,
      )
    }
  }

  if (supabaseUrl && supabasePublishableKey) {
    await verifyPublishableKeyMatchesProject({
      fetchImpl,
      publishableKey: supabasePublishableKey,
      supabaseProjectRef,
      supabaseUrl,
    })
  }
}

let isCliInvocation = false

if (process.argv[1]) {
  try {
    isCliInvocation =
      realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))
  } catch {
    isCliInvocation = false
  }
}

if (isCliInvocation) {
  await validateHostedDeployEnv()
}
