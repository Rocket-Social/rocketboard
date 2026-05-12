// Wave 1 Batch 2 PR B — realtime subscription for the user's inbox.
//
// Subscribes to `notifications` rows scoped to the signed-in user via the
// channel filter `user_id=eq.<uuid>`. Notifications are user-scoped (not
// org-scoped — see plan §1.3 / D-13), so the subscription survives org
// switches without tearing down. Auth changes (sign-out / sign-in as a
// different user) tear down via React unmount on the surrounding
// SignedInAppFrame.
//
// Mounted globally in SignedInAppFrame so the sidebar unread badge updates
// even when the user is not on `/inbox`.
//
// REG-4 from the test plan: Supabase Realtime evaluates RLS for INSERT,
// UPDATE, and DELETE events on tables in the realtime publication. The
// `user_id=eq.<uuid>` channel filter is a defense-in-depth narrowing —
// the test asserts that a user_A subscriber receives no events for
// user_B's rows even when only RLS would be enforcing the boundary.

import {useEffect} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {realtimeAdapter} from '../../platform/realtime/realtime-adapter'
import {inboxKeys} from './inbox.keys'

export function useInboxRealtime(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = realtimeAdapter.channel(`inbox-${userId}`)

    channel.on(
      'postgres_changes',
      {
        event: '*',
        filter: `user_id=eq.${userId}`,
        schema: 'public',
        table: 'notifications',
      },
      () => {
        // Invalidate everything under inboxKeys.all — list pages + the
        // unread count head query both refetch.
        void queryClient.invalidateQueries({queryKey: inboxKeys.all})
      },
    )

    void channel.subscribe()

    return () => {
      void realtimeAdapter.removeChannel(channel)
    }
  }, [queryClient, userId])
}
