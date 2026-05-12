import {queryOptions, useMutation, useQueryClient} from '@tanstack/react-query'
import type {QueryClient} from '@tanstack/react-query'

import {invalidateAllProjectData} from '../projects/project-shell.queries'
import {initiativeRepository} from './initiative.repository'
import type {CreateInitiativeInput, PostInitiativeUpdateInput, UpdateInitiativeInput} from './initiative.types'

export function workspaceInitiativesQueryOptions(workspaceId: string) {
  return queryOptions({
    enabled: !!workspaceId,
    queryFn: () => initiativeRepository.getWorkspaceInitiatives(workspaceId),
    queryKey: ['workspace-initiatives', workspaceId],
    staleTime: 30_000,
  })
}

export function workspaceInitiativeSummariesQueryOptions(workspaceId: string) {
  return queryOptions({
    enabled: !!workspaceId,
    queryFn: () => initiativeRepository.getWorkspaceInitiativeSummaries(workspaceId),
    queryKey: ['workspace-initiative-summaries', workspaceId],
    staleTime: 30_000,
  })
}

export function workspaceInitiativeSparklineQueryOptions(workspaceId: string) {
  return queryOptions({
    enabled: !!workspaceId,
    queryFn: () => initiativeRepository.getWorkspaceInitiativeSparklines(workspaceId),
    queryKey: ['workspace-initiative-sparklines', workspaceId],
    staleTime: 60_000,
  })
}

export function initiativeCardsQueryOptions(initiativeId: string) {
  return queryOptions({
    queryFn: () => initiativeRepository.getInitiativeCards(initiativeId),
    queryKey: ['initiative-cards', initiativeId],
    staleTime: 30_000,
  })
}

export function initiativePickerCardsQueryOptions(workspaceId: string, initiativeId: string) {
  return queryOptions({
    queryFn: () => initiativeRepository.getWorkspaceInitiativePickerCards(workspaceId, initiativeId),
    queryKey: ['initiative-picker-cards', workspaceId, initiativeId],
    staleTime: 30_000,
  })
}

export function initiativeUpdatesQueryOptions(initiativeId: string) {
  return queryOptions({
    queryFn: () => initiativeRepository.getInitiativeUpdates(initiativeId),
    queryKey: ['initiative-updates', initiativeId],
    staleTime: 30_000,
  })
}

function invalidateInitiativeQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && (
          query.queryKey[0] === 'workspace-initiatives'
          || query.queryKey[0] === 'workspace-initiative-summaries'
        ),
    }),
  ])
}

function invalidateInitiativeDetail(queryClient: ReturnType<typeof useQueryClient>, initiativeId: string) {
  return Promise.all([
    queryClient.invalidateQueries({queryKey: ['initiative-cards', initiativeId]}),
    queryClient.invalidateQueries({queryKey: ['initiative-updates', initiativeId]}),
    invalidateInitiativeQueries(queryClient),
  ])
}

export function invalidateInitiativeAffectedProjects(queryClient: QueryClient, projectIds: Array<string | null | undefined>) {
  const normalizedProjectIds = [...new Set(projectIds.filter((projectId): projectId is string => typeof projectId === 'string' && projectId.trim().length > 0))]

  return Promise.all(
    normalizedProjectIds.map((projectId) => invalidateAllProjectData(queryClient, projectId)),
  )
}

export function useCreateInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateInitiativeInput) => initiativeRepository.createInitiative(input),
    onSuccess: async () => {
      await invalidateInitiativeQueries(queryClient)
    },
  })
}

export function useUpdateInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateInitiativeInput) => initiativeRepository.updateInitiative(input),
    onSuccess: async () => {
      await invalidateInitiativeQueries(queryClient)
    },
  })
}

export function useArchiveInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (initiativeId: string) => initiativeRepository.archiveInitiative(initiativeId),
    onSuccess: async () => {
      await invalidateInitiativeQueries(queryClient)
    },
  })
}

export function useDeleteInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (initiativeId: string) => initiativeRepository.deleteInitiative(initiativeId),
    onSuccess: async (_data, initiativeId) => {
      await Promise.all([
        invalidateInitiativeQueries(queryClient),
        // Cards reference initiatives via initiative_id. After the cascade
        // nulls those links server-side, any open project board/table must
        // refetch or it keeps showing the ghost initiative tag until the
        // query's stale time expires.
        queryClient.invalidateQueries({queryKey: ['project', 'cards']}),
        // The deleted initiative's own detail queries — invalidate them
        // so reopening the URL doesn't resurrect cached data.
        queryClient.invalidateQueries({queryKey: ['initiative-cards', initiativeId]}),
        queryClient.invalidateQueries({queryKey: ['initiative-updates', initiativeId]}),
      ])
    },
  })
}

export function useSetCardInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({cardId, initiativeId}: {cardId: string; initiativeId: string | null; projectId?: string | null}) =>
      initiativeRepository.setCardInitiative(cardId, initiativeId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateInitiativeQueries(queryClient),
        invalidateInitiativeAffectedProjects(queryClient, [variables.projectId]),
      ])
    },
  })
}

export function usePostInitiativeUpdateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: PostInitiativeUpdateInput) => initiativeRepository.postInitiativeUpdate(input),
    onSuccess: async (_data, variables) => {
      await invalidateInitiativeDetail(queryClient, variables.initiativeId)
    },
  })
}

export function useRenameInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({initiativeId, name}: {initiativeId: string; name: string}) =>
      initiativeRepository.renameInitiative(initiativeId, name),
    onSuccess: async () => {
      await invalidateInitiativeQueries(queryClient)
    },
  })
}

export function useReorderInitiativeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({initiativeId, newPosition}: {initiativeId: string; newPosition: number}) =>
      initiativeRepository.reorderInitiative(initiativeId, newPosition),
    onSuccess: async () => {
      await invalidateInitiativeQueries(queryClient)
    },
  })
}
