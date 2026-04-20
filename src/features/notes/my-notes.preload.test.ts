import type {QueryClient} from '@tanstack/react-query'
import {describe, expect, it, vi} from 'vitest'

import {
  getCachedMyNotesInitialNoteId,
  prefetchCachedMyNotesInitialNote,
  warmMyNotesNavigation,
} from './my-notes.preload'
import type {NoteListItem} from './note.types'

function makeNote(overrides: Partial<NoteListItem> = {}): NoteListItem {
  return {
    createdAt: '2026-04-08T00:00:00Z',
    deletedAt: null,
    displayTitle: '',
    folderId: null,
    id: 'note-1',
    position: 0,
    previewText: '',
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    title: 'Note',
    updatedAt: '2026-04-08T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

function createQueryClient({
  folders = undefined,
  notes = undefined,
}: {
  folders?: unknown
  notes?: NoteListItem[] | undefined
} = {}) {
  const listKey = JSON.stringify(['notes', 'list', 'user-1'])
  const foldersKey = JSON.stringify(['notes', 'folders', 'user-1'])

  const queryClient = {
    getQueryData: vi.fn((queryKey: unknown) => {
      const serializedKey = JSON.stringify(queryKey)
      if (serializedKey === listKey) {
        return notes
      }
      if (serializedKey === foldersKey) {
        return folders
      }
      return undefined
    }),
    prefetchQuery: vi.fn((options: {queryKey: unknown}) => {
      const serializedKey = JSON.stringify(options.queryKey)
      if (serializedKey === listKey) {
        return Promise.resolve(notes ?? [])
      }
      return Promise.resolve(null)
    }),
  } as unknown as QueryClient

  return queryClient
}

describe('my-notes preload helpers', () => {
  it('resolves the requested cached note id when note summaries are already warm', () => {
    const queryClient = createQueryClient({
      notes: [makeNote({id: 'note-1'}), makeNote({id: 'note-2'})],
    })

    expect(getCachedMyNotesInitialNoteId(queryClient, 'user-1', 'note-2')).toBe('note-2')
    expect(getCachedMyNotesInitialNoteId(queryClient, 'user-1', 'missing-note')).toBe('note-1')
  })

  it('prefetches the cached initial note detail without waiting on the list query', () => {
    const queryClient = createQueryClient({
      notes: [makeNote({id: 'note-1'})],
    })

    const initialNoteId = prefetchCachedMyNotesInitialNote(queryClient, 'user-1')

    expect(initialNoteId).toBe('note-1')
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['notes', 'detail', 'note-1'],
    }))
  })

  it('warms the route, summary queries, and initial note detail together', async () => {
    const queryClient = createQueryClient({
      notes: [makeNote({id: 'note-1'})],
    })
    const router = {
      preloadRoute: vi.fn(() => Promise.resolve()),
    }

    warmMyNotesNavigation({
      queryClient,
      router,
      userId: 'user-1',
      workspaceSlug: 'main-workspace',
    })

    await Promise.resolve()

    expect(router.preloadRoute).toHaveBeenCalledWith(expect.objectContaining({
      search: {workspaceSlug: 'main-workspace'},
      to: '/my-notes',
    }))
  })
})
