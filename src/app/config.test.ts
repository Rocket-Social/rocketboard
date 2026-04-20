import {afterEach, describe, expect, it, vi} from 'vitest'

async function loadConfigModule() {
  vi.resetModules()
  return import('./config')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('appConfig supabase env resolution', () => {
  it('prefers VITE-prefixed Supabase env vars when present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://vite-project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'vite-key')
    vi.stubEnv('SUPABASE_URL', 'https://plain-project.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'plain-key')

    const {appConfig, isSupabaseConfigured} = await loadConfigModule()

    expect(appConfig.supabase.url).toBe('https://vite-project.supabase.co')
    expect(appConfig.supabase.publishableKey).toBe('vite-key')
    expect(isSupabaseConfigured).toBe(true)
  })

  it('falls back to plain Supabase env vars when VITE vars are absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    vi.stubEnv('SUPABASE_URL', 'https://plain-project.supabase.co')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'plain-key')

    const {appConfig, isSupabaseConfigured} = await loadConfigModule()

    expect(appConfig.supabase.url).toBe('https://plain-project.supabase.co')
    expect(appConfig.supabase.publishableKey).toBe('plain-key')
    expect(isSupabaseConfigured).toBe(true)
  })

  it('treats blank env vars as missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', ' ')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', ' ')
    vi.stubEnv('SUPABASE_URL', ' ')
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '')

    const {appConfig, isSupabaseConfigured} = await loadConfigModule()

    expect(appConfig.supabase.url).toBeNull()
    expect(appConfig.supabase.publishableKey).toBeNull()
    expect(isSupabaseConfigured).toBe(false)
  })
})
