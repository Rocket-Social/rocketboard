import type {RealtimeChannel} from '@supabase/supabase-js'

import {getSupabaseBrowserClient} from '../supabase/client'

export type PlatformRealtimeChannel = RealtimeChannel

export const realtimeAdapter = {
  channel(name: string) {
    return getSupabaseBrowserClient().channel(name)
  },
  removeChannel(channel: RealtimeChannel) {
    return getSupabaseBrowserClient().removeChannel(channel)
  },
}
