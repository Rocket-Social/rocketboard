import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'

const {
  archiveCardsMock,
  duplicateCardsMock,
  moveCardToGroupMock,
  restoreCardsMock,
  trashCardsMock,
  unarchiveCardsMock,
} = vi.hoisted(() => ({
  archiveCardsMock: vi.fn(),
  duplicateCardsMock: vi.fn(),
  moveCardToGroupMock: vi.fn(),
  restoreCardsMock: vi.fn(),
  trashCardsMock: vi.fn(),
  unarchiveCardsMock: vi.fn(),
}))

vi.mock('./card.repository', () => ({
  cardRepository: {
    archiveCards: archiveCardsMock,
    duplicateCards: duplicateCardsMock,
    moveCardToGroup: moveCardToGroupMock,
    restoreCards: restoreCardsMock,
    trashCards: trashCardsMock,
    unarchiveCards: unarchiveCardsMock,
  },
}))

import {
  applyRealtimeCardDetailPatch,
  cardDetailQueryOptions,
  runArchiveCardsMutation,
  runDuplicateCardsMutation,
  runMoveCardToGroupMutation,
  runRestoreCardsMutation,
  runTrashCardsMutation,
  runUnarchiveCardsMutation,
} from './card.queries'
import type {CardDetail, CardRecord} from './card.types'

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {promise, reject, resolve}
}

function makeCardRecord(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Test User',
    assigneeUserId: null,
    bodyJson: {content: [], type: 'doc'},
    bodyMd: '',
    completedAt: null,
    createdAt: '2026-03-24T12:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: null,
    startAt: null,
    statusOptionId: 'opt-todo',
    statusPosition: 0,
    tags: [],
    title: 'Test Card',
    ...overrides,
  }
}

function makeCardDetail(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    agentRunSummary: null,
    attachments: [],
    comments: [],
    ...makeCardRecord(),
    ...overrides,
  }
}

function createQueryClient() {
  return createTestQueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  })
}

beforeEach(() => {
  archiveCardsMock.mockReset()
  duplicateCardsMock.mockReset()
  moveCardToGroupMock.mockReset()
  restoreCardsMock.mockReset()
  trashCardsMock.mockReset()
  unarchiveCardsMock.mockReset()
})

describe('applyRealtimeCardDetailPatch', () => {
  it('applies completedAt to cached card detail', () => {
    const queryClient = createTestQueryClient()

    queryClient.setQueryData(cardDetailQueryOptions('card-1').queryKey, makeCardDetail())

    applyRealtimeCardDetailPatch(queryClient, {
      bodyMd: '',
      completedAt: '2026-03-28T09:15:00.000Z',
      dueAt: '2026-03-29',
      effort: null,
      groupPosition: 0,
      id: 'card-1',
      priorityOptionId: null,
      projectId: 'project-1',
      startAt: '2026-03-25',
      statusOptionId: 'opt-done',
      statusPosition: 0,
      tags: [],
      title: 'Test Card',
    })

    const updated = queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)

    expect(updated?.completedAt).toBe('2026-03-28T09:15:00.000Z')
    expect(updated?.statusOptionId).toBe('opt-done')
  })
})

describe('card lifecycle mutations', () => {
  it('optimistically reorders cards when moving a card between groups and rolls back on failure', async () => {
    const queryClient = createQueryClient()
    const moveDeferred = deferredPromise<CardRecord>()

    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({groupId: 'group-a', groupPosition: 0, id: 'card-1'}),
      makeCardRecord({groupId: 'group-a', groupPosition: 1, id: 'card-2'}),
      makeCardRecord({groupId: 'group-b', groupPosition: 0, id: 'card-3'}),
    ])
    queryClient.setQueryData<CardDetail>(
      cardDetailQueryOptions('card-2').queryKey,
      makeCardDetail({groupId: 'group-a', groupPosition: 1, id: 'card-2'}),
    )
    moveCardToGroupMock.mockReturnValue(moveDeferred.promise)

    const mutationPromise = runMoveCardToGroupMutation(queryClient, {
      cardId: 'card-2',
      projectId: 'project-1',
      targetGroupId: 'group-b',
      targetPosition: 0,
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
        expect.objectContaining({groupId: 'group-a', groupPosition: 0, id: 'card-1'}),
        expect.objectContaining({groupId: 'group-b', groupPosition: 0, id: 'card-2'}),
        expect.objectContaining({groupId: 'group-b', groupPosition: 1, id: 'card-3'}),
      ])
      expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-2').queryKey)?.groupId).toBe('group-b')
    })

    moveDeferred.reject(new Error('network down'))

    await expect(mutationPromise).rejects.toThrow('network down')
    expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
      expect.objectContaining({groupId: 'group-a', groupPosition: 0, id: 'card-1'}),
      expect.objectContaining({groupId: 'group-a', groupPosition: 1, id: 'card-2'}),
      expect.objectContaining({groupId: 'group-b', groupPosition: 0, id: 'card-3'}),
    ])
    expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-2').queryKey)?.groupId).toBe('group-a')
  })

  it('optimistically removes archived cards and avoids workspace summary invalidation', async () => {
    const queryClient = createQueryClient()
    const archiveDeferred = deferredPromise<void>()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-1'}),
      makeCardRecord({id: 'card-2', title: 'Card 2'}),
    ])
    archiveCardsMock.mockReturnValue(archiveDeferred.promise)

    const mutationPromise = runArchiveCardsMutation(queryClient, {cardIds: ['card-1'], projectId: 'project-1'})

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
        expect.objectContaining({id: 'card-2'}),
      ])
    })

    archiveDeferred.resolve()

    await expect(mutationPromise).resolves.toEqual([
      expect.objectContaining({id: 'card-1'}),
    ])
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['project', 'cards', 'project-1']})
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['project-search', 'project-1']})
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['workspace-search']})
    expect(invalidateSpy).not.toHaveBeenCalledWith({queryKey: ['project', 'workspace-summaries']})
  })

  it('rolls back archived cards when the archive request fails', async () => {
    const queryClient = createQueryClient()
    const archiveDeferred = deferredPromise<void>()

    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-1'}),
      makeCardRecord({id: 'card-2', title: 'Card 2'}),
    ])
    archiveCardsMock.mockReturnValue(archiveDeferred.promise)

    const mutationPromise = runArchiveCardsMutation(queryClient, {cardIds: ['card-1'], projectId: 'project-1'})

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
        expect.objectContaining({id: 'card-2'}),
      ])
    })

    archiveDeferred.reject(new Error('archive failed'))

    await expect(mutationPromise).rejects.toThrow('archive failed')
    expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
      expect.objectContaining({id: 'card-1'}),
      expect.objectContaining({id: 'card-2'}),
    ])
  })

  it('re-inserts unarchived cards immediately when a cached snapshot is available', async () => {
    const queryClient = createQueryClient()
    const unarchiveDeferred = deferredPromise<void>()

    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-2', title: 'Card 2'}),
    ])
    unarchiveCardsMock.mockReturnValue(unarchiveDeferred.promise)

    const mutationPromise = runUnarchiveCardsMutation(queryClient, {
      cardIds: ['card-1'],
      cards: [makeCardRecord({id: 'card-1'})],
      projectId: 'project-1',
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
        expect.objectContaining({id: 'card-2'}),
        expect.objectContaining({id: 'card-1'}),
      ])
    })

    unarchiveDeferred.resolve()
    await expect(mutationPromise).resolves.toBeUndefined()
  })

  it('rolls back restored cards when the restore request fails', async () => {
    const queryClient = createQueryClient()
    const restoreDeferred = deferredPromise<void>()

    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-2', title: 'Card 2'}),
    ])
    restoreCardsMock.mockReturnValue(restoreDeferred.promise)

    const mutationPromise = runRestoreCardsMutation(queryClient, {
      cardIds: ['card-1'],
      cards: [makeCardRecord({id: 'card-1'})],
      projectId: 'project-1',
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
        expect.objectContaining({id: 'card-2'}),
        expect.objectContaining({id: 'card-1'}),
      ])
    })

    restoreDeferred.reject(new Error('restore failed'))

    await expect(mutationPromise).rejects.toThrow('restore failed')
    expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
      expect.objectContaining({id: 'card-2'}),
    ])
  })

  it('optimistically removes trashed cards and returns them for undo', async () => {
    const queryClient = createQueryClient()
    const trashDeferred = deferredPromise<void>()

    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-1'}),
      makeCardRecord({id: 'card-2', title: 'Card 2'}),
    ])
    trashCardsMock.mockReturnValue(trashDeferred.promise)

    const mutationPromise = runTrashCardsMutation(queryClient, {cardIds: ['card-1'], projectId: 'project-1'})

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])).toEqual([
        expect.objectContaining({id: 'card-2'}),
      ])
    })

    trashDeferred.resolve()

    await expect(mutationPromise).resolves.toEqual([
      expect.objectContaining({id: 'card-1'}),
    ])
  })
})

describe('runDuplicateCardsMutation', () => {
  it('returns [] without calling the repository when cardIds is empty', async () => {
    const queryClient = createQueryClient()

    const result = await runDuplicateCardsMutation(queryClient, {cardIds: [], projectId: 'project-1'})

    expect(result).toEqual([])
    expect(duplicateCardsMock).not.toHaveBeenCalled()
  })

  it('invalidates project cards and seeds card detail cache for each duplicate', async () => {
    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const duplicates = [
      makeCardRecord({id: 'card-2-copy', title: 'Card 2 (copy)'}),
      makeCardRecord({id: 'card-3-copy', title: 'Card 3 (copy)'}),
    ]
    duplicateCardsMock.mockResolvedValue(duplicates)

    const result = await runDuplicateCardsMutation(queryClient, {
      cardIds: ['card-2', 'card-3'],
      projectId: 'project-1',
    })

    expect(result).toEqual(duplicates)
    expect(duplicateCardsMock).toHaveBeenCalledWith({
      cardIds: ['card-2', 'card-3'],
      projectId: 'project-1',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['project', 'cards', 'project-1']})
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['project-search', 'project-1']})
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: ['workspace-search']})
    expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-2-copy').queryKey)).toEqual(
      expect.objectContaining({id: 'card-2-copy', title: 'Card 2 (copy)', attachments: [], comments: []}),
    )
    expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-3-copy').queryKey)).toEqual(
      expect.objectContaining({id: 'card-3-copy', title: 'Card 3 (copy)'}),
    )
  })

  it('throws when the repository returns no rows for a non-empty input', async () => {
    const queryClient = createQueryClient()
    duplicateCardsMock.mockResolvedValue([])

    await expect(
      runDuplicateCardsMutation(queryClient, {cardIds: ['card-1'], projectId: 'project-1'}),
    ).rejects.toThrow('No cards were duplicated')
  })

  it('propagates repository errors and does not seed cache', async () => {
    const queryClient = createQueryClient()
    duplicateCardsMock.mockRejectedValue(new Error('rpc failed'))

    await expect(
      runDuplicateCardsMutation(queryClient, {cardIds: ['card-1'], projectId: 'project-1'}),
    ).rejects.toThrow('rpc failed')
    expect(queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)).toBeUndefined()
  })
})

