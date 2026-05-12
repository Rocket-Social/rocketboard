import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {rpcAdapter} from '../../platform/data/rpc-adapter'

// Repository for the Linear-style "follow a task" surface. The mutation
// RPCs are SECURITY DEFINER (server-side read-access gate); the
// self-check uses the `card_followers_select_self` RLS policy and the
// roster read uses the SECURITY DEFINER `list_card_followers` RPC so
// the visible-card RLS doesn't have to be widened.

export type CardFollowerSource =
  | 'manual'
  | 'assignee_auto'
  | 'creator_auto'
  | 'comment_auto'

export type CardFollower = {
  userId: string
  displayName: string
  avatarUrl: string | null
  source: CardFollowerSource
  createdAt: string
}

type CardFollowerRow = {
  user_id: string
  display_name: string
  avatar_url: string | null
  source: CardFollowerSource
  created_at: string
}

export const cardFollowersRepository = {
  async follow(cardId: string): Promise<void> {
    await rpcAdapter.call('follow_card', {target_card_id: cardId})
  },

  async unfollow(cardId: string): Promise<void> {
    await rpcAdapter.call('unfollow_card', {target_card_id: cardId})
  },

  async isFollowing(cardId: string, userId: string): Promise<boolean> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('card_followers')
      .select('user_id', {head: false})
      .eq('card_id', cardId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data !== null
  },

  async listFollowers(cardId: string): Promise<CardFollower[]> {
    const rows = await rpcAdapter.call<CardFollowerRow[]>('list_card_followers', {
      target_card_id: cardId,
    })
    return (rows ?? []).map((row) => ({
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      displayName: row.display_name,
      source: row.source,
      userId: row.user_id,
    }))
  },
}
