function readOptionalEnv(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()

    if (normalized) {
      return normalized
    }
  }

  return null
}

export const appConfig = {
  supabase: {
    publishableKey: readOptionalEnv(
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      import.meta.env.SUPABASE_PUBLISHABLE_KEY,
    ),
    url: readOptionalEnv(import.meta.env.VITE_SUPABASE_URL, import.meta.env.SUPABASE_URL),
  },
} as const

export const isSupabaseConfigured = Boolean(appConfig.supabase.url && appConfig.supabase.publishableKey)

export const IS_SELF_HOSTED = import.meta.env.VITE_SELF_HOSTED === 'true'
