import {type QueryClient, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  applyCardMoveToCache,
  applyCardMoveToGroupCache,
  patchProjectCards,
} from '../projects/project-data.cache'
import {
  restoreQuerySnapshots,
  runInBackground,
  snapshotQueries,
} from '../projects/project-mutation.utils'
import {
  invalidateAllProjectData,
  invalidateProjectDataSlices,
} from '../projects/project-shell.queries'
import {cardRepository} from './card.repository'
import type {
  AddCardCommentInput,
  CardDetail,
  CardRecord,
  CreateCardInput,
  DuplicateCardsInput,
  MoveCardInput,
  MoveCardToGroupInput,
  SetCardAssigneeInput,
  SetCardScheduleInput,
  UpdateCardInput,
  UploadCardAttachmentInput,
} from './card.types'

export function cardDetailQueryOptions(cardId: string) {
  return {
    queryFn: () => cardRepository.getCardDetail(cardId),
    queryKey: ['card-detail', cardId] as const,
  }
}

type CardDetailPatch = {
  assigneeName?: string
  assigneeUserId?: string | null
  bodyJson?: CardRecord['bodyJson']
  bodyMd?: string
  completedAt?: string | null
  customFieldValues?: CardRecord['customFieldValues']
  dueAt: string | null
  effort: number | null
  groupId?: string | null
  groupPosition: number
  id: string
  initiativeId?: string | null
  priorityOptionId: CardRecord['priorityOptionId']
  projectId: string
  sprintId?: string | null
  startAt: string | null
  statusOptionId: CardRecord['statusOptionId']
  statusPosition: number
  tags: string[]
  title: string
}

async function invalidateProjectSearchCache(queryClient: QueryClient, projectId: string) {
  await queryClient.invalidateQueries({queryKey: ['project-search', projectId]})
}

async function invalidateWorkspaceSearchCache(queryClient: QueryClient) {
  await queryClient.invalidateQueries({queryKey: ['workspace-search']})
}

function mergeCardsIntoCache(cards: CardRecord[], additions: CardRecord[]) {
  if (additions.length === 0) {
    return cards
  }

  const existingIds = new Set(cards.map((card) => card.id))
  return [...cards, ...additions.filter((card) => !existingIds.has(card.id))]
}

function patchCardDetailRecord(current: CardDetail | undefined, patch: CardDetailPatch) {
  if (!current || current.id !== patch.id) {
    return current
  }

  return {
    ...current,
    assigneeName: patch.assigneeName ?? current.assigneeName,
    assigneeUserId: 'assigneeUserId' in patch ? patch.assigneeUserId ?? null : current.assigneeUserId,
    bodyJson: patch.bodyJson ?? current.bodyJson,
    bodyMd: patch.bodyMd,
    completedAt: 'completedAt' in patch ? patch.completedAt ?? null : current.completedAt,
    customFieldValues: patch.customFieldValues ?? current.customFieldValues,
    dueAt: patch.dueAt,
    effort: patch.effort,
    groupId: 'groupId' in patch ? patch.groupId ?? null : current.groupId,
    groupPosition: patch.groupPosition,
    initiativeId: 'initiativeId' in patch ? patch.initiativeId ?? null : current.initiativeId,
    priorityOptionId: 'priorityOptionId' in patch ? patch.priorityOptionId ?? null : current.priorityOptionId,
    projectId: patch.projectId,
    sprintId: 'sprintId' in patch ? patch.sprintId ?? null : current.sprintId,
    startAt: patch.startAt,
    statusOptionId: patch.statusOptionId ?? current.statusOptionId,
    statusPosition: patch.statusPosition,
    tags: patch.tags,
    title: patch.title,
  }
}

export function applyCardDetailPatch(queryClient: QueryClient, patch: CardDetailPatch) {
  queryClient.setQueryData<CardDetail | undefined>(
    cardDetailQueryOptions(patch.id).queryKey,
    (current) => patchCardDetailRecord(current, patch),
  )
}

export async function runCreateCardMutation(queryClient: QueryClient, input: CreateCardInput) {
  const card = await cardRepository.createCard(input)

  patchProjectCards(queryClient, card.projectId, (cards) => [...cards.filter((e) => e.id !== card.id), card])
  queryClient.setQueryData(cardDetailQueryOptions(card.id).queryKey, {
    ...card,
    attachments: [],
    comments: [],
  })
  await Promise.all([
    invalidateProjectSearchCache(queryClient, card.projectId),
    invalidateWorkspaceSearchCache(queryClient),
  ])

  return card
}

export async function runDuplicateCardsMutation(queryClient: QueryClient, input: DuplicateCardsInput) {
  if (input.cardIds.length === 0) return []

  const duplicates = await cardRepository.duplicateCards(input)

  if (duplicates.length === 0) {
    throw new Error('No cards were duplicated')
  }

  // Server shifted existing positions in affected buckets, so refresh the
  // project card slice rather than blindly appending the new rows.
  await invalidateProjectDataSlices(queryClient, input.projectId, ['cards'])

  for (const duplicate of duplicates) {
    queryClient.setQueryData(cardDetailQueryOptions(duplicate.id).queryKey, {
      ...duplicate,
      attachments: [],
      comments: [],
    })
  }

  await Promise.all([
    invalidateProjectSearchCache(queryClient, input.projectId),
    invalidateWorkspaceSearchCache(queryClient),
  ])

  return duplicates
}

export async function runUpdateCardMutation(queryClient: QueryClient, input: UpdateCardInput) {
  const card = await cardRepository.updateCard(input)

  patchProjectCards(queryClient, card.projectId, (cards) =>
    cards.map((e) => (e.id === card.id ? {...card, groupPosition: e.groupPosition, statusPosition: e.statusPosition} : e)),
  )
  applyCardDetailPatch(queryClient, card)
  await Promise.all([
    invalidateProjectSearchCache(queryClient, card.projectId),
    invalidateWorkspaceSearchCache(queryClient),
  ])

  return card
}

export async function runMoveCardMutation(queryClient: QueryClient, input: MoveCardInput) {
  const card = await cardRepository.moveCard(input)
  const patchedCache = applyCardMoveToCache(queryClient, input, card)

  applyCardDetailPatch(queryClient, card)
  await Promise.all([
    invalidateProjectSearchCache(queryClient, input.projectId),
    invalidateWorkspaceSearchCache(queryClient),
    patchedCache ? Promise.resolve() : invalidateAllProjectData(queryClient, input.projectId),
  ])

  return card
}

export async function runMoveCardToGroupMutation(queryClient: QueryClient, input: MoveCardToGroupInput) {
  const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', input.projectId])
  const cardDetailSnapshots = await snapshotQueries<CardDetail | undefined>(
    queryClient,
    cardDetailQueryOptions(input.cardId).queryKey,
  )

  const patchedCache = applyCardMoveToGroupCache(queryClient, input)
  const optimisticCard = queryClient
    .getQueryData<CardRecord[]>(['project', 'cards', input.projectId])
    ?.find((entry) => entry.id === input.cardId)

  if (patchedCache && optimisticCard) {
    applyCardDetailPatch(queryClient, optimisticCard)
  }

  try {
    const card = await cardRepository.moveCardToGroup(input)

    patchProjectCards(queryClient, input.projectId, (cards) =>
      cards.map((entry) => (entry.id === card.id ? {...entry, ...card} : entry)),
    )
    applyCardDetailPatch(queryClient, card)

    runInBackground(Promise.all([
      invalidateProjectDataSlices(queryClient, input.projectId, ['cards']),
      invalidateProjectSearchCache(queryClient, input.projectId),
      invalidateWorkspaceSearchCache(queryClient),
    ]))

    return card
  } catch (error) {
    restoreQuerySnapshots(queryClient, cardSnapshots)
    restoreQuerySnapshots(queryClient, cardDetailSnapshots)
    throw error
  }
}

export async function runSetCardAssigneeMutation(queryClient: QueryClient, input: SetCardAssigneeInput) {
  const card = await cardRepository.setCardAssignee(input)

  patchProjectCards(queryClient, card.projectId, (cards) =>
    cards.map((e) => (e.id === card.id ? {...card, groupPosition: e.groupPosition, statusPosition: e.statusPosition} : e)),
  )
  applyCardDetailPatch(queryClient, card)
  await Promise.all([
    invalidateProjectSearchCache(queryClient, card.projectId),
    invalidateWorkspaceSearchCache(queryClient),
  ])

  return card
}

export async function runSetCardScheduleMutation(queryClient: QueryClient, input: SetCardScheduleInput) {
  const card = await cardRepository.setCardSchedule(input)

  patchProjectCards(queryClient, card.projectId, (cards) =>
    cards.map((e) => (e.id === card.id ? {...card, groupPosition: e.groupPosition, statusPosition: e.statusPosition} : e)),
  )
  applyCardDetailPatch(queryClient, card)
  await invalidateWorkspaceSearchCache(queryClient)

  return card
}

export function useCardDetailQuery(cardId: string | null) {
  return useQuery({
    ...cardDetailQueryOptions(cardId ?? 'missing-card'),
    enabled: Boolean(cardId),
  })
}

export function useCreateCardMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateCardInput) => runCreateCardMutation(queryClient, input),
  })
}

export function useUpdateCardMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateCardInput) => runUpdateCardMutation(queryClient, input),
  })
}

export function useMoveCardMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: MoveCardInput) => runMoveCardMutation(queryClient, input),
  })
}

export function useMoveCardToGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: MoveCardToGroupInput) => runMoveCardToGroupMutation(queryClient, input),
  })
}

export function useSetCardAssigneeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SetCardAssigneeInput) => runSetCardAssigneeMutation(queryClient, input),
  })
}

export function useSetCardScheduleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SetCardScheduleInput) => runSetCardScheduleMutation(queryClient, input),
  })
}

export function useAddCardCommentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AddCardCommentInput) => cardRepository.addComment(input),
    onSuccess: async (comment, input) => {
      queryClient.setQueryData<CardDetail | undefined>(cardDetailQueryOptions(input.cardId).queryKey, (current) =>
        current
          ? {
              ...current,
              comments: [...current.comments, comment],
            }
          : current,
      )
    },
  })
}

export function useUploadCardAttachmentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UploadCardAttachmentInput) => cardRepository.uploadAttachment(input),
    onSuccess: async (_attachment, input) => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: cardDetailQueryOptions(input.cardId).queryKey}),
        invalidateAllProjectData(queryClient, input.projectId),
      ])
    },
  })
}

export function applyRealtimeCardDetailPatch(queryClient: QueryClient, patch: CardDetailPatch) {
  applyCardDetailPatch(queryClient, patch)
}

type ArchiveCardsInput = {cardIds: string[]; projectId: string}

export async function runArchiveCardsMutation(queryClient: QueryClient, input: ArchiveCardsInput) {
  const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', input.projectId])
  const idSet = new Set(input.cardIds)
  const removedCards = (queryClient.getQueryData<CardRecord[]>(['project', 'cards', input.projectId]) ?? [])
    .filter((card) => idSet.has(card.id))

  patchProjectCards(queryClient, input.projectId, (cards) => cards.filter((e) => !idSet.has(e.id)))

  try {
    await cardRepository.archiveCards(input.cardIds)

    runInBackground(Promise.all([
      invalidateProjectDataSlices(queryClient, input.projectId, ['cards']),
      invalidateProjectSearchCache(queryClient, input.projectId),
      invalidateWorkspaceSearchCache(queryClient),
    ]))

    return removedCards
  } catch (error) {
    restoreQuerySnapshots(queryClient, cardSnapshots)
    throw error
  }
}

export async function runUnarchiveCardsMutation(
  queryClient: QueryClient,
  input: ArchiveCardsInput & {cards?: CardRecord[]},
) {
  const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', input.projectId])

  if (input.cards && input.cards.length > 0) {
    patchProjectCards(queryClient, input.projectId, (cards) => mergeCardsIntoCache(cards, input.cards ?? []))
  }

  try {
    await cardRepository.unarchiveCards(input.cardIds)

    runInBackground(Promise.all([
      invalidateProjectDataSlices(queryClient, input.projectId, ['cards']),
      invalidateProjectSearchCache(queryClient, input.projectId),
      invalidateWorkspaceSearchCache(queryClient),
    ]))
  } catch (error) {
    restoreQuerySnapshots(queryClient, cardSnapshots)
    throw error
  }
}

type TrashCardsInput = {cardIds: string[]; projectId: string}

export async function runTrashCardsMutation(queryClient: QueryClient, input: TrashCardsInput) {
  const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', input.projectId])
  const idSet = new Set(input.cardIds)
  const removedCards = (queryClient.getQueryData<CardRecord[]>(['project', 'cards', input.projectId]) ?? [])
    .filter((card) => idSet.has(card.id))

  patchProjectCards(queryClient, input.projectId, (cards) => cards.filter((e) => !idSet.has(e.id)))

  try {
    await cardRepository.trashCards(input.cardIds)

    runInBackground(Promise.all([
      invalidateProjectDataSlices(queryClient, input.projectId, ['cards']),
      invalidateProjectSearchCache(queryClient, input.projectId),
      invalidateWorkspaceSearchCache(queryClient),
    ]))

    return removedCards
  } catch (error) {
    restoreQuerySnapshots(queryClient, cardSnapshots)
    throw error
  }
}

export async function runRestoreCardsMutation(
  queryClient: QueryClient,
  input: TrashCardsInput & {cards?: CardRecord[]},
) {
  const cardSnapshots = await snapshotQueries<CardRecord[]>(queryClient, ['project', 'cards', input.projectId])

  if (input.cards && input.cards.length > 0) {
    patchProjectCards(queryClient, input.projectId, (cards) => mergeCardsIntoCache(cards, input.cards ?? []))
  }

  try {
    await cardRepository.restoreCards(input.cardIds)

    runInBackground(Promise.all([
      invalidateProjectDataSlices(queryClient, input.projectId, ['cards']),
      invalidateProjectSearchCache(queryClient, input.projectId),
      invalidateWorkspaceSearchCache(queryClient),
    ]))
  } catch (error) {
    restoreQuerySnapshots(queryClient, cardSnapshots)
    throw error
  }
}

export async function runPermanentDeleteCardsMutation(queryClient: QueryClient, input: TrashCardsInput) {
  await cardRepository.permanentDeleteCards(input.cardIds)
  await Promise.all([
    invalidateProjectSearchCache(queryClient, input.projectId),
    invalidateWorkspaceSearchCache(queryClient),
  ])
}

export function useArchiveCardsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ArchiveCardsInput) => runArchiveCardsMutation(queryClient, input),
  })
}

export function useTrashCardsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TrashCardsInput) => runTrashCardsMutation(queryClient, input),
  })
}

export function useRestoreCardsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TrashCardsInput) => runRestoreCardsMutation(queryClient, input),
  })
}
