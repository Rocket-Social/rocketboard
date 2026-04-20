import type {ContentDocument} from '../rich-text/content.types'
import type {RichTextDocument} from '../rich-text/rich-text'
import {stripMarkdown} from '../rich-text/prepare-content'
import type {Json} from '../../platform/supabase/database.types'

// ============================================================
// Records
// ============================================================

export type NoteSourceProvider = 'granola' | 'obsidian'

type NoteSummaryFields = {
  createdAt: string
  deletedAt: string | null
  displayTitle: string
  folderId: string | null
  id: string
  position: number
  previewText: string
  sourceConnectionId: string | null
  sourceCreatedAt: string | null
  sourceId: string | null
  sourceMetadata: Json
  sourceDetached: boolean
  sourceProvider: NoteSourceProvider | null
  sourceUpdatedAt: string | null
  title: string
  updatedAt: string
  userId: string
}

export type NoteRecord = NoteSummaryFields & ContentDocument

export type NoteListItem = NoteSummaryFields

export type NoteFolderRecord = {
  createdAt: string
  id: string
  name: string
  parentId: string | null
  position: number
  updatedAt: string
  userId: string
}

// ============================================================
// Inputs
// ============================================================

export type CreateNoteInput = {
  folderId?: string | null
  title?: string
}

export type UpdateNoteInput = {
  contentJson?: RichTextDocument
  contentMd?: string
  folderId?: string | null
  position?: number
  previewText?: string | null
  title?: string
}

export type CreateFolderInput = {
  name: string
  parentId?: string | null
}

export type UpdateFolderInput = {
  name?: string
  parentId?: string | null
  position?: number
}

// ============================================================
// Sort
// ============================================================

export type NoteSortBy = 'updatedAt' | 'createdAt' | 'title' | 'manual'

function getSortUpdatedAt(note: Pick<NoteListItem, 'sourceUpdatedAt' | 'updatedAt'>) {
  return note.sourceUpdatedAt ?? note.updatedAt
}

function getSortCreatedAt(note: Pick<NoteListItem, 'createdAt' | 'sourceCreatedAt'>) {
  return note.sourceCreatedAt ?? note.createdAt
}

export function sortNotes(notes: NoteListItem[], sortBy: NoteSortBy): NoteListItem[] {
  const sorted = [...notes]

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'updatedAt':
        return new Date(getSortUpdatedAt(b)).getTime() - new Date(getSortUpdatedAt(a)).getTime()
      case 'createdAt':
        return new Date(getSortCreatedAt(b)).getTime() - new Date(getSortCreatedAt(a)).getTime()
      case 'title': {
        const titleA = getNoteDisplayTitle(a).toLowerCase()
        const titleB = getNoteDisplayTitle(b).toLowerCase()
        return titleA.localeCompare(titleB)
      }
      case 'manual':
        return a.position - b.position
    }
  })

  return sorted
}

export function resolveActiveNoteId(
  notes: {id: string}[],
  activeNoteId: string | null,
  requestedNoteId?: string | null,
): string | null {
  if (notes.length === 0) {
    return null
  }

  if (requestedNoteId) {
    return notes.some((note) => note.id === requestedNoteId)
      ? requestedNoteId
      : notes[0]?.id ?? null
  }

  return activeNoteId && notes.some((note) => note.id === activeNoteId)
    ? activeNoteId
    : notes[0]?.id ?? null
}

// ============================================================
// Display helpers
// ============================================================

function getFallbackTextLine(...sources: Array<string | null | undefined>) {
  for (const source of sources) {
    if (!source) {
      continue
    }

    const stripped = stripMarkdown(source)
    const firstLine = stripped.split('\n')[0]?.trim()

    if (firstLine) {
      return firstLine
    }
  }

  return ''
}

export function buildNoteDisplayTitle(
  note: {contentMd?: string | null; previewText?: string | null; title: string},
) {
  const trimmed = note.title.trim()

  if (trimmed && trimmed !== 'New Note') {
    return trimmed
  }

  const firstLine = getFallbackTextLine(note.previewText, note.contentMd)

  if (firstLine) {
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine
  }

  return 'New Note'
}

export function getNoteDisplayTitle(
  note: {contentMd?: string | null; displayTitle?: string | null; previewText?: string | null; title: string},
): string {
  return note.displayTitle?.trim() || buildNoteDisplayTitle(note)
}

export function getNotePreview(
  note: {contentMd?: string | null; previewText?: string | null},
  maxLength = 80,
): string {
  const firstLine = getFallbackTextLine(note.previewText, note.contentMd)

  if (!firstLine) {
    return ''
  }

  if (firstLine.length <= maxLength) {
    return firstLine
  }

  return firstLine.slice(0, maxLength).trim() + '...'
}

export function formatNoteDate(dateString: string): string {
  const now = Date.now()
  const timestamp = new Date(dateString).getTime()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString()
  }

  if (days > 0) {
    return `${days}d ago`
  }

  if (hours > 0) {
    return `${hours}h ago`
  }

  if (minutes > 0) {
    return `${minutes}m ago`
  }

  return 'Just now'
}

export function isImportedNote(note: {sourceDetached?: boolean; sourceProvider: NoteSourceProvider | null}) {
  if (!note.sourceProvider) return false
  if (note.sourceDetached) return false
  return true
}

export function isFromProvider(
  note: {sourceProvider: NoteSourceProvider | null},
  provider: NoteSourceProvider,
) {
  return note.sourceProvider === provider
}
