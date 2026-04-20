import {queryOptions, useMutation, useQueryClient} from '@tanstack/react-query'

import {planRepository} from './plan.repository'
import type {
  CreatePlanInput,
  CreateReleaseInput,
  CreateRoadmapItemInput,
  CreateRoadmapLaneInput,
  CreateScorecardItemInput,
  ReleaseChecklistItem,
  ReleaseHealth,
  ReleaseNoteSection,
  ReleaseRecord,
  ReleaseShareSnapshot,
  ReleaseStatus,
  ScorecardItem,
  UpdateReleaseInput,
  UpdateRoadmapItemInput,
  UpdateScorecardItemInput,
} from './plan.types'

function planReleasesQueryKey(planViewId: string) {
  return ['plan-releases', planViewId] as const
}

function planReleaseLinkedCardsQueryKey(releaseId: string) {
  return ['plan-release-linked-cards', releaseId] as const
}

function planReleaseLinkedSprintsQueryKey(releaseId: string) {
  return ['plan-release-linked-sprints', releaseId] as const
}

function workspaceReleasePickerCardsQueryKey(workspaceId: string, releaseId: string) {
  return ['workspace-release-picker-cards', workspaceId, releaseId] as const
}

function workspaceReleasePickerSprintsQueryKey(workspaceId: string, releaseId: string) {
  return ['workspace-release-picker-sprints', workspaceId, releaseId] as const
}

function planScorecardQueryKey(planViewId: string) {
  return ['plan-scorecard', planViewId] as const
}

function releaseShareQueryKey(planViewId: string) {
  return ['release-share', planViewId] as const
}

function publicReleaseShareQueryKey(shareToken: string) {
  return ['public-release-share', shareToken] as const
}

function replaceReleaseRecord(records: ReleaseRecord[] | undefined, nextRecord: ReleaseRecord) {
  if (!records) return [nextRecord]
  const index = records.findIndex((record) => record.id === nextRecord.id)
  if (index === -1) return [nextRecord, ...records]
  return records.map((record) => (record.id === nextRecord.id ? nextRecord : record))
}

function patchReleaseRecord(
  records: ReleaseRecord[] | undefined,
  releaseId: string,
  updater: (record: ReleaseRecord) => ReleaseRecord,
) {
  return records?.map((record) => (record.id === releaseId ? updater(record) : record))
}

function replaceScorecardItem(items: ScorecardItem[] | undefined, nextItem: ScorecardItem) {
  if (!items) return [nextItem]
  const index = items.findIndex((item) => item.id === nextItem.id)
  if (index === -1) return [nextItem, ...items]
  return items.map((item) => (item.id === nextItem.id ? nextItem : item))
}

function patchScorecardItem(
  items: ScorecardItem[] | undefined,
  itemId: string,
  updater: (item: ScorecardItem) => ScorecardItem,
) {
  return items?.map((item) => (item.id === itemId ? updater(item) : item))
}

function applyReleasePatch(record: ReleaseRecord, input: UpdateReleaseInput): ReleaseRecord {
  return {
    ...record,
    abVariations: Object.prototype.hasOwnProperty.call(input, 'abVariations') ? input.abVariations ?? null : record.abVariations,
    actualDate: Object.prototype.hasOwnProperty.call(input, 'actualDate') ? input.actualDate ?? null : record.actualDate,
    buildNumber: Object.prototype.hasOwnProperty.call(input, 'buildNumber') ? input.buildNumber ?? null : record.buildNumber,
    forceUpgrade: input.forceUpgrade ?? record.forceUpgrade,
    name: input.name ?? record.name,
    plannedDate: Object.prototype.hasOwnProperty.call(input, 'plannedDate') ? input.plannedDate ?? null : record.plannedDate,
    releaseNotes: Object.prototype.hasOwnProperty.call(input, 'releaseNotes') ? input.releaseNotes ?? null : record.releaseNotes,
    retroNotes: Object.prototype.hasOwnProperty.call(input, 'retroNotes') ? input.retroNotes ?? null : record.retroNotes,
    retroUrl: Object.prototype.hasOwnProperty.call(input, 'retroUrl') ? input.retroUrl ?? null : record.retroUrl,
  }
}

function applyChecklistPatch(record: ReleaseRecord, checklistItems: ReleaseChecklistItem[]): ReleaseRecord {
  const checklistCompletedCount = checklistItems.filter((item) => item.checked).length

  return {
    ...record,
    checklistCompletedCount,
    checklistItems,
    checklistTotalCount: checklistItems.length,
  }
}

function applyScorecardPatch(item: ScorecardItem, input: UpdateScorecardItemInput): ScorecardItem {
  const scores = input.scores ? {...item.scores, ...input.scores} : item.scores

  return {
    ...item,
    compositeScore: input.compositeScore ?? item.compositeScore,
    description: Object.prototype.hasOwnProperty.call(input, 'description') ? input.description ?? null : item.description,
    linkedReleaseId: Object.prototype.hasOwnProperty.call(input, 'linkedReleaseId') ? input.linkedReleaseId ?? null : item.linkedReleaseId,
    linkedReleaseName: Object.prototype.hasOwnProperty.call(input, 'linkedReleaseId')
      ? input.linkedReleaseId === null ? null : item.linkedReleaseName
      : item.linkedReleaseName,
    linkedRoadmapItemId: Object.prototype.hasOwnProperty.call(input, 'linkedRoadmapItemId') ? input.linkedRoadmapItemId ?? null : item.linkedRoadmapItemId,
    linkedRoadmapItemLabel: Object.prototype.hasOwnProperty.call(input, 'linkedRoadmapItemId')
      ? input.linkedRoadmapItemId === null ? null : item.linkedRoadmapItemLabel
      : item.linkedRoadmapItemLabel,
    scores,
    title: input.title ?? item.title,
    tracked: input.tracked ?? item.tracked,
  }
}

async function invalidateReleaseDetails(queryClient: ReturnType<typeof useQueryClient>, workspaceId: string, releaseId: string, planViewId: string) {
  await Promise.all([
    queryClient.invalidateQueries({queryKey: planReleasesQueryKey(planViewId)}),
    queryClient.invalidateQueries({queryKey: planReleaseLinkedCardsQueryKey(releaseId)}),
    queryClient.invalidateQueries({queryKey: planReleaseLinkedSprintsQueryKey(releaseId)}),
    queryClient.invalidateQueries({queryKey: workspaceReleasePickerCardsQueryKey(workspaceId, releaseId)}),
    queryClient.invalidateQueries({queryKey: workspaceReleasePickerSprintsQueryKey(workspaceId, releaseId)}),
  ])
}

export function workspacePlansQueryOptions(workspaceId: string) {
  return queryOptions({
    enabled: !!workspaceId,
    queryFn: () => planRepository.getWorkspacePlans(workspaceId),
    queryKey: ['workspace-plans', workspaceId],
    staleTime: 30_000,
  })
}

export function planReleasesQueryOptions(planViewId: string) {
  return queryOptions({
    enabled: !!planViewId,
    queryFn: () => planRepository.getReleases(planViewId),
    queryKey: planReleasesQueryKey(planViewId),
    staleTime: 30_000,
  })
}

export function planReleaseLinkedCardsQueryOptions(releaseId: string) {
  return queryOptions({
    enabled: !!releaseId,
    queryFn: () => planRepository.getReleaseLinkedCards(releaseId),
    queryKey: planReleaseLinkedCardsQueryKey(releaseId),
    staleTime: 30_000,
  })
}

export function planReleaseLinkedSprintsQueryOptions(releaseId: string) {
  return queryOptions({
    enabled: !!releaseId,
    queryFn: () => planRepository.getReleaseLinkedSprints(releaseId),
    queryKey: planReleaseLinkedSprintsQueryKey(releaseId),
    staleTime: 30_000,
  })
}

export function workspaceReleasePickerCardsQueryOptions(workspaceId: string, releaseId: string) {
  return queryOptions({
    enabled: !!workspaceId && !!releaseId,
    queryFn: () => planRepository.getWorkspaceReleasePickerCards(workspaceId, releaseId),
    queryKey: workspaceReleasePickerCardsQueryKey(workspaceId, releaseId),
    staleTime: 30_000,
  })
}

export function workspaceReleasePickerSprintsQueryOptions(workspaceId: string, releaseId: string) {
  return queryOptions({
    enabled: !!workspaceId && !!releaseId,
    queryFn: () => planRepository.getWorkspaceReleasePickerSprints(workspaceId, releaseId),
    queryKey: workspaceReleasePickerSprintsQueryKey(workspaceId, releaseId),
    staleTime: 30_000,
  })
}

export function roadmapDataQueryOptions(planViewId: string) {
  return queryOptions({
    enabled: !!planViewId,
    queryFn: () => planRepository.getRoadmapData(planViewId),
    queryKey: ['plan-roadmap', planViewId],
    staleTime: 30_000,
  })
}

export function planScorecardQueryOptions(planViewId: string) {
  return queryOptions({
    enabled: !!planViewId,
    queryFn: () => planRepository.getScorecardItems(planViewId),
    queryKey: planScorecardQueryKey(planViewId),
    staleTime: 30_000,
  })
}

export function releaseShareQueryOptions(planViewId: string) {
  return queryOptions({
    enabled: !!planViewId,
    queryFn: () => planRepository.getReleaseShareSnapshot(planViewId),
    queryKey: releaseShareQueryKey(planViewId),
    staleTime: 30_000,
  })
}

export function publicReleaseShareQueryOptions(shareToken: string) {
  return queryOptions({
    enabled: !!shareToken,
    queryFn: () => planRepository.getPublicReleaseShare(shareToken),
    queryKey: publicReleaseShareQueryKey(shareToken),
    staleTime: 30_000,
  })
}

export function useCreatePlanMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePlanInput) => planRepository.createPlan(input),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({queryKey: ['workspace-plans', variables.workspaceId]})
    },
  })
}

export function useCreateReleaseMutation(planViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateReleaseInput) => planRepository.createRelease(input),
    onSuccess: async (data) => {
      queryClient.setQueryData<ReleaseRecord[]>(planReleasesQueryKey(planViewId), (current) => [
        data,
        ...(current ?? []).map((record) => ({...record, position: record.position + 1})),
      ])
      await queryClient.invalidateQueries({queryKey: planReleasesQueryKey(planViewId)})
    },
  })
}

export function useCreateRoadmapLaneMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoadmapLaneInput) => planRepository.createRoadmapLane(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useCreateRoadmapItemMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoadmapItemInput) => planRepository.createRoadmapItem(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useUpdateReleaseMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planReleasesQueryKey(planViewId)

  return useMutation({
    mutationFn: (input: UpdateReleaseInput) => planRepository.updateRelease(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ReleaseRecord[]>(queryKey)
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => patchReleaseRecord(current, input.releaseId, (record) => applyReleasePatch(record, input)))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => replaceReleaseRecord(current, data))
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useUpdateReleaseStatusMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planReleasesQueryKey(planViewId)

  return useMutation({
    mutationFn: ({releaseId, status}: {releaseId: string; status: ReleaseStatus}) =>
      planRepository.updateReleaseStatus(releaseId, status),
    onMutate: async ({releaseId, status}) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ReleaseRecord[]>(queryKey)
      const optimisticArchivedAt = status === 'archived' ? new Date().toISOString() : null
      const optimisticActualDate = status === 'released' ? new Date().toISOString().slice(0, 10) : undefined

      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => patchReleaseRecord(current, releaseId, (record) => ({
        ...record,
        actualDate: optimisticActualDate ?? record.actualDate,
        archivedAt: optimisticArchivedAt,
        status,
      })))

      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => replaceReleaseRecord(current, data))
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useUpdateReleaseHealthMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planReleasesQueryKey(planViewId)

  return useMutation({
    mutationFn: ({health, releaseId}: {health: ReleaseHealth; releaseId: string}) =>
      planRepository.updateReleaseHealth(releaseId, health),
    onMutate: async ({health, releaseId}) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ReleaseRecord[]>(queryKey)
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => patchReleaseRecord(current, releaseId, (record) => ({
        ...record,
        health,
      })))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => replaceReleaseRecord(current, data))
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useUpdateReleaseNotesMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planReleasesQueryKey(planViewId)

  return useMutation({
    mutationFn: ({noteSections, releaseId}: {noteSections: ReleaseNoteSection[]; releaseId: string}) =>
      planRepository.updateReleaseNotes({noteSections, releaseId}),
    onMutate: async ({noteSections, releaseId}) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ReleaseRecord[]>(queryKey)
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => patchReleaseRecord(current, releaseId, (record) => ({
        ...record,
        noteSections,
      })))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => replaceReleaseRecord(current, data))
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useUpdateReleaseChecklistMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planReleasesQueryKey(planViewId)

  return useMutation({
    mutationFn: ({checklistItems, releaseId}: {checklistItems: ReleaseChecklistItem[]; releaseId: string}) =>
      planRepository.updateReleaseChecklist({checklistItems, releaseId}),
    onMutate: async ({checklistItems, releaseId}) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ReleaseRecord[]>(queryKey)
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => patchReleaseRecord(current, releaseId, (record) => applyChecklistPatch(record, checklistItems)))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => replaceReleaseRecord(current, data))
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useDeleteReleaseMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planReleasesQueryKey(planViewId)

  return useMutation({
    mutationFn: (releaseId: string) => planRepository.deleteRelease(releaseId),
    onMutate: async (releaseId) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ReleaseRecord[]>(queryKey)
      queryClient.setQueryData<ReleaseRecord[]>(queryKey, (current) => current?.filter((record) => record.id !== releaseId))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useReorderReleaseMutation(planViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({newPosition, releaseId}: {newPosition: number; releaseId: string}) =>
      planRepository.reorderRelease(releaseId, newPosition),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: planReleasesQueryKey(planViewId)})
    },
  })
}

export function useLinkCardsToReleaseMutation(planViewId: string, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({cardIds, releaseId}: {cardIds: string[]; releaseId: string}) =>
      planRepository.linkCardsToRelease(releaseId, cardIds),
    onSuccess: async (_data, variables) => {
      await invalidateReleaseDetails(queryClient, workspaceId, variables.releaseId, planViewId)
    },
  })
}

export function useUnlinkCardFromReleaseMutation(planViewId: string, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({cardId, releaseId}: {cardId: string; releaseId: string}) =>
      planRepository.unlinkCardFromRelease(releaseId, cardId),
    onSuccess: async (_data, variables) => {
      await invalidateReleaseDetails(queryClient, workspaceId, variables.releaseId, planViewId)
    },
  })
}

export function useLinkSprintsToReleaseMutation(planViewId: string, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({releaseId, sprintIds}: {releaseId: string; sprintIds: string[]}) =>
      planRepository.linkSprintsToRelease(releaseId, sprintIds),
    onSuccess: async (_data, variables) => {
      await invalidateReleaseDetails(queryClient, workspaceId, variables.releaseId, planViewId)
    },
  })
}

export function useUnlinkSprintFromReleaseMutation(planViewId: string, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({releaseId, sprintId}: {releaseId: string; sprintId: string}) =>
      planRepository.unlinkSprintFromRelease(releaseId, sprintId),
    onSuccess: async (_data, variables) => {
      await invalidateReleaseDetails(queryClient, workspaceId, variables.releaseId, planViewId)
    },
  })
}

export function useCreateReleaseShareLinkMutation(planViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => planRepository.createReleaseShareLink(planViewId),
    onSuccess: (data) => {
      queryClient.setQueryData<ReleaseShareSnapshot | null>(releaseShareQueryKey(planViewId), data)
    },
  })
}

export function useRevokeReleaseShareLinkMutation(planViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => planRepository.revokeReleaseShareLink(planViewId),
    onSuccess: () => {
      queryClient.setQueryData<ReleaseShareSnapshot | null>(releaseShareQueryKey(planViewId), null)
    },
  })
}

export function useUpdateRoadmapItemMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateRoadmapItemInput) => planRepository.updateRoadmapItem(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useDeleteRoadmapItemMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => planRepository.deleteRoadmapItem(itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useDeleteRoadmapLaneMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (laneId: string) => planRepository.deleteRoadmapLane(laneId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useCreateRoadmapMilestoneMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {color?: string | null; date: string; label: string; laneId?: string | null; planViewId: string; type?: 'circle' | 'diamond' | 'flag'}) =>
      planRepository.createRoadmapMilestone(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useUpdateRoadmapMilestoneMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {color?: string | null; date?: string | null; label?: string | null; laneId?: string | null; milestoneId: string; type?: string | null}) =>
      planRepository.updateRoadmapMilestone(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useDeleteRoadmapMilestoneMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (milestoneId: string) =>
      planRepository.deleteRoadmapMilestone(milestoneId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useUpsertMatrixCellMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {contentText: string; laneId: string; periodKey: string; planViewId: string}) =>
      planRepository.upsertMatrixCell(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useUpdateRoadmapLaneMutation(planViewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {color?: string | null; group?: string | null; laneId: string; title?: string | null}) =>
      planRepository.updateRoadmapLane(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['plan-roadmap', planViewId]})
    },
  })
}

export function useCreateScorecardItemMutation(planViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateScorecardItemInput) => planRepository.createScorecardItem(input),
    onSuccess: async (data) => {
      queryClient.setQueryData<ScorecardItem[]>(planScorecardQueryKey(planViewId), (current) => [
        data,
        ...(current ?? []).map((item) => ({...item, position: item.position + 1})),
      ])
      await queryClient.invalidateQueries({queryKey: planScorecardQueryKey(planViewId)})
    },
  })
}

export function useUpdateScorecardItemMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planScorecardQueryKey(planViewId)

  return useMutation({
    mutationFn: (input: UpdateScorecardItemInput) => planRepository.updateScorecardItem(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ScorecardItem[]>(queryKey)
      queryClient.setQueryData<ScorecardItem[]>(queryKey, (current) => patchScorecardItem(current, input.itemId, (item) => applyScorecardPatch(item, input)))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ScorecardItem[]>(queryKey, (current) => replaceScorecardItem(current, data))
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useDeleteScorecardItemMutation(planViewId: string) {
  const queryClient = useQueryClient()
  const queryKey = planScorecardQueryKey(planViewId)

  return useMutation({
    mutationFn: (itemId: string) => planRepository.deleteScorecardItem(itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData<ScorecardItem[]>(queryKey)
      queryClient.setQueryData<ScorecardItem[]>(queryKey, (current) => current?.filter((item) => item.id !== itemId))
      return {previous}
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey})
    },
  })
}

export function useReorderScorecardItemMutation(planViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({itemId, newPosition}: {itemId: string; newPosition: number}) =>
      planRepository.reorderScorecardItem(itemId, newPosition),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: planScorecardQueryKey(planViewId)})
    },
  })
}

export function useUpdatePlanViewConfigMutation() {
  return useMutation({
    mutationFn: (input: {config: Record<string, unknown>; viewId: string}) =>
      planRepository.updatePlanViewConfig(input.viewId, input.config),
  })
}

export function useDeletePlanMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => planRepository.deletePlan(planId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['workspace-plans', workspaceId]})
    },
  })
}

export function useRenamePlanMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({planId, name}: {planId: string; name: string}) => planRepository.renamePlan(planId, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['workspace-plans', workspaceId]})
    },
  })
}

export {
  planReleaseLinkedCardsQueryKey,
  planReleaseLinkedSprintsQueryKey,
  planReleasesQueryKey,
  planScorecardQueryKey,
  publicReleaseShareQueryKey,
  releaseShareQueryKey,
  workspaceReleasePickerCardsQueryKey,
  workspaceReleasePickerSprintsQueryKey,
}
