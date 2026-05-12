import {processLock} from '@supabase/auth-js'
import {createClient, type SupabaseClient} from '@supabase/supabase-js'

import {appConfig, isSupabaseConfigured} from '../../app/config'
import type {Database} from './database.types'

let supabaseBrowserClient: SupabaseClient<Database> | null = null

export function getSupabaseBrowserClient() {
  if (supabaseBrowserClient) {
    return supabaseBrowserClient
  }

  if (!isSupabaseConfigured) {
    throw new Error(
      'Rocketboard requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or their VITE_ equivalents) before the app can start.',
    )
  }

  supabaseBrowserClient = createClient<Database>(appConfig.supabase.url!, appConfig.supabase.publishableKey!, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: processLock,
      persistSession: true,
    },
  })

  return supabaseBrowserClient
}
