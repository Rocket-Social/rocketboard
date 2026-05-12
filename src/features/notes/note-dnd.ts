import type {NoteListItem} from './note.types'

export type NoteDropIndicator = {
  folderId: string | null
  targetIndex: number
}

export type NoteMoveResult = {
  nextNotes: NoteListItem[]
  updates: {noteId: string; folderId: string | null; position: number}[]
}

export function getNoteDropIndicatorPosition(params: {
  activeRectHeight: number
  activeRectTop: number
  overRectHeight: number
  overRectTop: number
}): 'after' | 'before' {
  const activeCenterY = params.activeRectTop + params.activeRectHeight / 2
  const overCenterY = params.overRectTop + params.overRectHeight / 2

  return activeCenterY >= overCenterY ? 'after' : 'before'
}

export function applyNoteMove(params: {
  activeNoteId: string
  notes: NoteListItem[]
  notesByFolder: Map<string | null, NoteListItem[]>
  targetFolderId: string | null
  targetIndex: number
}): NoteMoveResult | null {
  const activeNote = params.notes.find((note) => note.id === params.activeNoteId)
  if (!activeNote) {
    return null
  }

  const sourceFolderId = activeNote.folderId
  const sourceNotes = [...(params.notesByFolder.get(sourceFolderId) ?? [])]
  const targetNotes = sourceFolderId === params.targetFolderId
    ? sourceNotes
    : [...(params.notesByFolder.get(params.targetFolderId) ?? [])]
  const sourceIndex = sourceNotes.findIndex((note) => note.id === params.activeNoteId)

  if (sourceIndex === -1) {
    return null
  }

  const [movedNote] = sourceNotes.splice(sourceIndex, 1)
  if (!movedNote) {
    return null
  }

  const unclampedTargetIndex = sourceFolderId === params.targetFolderId && sourceIndex < params.targetIndex
    ? params.targetIndex - 1
    : params.targetIndex
  const targetIndex = Math.min(Math.max(unclampedTargetIndex, 0), targetNotes.length)

  targetNotes.splice(targetIndex, 0, movedNote)

  if (sourceFolderId === params.targetFolderId) {
    const previousOrder = (params.notesByFolder.get(sourceFolderId) ?? []).map((note) => note.id)
    const nextOrder = targetNotes.map((note) => note.id)

    if (previousOrder.length === nextOrder.length && previousOrder.every((id, index) => id === nextOrder[index])) {
      return null
    }
  }

  const updateMap = new Map<string, {folderId: string | null; position: number}>()

  if (sourceFolderId === params.targetFolderId) {
    for (const [index, note] of targetNotes.entries()) {
      updateMap.set(note.id, {folderId: params.targetFolderId, position: index})
    }
  } else {
    for (const [index, note] of sourceNotes.entries()) {
      updateMap.set(note.id, {folderId: sourceFolderId, position: index})
    }

    for (const [index, note] of targetNotes.entries()) {
      updateMap.set(note.id, {folderId: params.targetFolderId, position: index})
    }
  }

  const updates = Array.from(updateMap.entries()).map(([noteId, update]) => ({
    noteId,
    ...update,
  }))

  return {
    nextNotes: params.notes.map((note) => {
      const update = updateMap.get(note.id)
      return update ? {...note, folderId: update.folderId, position: update.position} : note
    }),
    updates,
  }
}
