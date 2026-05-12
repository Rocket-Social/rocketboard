import {useQuery} from '@tanstack/react-query'

import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {inboxKeys} from './inbox.keys'

// Standalone unread-count query. Kept tiny so the eager sidebar badge path
// doesn't pull in the full `inbox.queries.ts` (mutations + toast + lucide).
//
// The list-side query, mutations, and realtime invalidation all live in
// `inbox.queries.ts` / `inbox.realtime.ts` and share the same query key
// (`inboxKeys.unreadCount`). When realtime fires, both this query and the
// list query refetch.

const UNREAD_COUNT_STALE_MS = 60_000

export async function fetchUnreadCount(userId: string): Promise<number> {
  const {count, error} = await getSupabaseBrowserClient()
    .from('notifications')
    .select('id', {count: 'exact', head: true})
    .eq('user_id', userId)
    .is('read_at', null)
    .is('archived_at', null)

  if (error) throw error
  return count ?? 0
}

export function useUnreadCountQuery(userId: string | null) {
  return useQuery({
    enabled: Boolean(userId),
    queryFn: () => fetchUnreadCount(userId as string),
    queryKey: inboxKeys.unreadCount,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: UNREAD_COUNT_STALE_MS,
  })
}
