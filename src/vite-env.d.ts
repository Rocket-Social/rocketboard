/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SUPABASE_PUBLISHABLE_KEY?: string
  readonly SUPABASE_URL?: string
  readonly VITE_SELF_HOSTED?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
