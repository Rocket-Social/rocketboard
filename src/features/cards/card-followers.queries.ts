import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useToast} from '../../components/ui/toast'
import {cardFollowersRepository} from './card-followers.repository'

export const cardFollowersKeys = {
  all: ['card-followers'] as const,
  isFollowing: (cardId: string, userId: string) =>
    ['card-followers', 'is-following', cardId, userId] as const,
  list: (cardId: string) => ['card-followers', 'list', cardId] as const,
}

export function useCardFollowersListQuery(cardId: string | null, enabled = true) {
  return useQuery({
    enabled: Boolean(cardId) && enabled,
    queryFn: () => cardFollowersRepository.listFollowers(cardId as string),
    queryKey: cardFollowersKeys.list(cardId ?? 'missing'),
    // Roster doesn't change rapidly; 30s window keeps the popover snappy
    // on repeat-open without piling extra RPC traffic.
    staleTime: 30_000,
  })
}

export function useIsFollowingCardQuery(
  cardId: string | null,
  userId: string | null,
) {
  return useQuery({
    enabled: Boolean(cardId && userId),
    queryFn: () => cardFollowersRepository.isFollowing(cardId as string, userId as string),
    queryKey: cardFollowersKeys.isFollowing(cardId ?? 'missing', userId ?? 'missing'),
    // Card-followers state is sticky once toggled; no realtime channel
    // needed for v1 (the badge updates from the inbox channel, this is
    // a per-card boolean).
    staleTime: 60_000,
  })
}

export function useFollowCardMutation(cardId: string, userId: string | null) {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: () => cardFollowersRepository.follow(cardId),
    onMutate: async () => {
      if (!userId) return
      await queryClient.cancelQueries({
        queryKey: cardFollowersKeys.isFollowing(cardId, userId),
      })
      const previous = queryClient.getQueryData<boolean>(
        cardFollowersKeys.isFollowing(cardId, userId),
      )
      queryClient.setQueryData(
        cardFollowersKeys.isFollowing(cardId, userId),
        true,
      )
      return {previous}
    },
    onError: (error, _vars, context) => {
      if (userId && context) {
        queryClient.setQueryData(
          cardFollowersKeys.isFollowing(cardId, userId),
          context.previous ?? false,
        )
      }
      toast({
        description: getErrorMessage(error, 'Could not follow this card.'),
        title: 'Action failed',
        variant: 'error',
      })
    },
    onSettled: () => {
      if (!userId) return
      void queryClient.invalidateQueries({
        queryKey: cardFollowersKeys.isFollowing(cardId, userId),
      })
      void queryClient.invalidateQueries({
        queryKey: cardFollowersKeys.list(cardId),
      })
    },
  })
}

export function useUnfollowCardMutation(cardId: string, userId: string | null) {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: () => cardFollowersRepository.unfollow(cardId),
    onMutate: async () => {
      if (!userId) return
      await queryClient.cancelQueries({
        queryKey: cardFollowersKeys.isFollowing(cardId, userId),
      })
      const previous = queryClient.getQueryData<boolean>(
        cardFollowersKeys.isFollowing(cardId, userId),
      )
      queryClient.setQueryData(
        cardFollowersKeys.isFollowing(cardId, userId),
        false,
      )
      return {previous}
    },
    onError: (error, _vars, context) => {
      if (userId && context) {
        queryClient.setQueryData(
          cardFollowersKeys.isFollowing(cardId, userId),
          context.previous ?? true,
        )
      }
      toast({
        description: getErrorMessage(error, 'Could not unfollow this card.'),
        title: 'Action failed',
        variant: 'error',
      })
    },
    onSettled: () => {
      if (!userId) return
      void queryClient.invalidateQueries({
        queryKey: cardFollowersKeys.isFollowing(cardId, userId),
      })
      void queryClient.invalidateQueries({
        queryKey: cardFollowersKeys.list(cardId),
      })
    },
  })
}
