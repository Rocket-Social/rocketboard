import {describe, expect, it} from 'vitest'

import {
  type FolderDropTargetFolder,
  resolveCommittedFolderDropIndicator,
  resolveCommittedNoteDropIndicator,
  noteDropSlotId,
  parseNoteDropSlotId,
  parseTopLevelFolderDropSlotId,
  resolveFolderDropIndicator,
  resolveNoteDropIndicator,
  topLevelFolderDropSlotId,
  type NoteDropTargetNote,
} from '../note-drop-targets'

function buildNotesByFolder(entries: Array<NoteDropTargetNote>) {
  const notesByFolder = new Map<string | null, NoteDropTargetNote[]>()

  for (const note of entries) {
    const folderNotes = notesByFolder.get(note.folderId) ?? []
    folderNotes.push(note)
    notesByFolder.set(note.folderId, folderNotes)
  }

  return notesByFolder
}

function buildFoldersById(entries: Array<FolderDropTargetFolder>) {
  return new Map(entries.map((folder) => [folder.id, folder]))
}

describe('parseNoteDropSlotId', () => {
  it('parses folder note slot ids', () => {
    expect(parseNoteDropSlotId(noteDropSlotId('folder-1', 2))).toEqual({
      folderId: 'folder-1',
      index: 2,
    })
  })

  it('parses unfiled note slot ids', () => {
    expect(parseNoteDropSlotId(noteDropSlotId(null, 1))).toEqual({
      folderId: null,
      index: 1,
    })
  })
})

describe('parseTopLevelFolderDropSlotId', () => {
  it('parses top-level folder slot ids', () => {
    expect(parseTopLevelFolderDropSlotId(topLevelFolderDropSlotId(3))).toBe(3)
  })
})

describe('resolveNoteDropIndicator', () => {
  it('uses explicit insertion slots for in-folder note reordering', () => {
    const notes = [
      {folderId: 'folder-1', id: 'note-1'},
      {folderId: 'folder-1', id: 'note-2'},
    ]

    expect(resolveNoteDropIndicator({
      activeDndId: 'note:note-1',
      notesByFolder: buildNotesByFolder(notes),
      notesById: new Map(notes.map((note) => [note.id, note])),
      overDndId: noteDropSlotId('folder-1', 2),
      unfiledTopLevelDndId: 'top-level:unfiled',
    })).toEqual({
      folderId: 'folder-1',
      targetIndex: 2,
    })
  })

  it('places a dragged note after a hovered note when the dragged center is lower', () => {
    const notes = [
      {folderId: 'folder-1', id: 'note-1'},
      {folderId: 'folder-1', id: 'note-2'},
    ]

    expect(resolveNoteDropIndicator({
      activeDndId: 'note:note-1',
      activeRectHeight: 20,
      activeRectTop: 50,
      notesByFolder: buildNotesByFolder(notes),
      notesById: new Map(notes.map((note) => [note.id, note])),
      overDndId: 'note:note-2',
      overRectHeight: 20,
      overRectTop: 10,
      unfiledTopLevelDndId: 'top-level:unfiled',
    })).toEqual({
      folderId: 'folder-1',
      targetIndex: 2,
    })
  })

  it('appends notes when dropping onto a folder or the top-level unfiled row', () => {
    const folderNotes = [
      {folderId: 'folder-1', id: 'note-1'},
      {folderId: null, id: 'note-2'},
      {folderId: null, id: 'note-3'},
    ]
    const notesByFolder = buildNotesByFolder(folderNotes)
    const notesById = new Map(folderNotes.map((note) => [note.id, note]))

    expect(resolveNoteDropIndicator({
      activeDndId: 'note:note-2',
      notesByFolder,
      notesById,
      overDndId: 'drop:folder:folder-1',
      unfiledTopLevelDndId: 'top-level:unfiled',
    })).toEqual({
      folderId: 'folder-1',
      targetIndex: 1,
    })

    expect(resolveNoteDropIndicator({
      activeDndId: 'note:note-1',
      notesByFolder,
      notesById,
      overDndId: 'top-level:unfiled',
      unfiledTopLevelDndId: 'top-level:unfiled',
    })).toEqual({
      folderId: null,
      targetIndex: 2,
    })
  })
})

describe('resolveCommittedNoteDropIndicator', () => {
  it('prefers the last visible indicator over the raw drop target', () => {
    const notes = [
      {folderId: 'folder-a', id: 'note-1'},
      {folderId: 'folder-b', id: 'note-2'},
    ]

    expect(resolveCommittedNoteDropIndicator({
      activeDndId: 'note:note-1',
      currentIndicator: {
        folderId: 'folder-b',
        targetIndex: 1,
      },
      notesByFolder: buildNotesByFolder(notes),
      notesById: new Map(notes.map((note) => [note.id, note])),
      overDndId: 'drop:folder:folder-a',
      unfiledTopLevelDndId: 'top-level:unfiled',
    })).toEqual({
      folderId: 'folder-b',
      targetIndex: 1,
    })
  })

  it('keeps the last visible indicator when drag end has no over target', () => {
    expect(resolveCommittedNoteDropIndicator({
      activeDndId: 'note:note-1',
      currentIndicator: {
        folderId: 'folder-b',
        targetIndex: 1,
      },
      notesByFolder: new Map(),
      notesById: new Map(),
      overDndId: '',
      unfiledTopLevelDndId: 'top-level:unfiled',
    })).toEqual({
      folderId: 'folder-b',
      targetIndex: 1,
    })
  })
})

describe('resolveFolderDropIndicator', () => {
  it('uses explicit root slots for top-level folder placement', () => {
    expect(resolveFolderDropIndicator({
      activeDndId: 'folder:child',
      overDndId: topLevelFolderDropSlotId(1),
    })).toEqual({
      index: 1,
      kind: 'root',
    })
  })

  it('treats folder drop zones as nested placement targets', () => {
    expect(resolveFolderDropIndicator({
      activeDndId: 'folder:child',
      overDndId: 'drop:folder:parent',
    })).toEqual({
      folderId: 'parent',
      kind: 'inside',
    })
  })

  it('uses row geometry to choose before or after for sibling folder reordering', () => {
    expect(resolveFolderDropIndicator({
      activeDndId: 'folder:notes',
      activeRectHeight: 20,
      activeRectTop: 50,
      overDndId: 'folder:archive',
      overRectHeight: 20,
      overRectTop: 10,
    })).toEqual({
      folderId: 'archive',
      kind: 'row',
      position: 'after',
    })
  })

  it('ignores dragging a folder onto itself', () => {
    expect(resolveFolderDropIndicator({
      activeDndId: 'folder:notes',
      overDndId: 'folder:notes',
    })).toBeNull()
  })

  it('falls back to row placement for nested folder drop zones that cannot accept children', () => {
    expect(resolveFolderDropIndicator({
      activeDndId: 'folder:notes',
      activeRectHeight: 20,
      activeRectTop: 50,
      foldersById: buildFoldersById([
        {id: 'notes', parentId: null},
        {id: 'child', parentId: 'parent'},
        {id: 'parent', parentId: null},
      ]),
      managedFolderIds: new Set(),
      overDndId: 'drop:folder:child',
      overRectHeight: 20,
      overRectTop: 10,
    })).toEqual({
      folderId: 'child',
      kind: 'row',
      position: 'after',
    })
  })

  it('suppresses managed folder drop zones that cannot accept moves', () => {
    expect(resolveFolderDropIndicator({
      activeDndId: 'folder:notes',
      foldersById: buildFoldersById([
        {id: 'notes', parentId: null},
        {id: 'managed', parentId: null},
      ]),
      managedFolderIds: new Set(['managed']),
      overDndId: 'drop:folder:managed',
    })).toBeNull()
  })
})

describe('resolveCommittedFolderDropIndicator', () => {
  it('prefers the last visible row placement over a final folder-body hover id', () => {
    expect(resolveCommittedFolderDropIndicator({
      activeDndId: 'folder:child',
      currentIndicator: {
        folderId: 'parent',
        kind: 'row',
        position: 'after',
      },
      overDndId: 'drop:folder:parent',
    })).toEqual({
      folderId: 'parent',
      kind: 'row',
      position: 'after',
    })
  })

  it('keeps the last visible folder target when drag end has no over target', () => {
    expect(resolveCommittedFolderDropIndicator({
      activeDndId: 'folder:child',
      currentIndicator: {
        folderId: 'parent',
        kind: 'row',
        position: 'after',
      },
      overDndId: '',
    })).toEqual({
      folderId: 'parent',
      kind: 'row',
      position: 'after',
    })
  })
})
