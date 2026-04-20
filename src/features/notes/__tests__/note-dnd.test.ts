import {describe, expect, it} from 'vitest'

import {applyNoteMove, getNoteDropIndicatorPosition} from '../note-dnd'
import type {NoteListItem} from '../note.types'

function makeNote(overrides: Partial<NoteListItem> = {}): NoteListItem {
  const title = overrides.title ?? 'Roadmap review'

  return {
    createdAt: '2026-04-08T00:00:00Z',
    deletedAt: null,
    displayTitle: overrides.displayTitle ?? title,
    folderId: overrides.folderId ?? 'folder-1',
    id: overrides.id ?? 'note-1',
    position: overrides.position ?? 0,
    previewText: overrides.previewText ?? 'Meeting notes body',
    sourceConnectionId: overrides.sourceConnectionId ?? null,
    sourceCreatedAt: overrides.sourceCreatedAt ?? null,
    sourceDetached: overrides.sourceDetached ?? false,
    sourceId: overrides.sourceId ?? null,
    sourceMetadata: overrides.sourceMetadata ?? {},
    sourceProvider: overrides.sourceProvider ?? null,
    sourceUpdatedAt: overrides.sourceUpdatedAt ?? null,
    title,
    updatedAt: '2026-04-08T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

describe('getNoteDropIndicatorPosition', () => {
  it('returns before when the dragged note center is above the hovered note center', () => {
    expect(getNoteDropIndicatorPosition({
      activeRectHeight: 20,
      activeRectTop: 10,
      overRectHeight: 20,
      overRectTop: 40,
    })).toBe('before')
  })

  it('returns after when the dragged note center is below the hovered note center', () => {
    expect(getNoteDropIndicatorPosition({
      activeRectHeight: 20,
      activeRectTop: 50,
      overRectHeight: 20,
      overRectTop: 10,
    })).toBe('after')
  })
})

describe('applyNoteMove', () => {
  it('reorders a note within the same folder using the displayed note order', () => {
    const notes = [
      makeNote({id: 'note-1', position: 5}),
      makeNote({id: 'note-2', position: 9}),
      makeNote({id: 'note-3', position: 12}),
    ]
    const notesByFolder = new Map<string | null, NoteListItem[]>([
      ['folder-1', notes],
    ])

    const result = applyNoteMove({
      activeNoteId: 'note-1',
      notes,
      notesByFolder,
      targetFolderId: 'folder-1',
      targetIndex: 3,
    })

    expect(result?.updates).toEqual([
      {folderId: 'folder-1', noteId: 'note-2', position: 0},
      {folderId: 'folder-1', noteId: 'note-3', position: 1},
      {folderId: 'folder-1', noteId: 'note-1', position: 2},
    ])
    expect(result?.nextNotes.find((note) => note.id === 'note-1')).toMatchObject({
      folderId: 'folder-1',
      position: 2,
    })
  })

  it('moves a note into a different folder and reindexes both folders', () => {
    const noteOne = makeNote({id: 'note-1', folderId: 'folder-1', position: 0})
    const noteTwo = makeNote({id: 'note-2', folderId: 'folder-1', position: 1})
    const noteThree = makeNote({id: 'note-3', folderId: 'folder-2', position: 4})
    const notes = [noteOne, noteTwo, noteThree]
    const notesByFolder = new Map<string | null, NoteListItem[]>([
      ['folder-1', [noteOne, noteTwo]],
      ['folder-2', [noteThree]],
    ])

    const result = applyNoteMove({
      activeNoteId: 'note-2',
      notes,
      notesByFolder,
      targetFolderId: 'folder-2',
      targetIndex: 1,
    })

    expect(result?.updates).toEqual([
      {folderId: 'folder-1', noteId: 'note-1', position: 0},
      {folderId: 'folder-2', noteId: 'note-3', position: 0},
      {folderId: 'folder-2', noteId: 'note-2', position: 1},
    ])
    expect(result?.nextNotes.find((note) => note.id === 'note-2')).toMatchObject({
      folderId: 'folder-2',
      position: 1,
    })
  })

  it('returns null when the note stays in the same displayed position', () => {
    const notes = [
      makeNote({id: 'note-1', position: 0}),
      makeNote({id: 'note-2', position: 1}),
    ]
    const notesByFolder = new Map<string | null, NoteListItem[]>([
      ['folder-1', notes],
    ])

    expect(applyNoteMove({
      activeNoteId: 'note-1',
      notes,
      notesByFolder,
      targetFolderId: 'folder-1',
      targetIndex: 1,
    })).toBeNull()
  })
})
