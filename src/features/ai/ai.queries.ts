import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpcAdapter } from '../../platform/data/rpc-adapter'
import {
  createPersona,
  listConversations,
  listMessages,
  listPersonas,
  updatePersona,
} from './ai.repository'

export const aiKeys = {
  all: ['ai'] as const,
  conversations: (userId: string, surface?: string) =>
    [...aiKeys.all, 'conversations', userId, surface] as const,
  messages: (conversationId: string) =>
    [...aiKeys.all, 'messages', conversationId] as const,
  personas: (orgId: string) => [...aiKeys.all, 'personas', orgId] as const,
}

export function personasQueryOptions(organizationId: string) {
  return queryOptions({
    enabled: !!organizationId,
    queryFn: () => listPersonas(organizationId),
    queryKey: aiKeys.personas(organizationId),
    staleTime: 5 * 60_000,
  })
}

export function usePersonasQuery(organizationId: string) {
  return useQuery(personasQueryOptions(organizationId))
}

export function useSeedPersonasMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (organizationId: string) =>
      rpcAdapter.call('seed_default_ai_personas', {
        p_organization_id: organizationId,
      }),
    onSuccess: (_data, organizationId) => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.personas(organizationId),
      })
    },
  })
}

export function useUpdatePersonaMutation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      personaId,
      updates,
    }: {
      personaId: string
      updates: Parameters<typeof updatePersona>[1]
    }) => updatePersona(personaId, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.personas(organizationId),
      })
    },
  })
}

export function useCreatePersonaMutation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (persona: Parameters<typeof createPersona>[1]) =>
      createPersona(organizationId, persona),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.personas(organizationId),
      })
    },
  })
}

export function useConversationsQuery(
  userId: string,
  surface?: string,
) {
  return useQuery({
    enabled: !!userId,
    queryFn: () => listConversations(userId, surface),
    queryKey: aiKeys.conversations(userId, surface),
    staleTime: 30_000,
  })
}

export function useMessagesQuery(conversationId: string | null) {
  return useQuery({
    enabled: !!conversationId,
    queryFn: () => listMessages(conversationId!),
    queryKey: aiKeys.messages(conversationId ?? ''),
    staleTime: 10_000,
  })
}
