// Wave 2 AI Kanban — realtime subscription for the My AI Kanban grid.
//
// Subscribes to `ai_agent_runs` rows scoped to the current user + org.
// Postgres RLS filters do not flow into Supabase Realtime filters, so
// the channel filter is `created_by_user_id=eq.<uuid>`; the org check
// runs client-side in the payload handler before invalidating the
// TanStack Query cache.
//
// Design note: invalidate-on-event keeps the grid simple. A future
// optimization could patch the cache directly, but `staleTime: 10s` +
// invalidation already keeps the grid responsive without N+1 fetches.

import {useEffect} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {realtimeAdapter} from '../../platform/realtime/realtime-adapter'
import {aiKeys} from './ai.queries'

type RealtimePayload = {
  eventType?: 'DELETE' | 'INSERT' | 'UPDATE'
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}

function payloadOrgId(payload: RealtimePayload): string | null {
  const fromNew = payload.new?.organization_id
  if (typeof fromNew === 'string') return fromNew
  const fromOld = payload.old?.organization_id
  if (typeof fromOld === 'string') return fromOld
  return null
}

export function useAgentRunsRealtime(input: {
  userId: string | null
  organizationId: string | null
}) {
  const queryClient = useQueryClient()
  const {userId, organizationId} = input

  useEffect(() => {
    if (!userId || !organizationId) return

    const channel = realtimeAdapter.channel(`ai-agent-runs-${userId}`)

    channel.on(
      'postgres_changes',
      {
        event: '*',
        filter: `created_by_user_id=eq.${userId}`,
        schema: 'public',
        table: 'ai_agent_runs',
      },
      (payload) => {
        const realtimePayload = payload as RealtimePayload
        // Realtime channel filter only matches created_by_user_id; org
        // cross-check guards against switching workspaces during a live
        // subscription.
        if (payloadOrgId(realtimePayload) !== organizationId) return
        void queryClient.invalidateQueries({
          queryKey: aiKeys.agentRunsForUser(userId, organizationId),
        })
      },
    )

    void channel.subscribe()

    return () => {
      void realtimeAdapter.removeChannel(channel)
    }
  }, [organizationId, queryClient, userId])
}
