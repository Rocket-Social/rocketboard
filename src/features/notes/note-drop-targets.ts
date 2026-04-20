import {getNoteDropIndicatorPosition, type NoteDropIndicator} from './note-dnd'

export type NoteDropTargetNote = {
  folderId: string | null
  id: string
}

export type FolderDropTargetFolder = {
  id: string
  parentId: string | null
}

export type FolderDropIndicator =
  | {folderId: string; kind: 'inside'}
  | {folderId: string; kind: 'row'; position: 'after' | 'before'}
  | {index: number; kind: 'root'}

export function parseNoteId(dndId: string) {
  return dndId.startsWith('note:') ? dndId.slice(5) : null
}

export function parseFolderId(dndId: string) {
  return dndId.startsWith('folder:') ? dndId.slice(7) : null
}

export function noteDropSlotId(folderId: string | null, index: number) {
  return `drop:note-slot:${folderId ?? '__unfiled__'}:${index}`
}

export function parseNoteDropSlotId(dndId: string) {
  if (!dndId.startsWith('drop:note-slot:')) {
    return null
  }

  const raw = dndId.slice(15)
  const lastSeparatorIndex = raw.lastIndexOf(':')
  if (lastSeparatorIndex === -1) {
    return null
  }

  const folderKey = raw.slice(0, lastSeparatorIndex)
  const index = Number(raw.slice(lastSeparatorIndex + 1))
  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  return {
    folderId: folderKey === '__unfiled__' ? null : folderKey,
    index,
  }
}

export function topLevelFolderDropSlotId(index: number) {
  return `drop:folder-root:${index}`
}

export function parseTopLevelFolderDropSlotId(dndId: string) {
  if (!dndId.startsWith('drop:folder-root:')) {
    return null
  }

  const index = Number(dndId.slice(17))
  if (!Number.isInteger(index) || index < 0) {
    return null
  }

  return index
}

function isFolderDescendant(
  foldersById: Map<string, FolderDropTargetFolder>,
  ancestorFolderId: string,
  targetFolderId: string,
) {
  let cursor = foldersById.get(targetFolderId) ?? null

  while (cursor?.parentId) {
    if (cursor.parentId === ancestorFolderId) {
      return true
    }

    cursor = foldersById.get(cursor.parentId) ?? null
  }

  return false
}

function getFolderRowDropPosition(params: {
  activeRectHeight?: number
  activeRectTop?: number
  overRectHeight?: number
  overRectTop?: number
}) {
  return (
    params.activeRectTop == null
    || params.activeRectHeight == null
    || params.overRectTop == null
    || params.overRectHeight == null
  )
    ? 'before'
    : getNoteDropIndicatorPosition({
      activeRectHeight: params.activeRectHeight,
      activeRectTop: params.activeRectTop,
      overRectHeight: params.overRectHeight,
      overRectTop: params.overRectTop,
    })
}

export function resolveNoteDropIndicator(params: {
  activeDndId: string
  activeRectHeight?: number
  activeRectTop?: number
  notesByFolder: Map<string | null, NoteDropTargetNote[]>
  notesById: Map<string, NoteDropTargetNote>
  overDndId: string
  overRectHeight?: number
  overRectTop?: number
  unfiledTopLevelDndId: string
}): NoteDropIndicator | null {
  const activeNoteRealId = parseNoteId(params.activeDndId)
  if (!activeNoteRealId) {
    return null
  }

  const overNoteSlot = parseNoteDropSlotId(params.overDndId)
  if (overNoteSlot) {
    return {
      folderId: overNoteSlot.folderId,
      targetIndex: overNoteSlot.index,
    }
  }

  const overNoteRealId = parseNoteId(params.overDndId)
  if (overNoteRealId) {
    if (overNoteRealId === activeNoteRealId) {
      return null
    }

    const overNote = params.notesById.get(overNoteRealId)
    if (!overNote) {
      return null
    }

    const folderNotes = params.notesByFolder.get(overNote.folderId) ?? []
    const overNoteIndex = folderNotes.findIndex((note) => note.id === overNote.id)
    if (overNoteIndex === -1) {
      return null
    }

    if (
      params.activeRectTop == null
      || params.activeRectHeight == null
      || params.overRectTop == null
      || params.overRectHeight == null
    ) {
      return {
        folderId: overNote.folderId,
        targetIndex: overNoteIndex,
      }
    }

    return {
      folderId: overNote.folderId,
      targetIndex: overNoteIndex + (getNoteDropIndicatorPosition({
        activeRectHeight: params.activeRectHeight,
        activeRectTop: params.activeRectTop,
        overRectHeight: params.overRectHeight,
        overRectTop: params.overRectTop,
      }) === 'after' ? 1 : 0),
    }
  }

  if (params.overDndId === 'drop:folder:__unfiled__' || params.overDndId === params.unfiledTopLevelDndId) {
    return {
      folderId: null,
      targetIndex: (params.notesByFolder.get(null) ?? []).length,
    }
  }

  const overFolderId = params.overDndId.startsWith('drop:folder:')
    ? params.overDndId.slice(12)
    : parseFolderId(params.overDndId)

  if (overFolderId) {
    return {
      folderId: overFolderId,
      targetIndex: (params.notesByFolder.get(overFolderId) ?? []).length,
    }
  }

  return null
}

export function resolveCommittedNoteDropIndicator(params: {
  activeDndId: string
  activeRectHeight?: number
  activeRectTop?: number
  currentIndicator: NoteDropIndicator | null
  notesByFolder: Map<string | null, NoteDropTargetNote[]>
  notesById: Map<string, NoteDropTargetNote>
  overDndId: string
  overRectHeight?: number
  overRectTop?: number
  unfiledTopLevelDndId: string
}): NoteDropIndicator | null {
  if (parseNoteId(params.activeDndId) && params.currentIndicator) {
    return params.currentIndicator
  }

  return resolveNoteDropIndicator(params)
}

export function resolveFolderDropIndicator(params: {
  activeDndId: string
  activeRectHeight?: number
  activeRectTop?: number
  foldersById?: Map<string, FolderDropTargetFolder>
  managedFolderIds?: ReadonlySet<string>
  overDndId: string
  overRectHeight?: number
  overRectTop?: number
}): FolderDropIndicator | null {
  const activeFolderRealId = parseFolderId(params.activeDndId)
  if (!activeFolderRealId) {
    return null
  }

  const rootDropSlotIndex = parseTopLevelFolderDropSlotId(params.overDndId)
  if (rootDropSlotIndex !== null) {
    return {
      index: rootDropSlotIndex,
      kind: 'root',
    }
  }

  const overFolderDropId = params.overDndId.startsWith('drop:folder:') ? params.overDndId.slice(12) : null
  if (overFolderDropId && overFolderDropId !== '__unfiled__' && overFolderDropId !== activeFolderRealId) {
    const overFolder = params.foldersById?.get(overFolderDropId) ?? null
    const isManaged = overFolder ? params.managedFolderIds?.has(overFolder.id) ?? false : false
    const isDescendant = overFolder && params.foldersById
      ? isFolderDescendant(params.foldersById, activeFolderRealId, overFolder.id)
      : false

    if (overFolder && !isManaged && overFolder.parentId === null && !isDescendant) {
      return {
        folderId: overFolderDropId,
        kind: 'inside',
      }
    }

    if (overFolder && !isManaged && !isDescendant) {
      return {
        folderId: overFolder.id,
        kind: 'row',
        position: getFolderRowDropPosition(params),
      }
    }

    if (params.foldersById) {
      return null
    }

    return {
      folderId: overFolderDropId,
      kind: 'inside',
    }
  }

  const overFolderRealId = parseFolderId(params.overDndId)
  if (!overFolderRealId || overFolderRealId === activeFolderRealId) {
    return null
  }

  if (params.foldersById) {
    const overFolder = params.foldersById.get(overFolderRealId)
    const isManaged = overFolder ? params.managedFolderIds?.has(overFolder.id) ?? false : false
    const isDescendant = overFolder
      ? isFolderDescendant(params.foldersById, activeFolderRealId, overFolder.id)
      : false

    if (!overFolder || isManaged || isDescendant) {
      return null
    }
  }

  return {
    folderId: overFolderRealId,
    kind: 'row',
    position: getFolderRowDropPosition(params),
  }
}

export function resolveCommittedFolderDropIndicator(params: {
  activeDndId: string
  activeRectHeight?: number
  activeRectTop?: number
  currentIndicator: FolderDropIndicator | null
  foldersById?: Map<string, FolderDropTargetFolder>
  managedFolderIds?: ReadonlySet<string>
  overDndId: string
  overRectHeight?: number
  overRectTop?: number
}): FolderDropIndicator | null {
  if (parseFolderId(params.activeDndId) && params.currentIndicator) {
    return params.currentIndicator
  }

  return resolveFolderDropIndicator(params)
}
