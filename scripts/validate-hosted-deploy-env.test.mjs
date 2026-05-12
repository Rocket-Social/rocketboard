import {execFileSync} from 'node:child_process'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  buildSupabaseAuthSettingsUrl,
  expectedSupabaseDbHost,
  formatSupabaseDbUser,
  isSupabasePoolerHost,
  normalizeHost,
  parseSupabaseProjectRefFromUrl,
  validateHostedDeployEnv,
  verifyPublishableKeyMatchesProject,
} from './validate-hosted-deploy-env.mjs'

afterEach((context) => {
  delete context.task.meta.testEnv
})

describe('validateHostedDeployEnv', () => {
  it('accepts a matching hosted Supabase URL, project ref, database host, and publishable key', async ({task}) => {
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: new Headers({
        'sb-project-ref': 'vnjumuyrufzcjxipeeba',
      }),
      ok: true,
      status: 200,
    })

    task.meta.testEnv = {
      SUPABASE_DB_HOST: expectedSupabaseDbHost('vnjumuyrufzcjxipeeba'),
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_new_project',
      SUPABASE_PROJECT_REF: 'vnjumuyrufzcjxipeeba',
      SUPABASE_URL: 'https://vnjumuyrufzcjxipeeba.supabase.co',
    }

    await expect(validateHostedDeployEnv({env: task.meta.testEnv, fetchImpl})).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledWith(
      buildSupabaseAuthSettingsUrl(task.meta.testEnv.SUPABASE_URL),
      {
        headers: {
          apikey: 'sb_publishable_new_project',
        },
        method: 'GET',
      },
    )
  })

  it('accepts frontend-only configuration without a database host override', async ({task}) => {
    task.meta.testEnv = {
      SUPABASE_PROJECT_REF: 'vnjumuyrufzcjxipeeba',
      VITE_SUPABASE_URL: 'https://vnjumuyrufzcjxipeeba.supabase.co',
    }

    await expect(validateHostedDeployEnv({env: task.meta.testEnv})).resolves.toBeUndefined()
  })

  it('accepts a Supabase pooler host for SQL deploys', async ({task}) => {
    task.meta.testEnv = {
      SUPABASE_DB_HOST: 'aws-1-us-west-2.pooler.supabase.com',
      SUPABASE_PROJECT_REF: 'vnjumuyrufzcjxipeeba',
    }

    await expect(validateHostedDeployEnv({env: task.meta.testEnv})).resolves.toBeUndefined()
  })

  it('rejects a Supabase URL whose project ref differs from SUPABASE_PROJECT_REF', async ({task}) => {
    task.meta.testEnv = {
      SUPABASE_PROJECT_REF: 'vnjumuyrufzcjxipeeba',
      SUPABASE_URL: 'https://tltagoxhihmrulvjkeoh.supabase.co',
    }

    await expect(validateHostedDeployEnv({env: task.meta.testEnv})).rejects.toThrowError(
      /points to project ref "tltagoxhihmrulvjkeoh", but SUPABASE_PROJECT_REF is "vnjumuyrufzcjxipeeba"/,
    )
  })

  it('rejects a database host whose project ref differs from SUPABASE_PROJECT_REF', async ({task}) => {
    task.meta.testEnv = {
      SUPABASE_DB_HOST: expectedSupabaseDbHost('tltagoxhihmrulvjkeoh'),
      SUPABASE_PROJECT_REF: 'vnjumuyrufzcjxipeeba',
    }

    await expect(validateHostedDeployEnv({env: task.meta.testEnv})).rejects.toThrowError(
      /does not match SUPABASE_PROJECT_REF "vnjumuyrufzcjxipeeba"/,
    )
  })

  it('rejects a database host that is neither a matching direct host nor a Supabase pooler host', async ({task}) => {
    task.meta.testEnv = {
      SUPABASE_DB_HOST: 'postgres.internal.example.com',
      SUPABASE_PROJECT_REF: 'vnjumuyrufzcjxipeeba',
    }

    await expect(validateHostedDeployEnv({env: task.meta.testEnv})).rejects.toThrowError(
      /does not match SUPABASE_PROJECT_REF "vnjumuyrufzcjxipeeba"/,
    )
  })
})

describe('verifyPublishableKeyMatchesProject', () => {
  it('rejects a publishable key that the target project does not accept', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: new Headers({
        'sb-project-ref': 'vnjumuyrufzcjxipeeba',
      }),
      ok: false,
      status: 401,
    })

    await expect(
      verifyPublishableKeyMatchesProject({
        fetchImpl,
        publishableKey: 'sb_publishable_old_project',
        supabaseProjectRef: 'vnjumuyrufzcjxipeeba',
        supabaseUrl: 'https://vnjumuyrufzcjxipeeba.supabase.co',
      }),
    ).rejects.toThrowError(/SUPABASE_PUBLISHABLE_KEY is not accepted by SUPABASE_URL/)
  })

  it('rejects a publishable key if the gateway reports a different project ref', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: new Headers({
        'sb-project-ref': 'tltagoxhihmrulvjkeoh',
      }),
      ok: true,
      status: 200,
    })

    await expect(
      verifyPublishableKeyMatchesProject({
        fetchImpl,
        publishableKey: 'sb_publishable_old_project',
        supabaseProjectRef: 'vnjumuyrufzcjxipeeba',
        supabaseUrl: 'https://vnjumuyrufzcjxipeeba.supabase.co',
      }),
    ).rejects.toThrowError(/was accepted by project ref "tltagoxhihmrulvjkeoh"/)
  })
})

describe('parseSupabaseProjectRefFromUrl', () => {
  it('extracts the project ref from a hosted Supabase URL', () => {
    expect(parseSupabaseProjectRefFromUrl('https://vnjumuyrufzcjxipeeba.supabase.co')).toBe('vnjumuyrufzcjxipeeba')
  })

  it('returns null for non-project hosts', () => {
    expect(parseSupabaseProjectRefFromUrl('https://rocketboard.app')).toBeNull()
  })
})

describe('normalizeHost', () => {
  it('normalizes URLs and raw hostnames', () => {
    expect(normalizeHost('https://db.vnjumuyrufzcjxipeeba.supabase.co')).toBe('db.vnjumuyrufzcjxipeeba.supabase.co')
    expect(normalizeHost('db.vnjumuyrufzcjxipeeba.supabase.co')).toBe('db.vnjumuyrufzcjxipeeba.supabase.co')
  })
})

describe('isSupabasePoolerHost', () => {
  it('recognizes Supabase pooler hosts', () => {
    expect(isSupabasePoolerHost('aws-1-us-west-2.pooler.supabase.com')).toBe(true)
    expect(isSupabasePoolerHost('https://aws-1-us-west-2.pooler.supabase.com')).toBe(true)
  })

  it('rejects non-pooler hosts', () => {
    expect(isSupabasePoolerHost('db.vnjumuyrufzcjxipeeba.supabase.co')).toBe(false)
    expect(isSupabasePoolerHost('postgres.internal.example.com')).toBe(false)
  })
})

describe('formatSupabaseDbUser', () => {
  it('leaves direct-host users unchanged', () => {
    expect(
      formatSupabaseDbUser({
        dbHost: expectedSupabaseDbHost('vnjumuyrufzcjxipeeba'),
        projectRef: 'vnjumuyrufzcjxipeeba',
        user: 'cli_login_postgres',
      }),
    ).toBe('cli_login_postgres')
  })

  it('qualifies pooler users with the project ref', () => {
    expect(
      formatSupabaseDbUser({
        dbHost: 'aws-1-us-west-2.pooler.supabase.com',
        projectRef: 'vnjumuyrufzcjxipeeba',
        user: 'cli_login_postgres',
      }),
    ).toBe('cli_login_postgres.vnjumuyrufzcjxipeeba')
  })

  it('does not double-qualify an already-qualified pooler user', () => {
    expect(
      formatSupabaseDbUser({
        dbHost: 'aws-1-us-west-2.pooler.supabase.com',
        projectRef: 'vnjumuyrufzcjxipeeba',
        user: 'postgres.vnjumuyrufzcjxipeeba',
      }),
    ).toBe('postgres.vnjumuyrufzcjxipeeba')
  })
})

describe('module import safety', () => {
  it('does not treat arbitrary node -e arguments as a CLI script path', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "await import('./validate-hosted-deploy-env.mjs'); process.stdout.write('ok');",
        'aws-1-us-west-2.pooler.supabase.com',
      ],
      {
        cwd: new URL('.', import.meta.url),
        encoding: 'utf8',
      },
    )

    expect(output).toBe('ok')
  })
})
