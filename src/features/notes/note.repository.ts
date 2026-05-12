import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {Database} from '../../platform/supabase/database.types'
import type {RichTextDocument} from '../rich-text/rich-text'
import type {
  CreateFolderInput,
  CreateNoteInput,
  NoteFolderRecord,
  NoteListItem,
  NoteRecord,
  UpdateFolderInput,
  UpdateNoteInput,
} from './note.types'
import {buildNoteDisplayTitle, getNotePreview} from './note.types'

// ============================================================
// DB row types
// ============================================================

type NoteRow = {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content_json: unknown
  content_md: string
  preview_text: string
  source_provider: string | null
  source_id: string | null
  source_connection_id: string | null
  source_created_at: string | null
  source_updated_at: string | null
  source_metadata: unknown
  source_detached: boolean
  position: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type BaseNoteRow = Omit<
  NoteRow,
  | 'preview_text'
  | 'source_provider'
  | 'source_id'
  | 'source_connection_id'
  | 'source_created_at'
  | 'source_updated_at'
  | 'source_metadata'
>

type FullNoteListRow = Omit<NoteRow, 'content_json' | 'content_md'>
type BaseNoteListRow = Omit<BaseNoteRow, 'content_json'>

type LegacyNoteRow = Omit<BaseNoteRow, 'content_json' | 'content_md'> & {
  content: unknown
  content_text: string
}

type LegacyNoteListRow = Omit<LegacyNoteRow, 'content'>

type NoteFolderRow = {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  position: number
  created_at: string
  updated_at: string
}

type NoteFolderUpdate = Database['public']['Tables']['note_folders']['Update']

type NoteSchema = 'full' | 'base' | 'legacy'

const FULL_NOTE_SELECT =
  'id, user_id, folder_id, title, content_json, content_md, preview_text, source_provider, source_id, source_connection_id, source_created_at, source_updated_at, source_metadata, source_detached, position, created_at, updated_at, deleted_at'
const FULL_NOTE_LIST_SELECT =
  'id, user_id, folder_id, title, preview_text, source_provider, source_id, source_connection_id, source_created_at, source_updated_at, source_metadata, source_detached, position, created_at, updated_at, deleted_at'
const BASE_NOTE_SELECT =
  'id, user_id, folder_id, title, content_json, content_md, position, created_at, updated_at, deleted_at'
const BASE_NOTE_LIST_SELECT =
  'id, user_id, folder_id, title, content_md, position, created_at, updated_at, deleted_at'
const LEGACY_NOTE_SELECT =
  'id, user_id, folder_id, title, content, content_text, position, created_at, updated_at, deleted_at'
const LEGACY_NOTE_LIST_SELECT =
  'id, user_id, folder_id, title, content_text, position, created_at, updated_at, deleted_at'

let preferredNoteSchema: NoteSchema = 'full'

function getNotesTable() {
  return getSupabaseBrowserClient().from('notes') as any
}

// ============================================================
// Converters
// ============================================================

function rowToNote(row: NoteRow): NoteRecord {
  return {
    contentJson: row.content_json as unknown as RichTextDocument,
    contentMd: row.content_md,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayTitle: buildNoteDisplayTitle({
      contentMd: row.content_md,
      previewText: row.preview_text,
      title: row.title,
    }),
    folderId: row.folder_id,
    id: row.id,
    position: row.position,
    previewText: row.preview_text,
    sourceConnectionId: row.source_connection_id,
    sourceCreatedAt: row.source_created_at,
    sourceDetached: row.source_detached,
    sourceId: row.source_id,
    sourceMetadata: row.source_metadata as NoteRecord['sourceMetadata'],
    sourceProvider: row.source_provider as NoteRecord['sourceProvider'],
    sourceUpdatedAt: row.source_updated_at,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function baseRowToNote(row: BaseNoteRow): NoteRecord {
  const previewText = getNotePreview({contentMd: row.content_md}, 240)

  return {
    contentJson: row.content_json as unknown as RichTextDocument,
    contentMd: row.content_md,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayTitle: buildNoteDisplayTitle({
      contentMd: row.content_md,
      title: row.title,
    }),
    folderId: row.folder_id,
    id: row.id,
    position: row.position,
    previewText,
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function rowToNoteListItem(row: FullNoteListRow): NoteListItem {
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayTitle: buildNoteDisplayTitle({
      previewText: row.preview_text,
      title: row.title,
    }),
    folderId: row.folder_id,
    id: row.id,
    position: row.position,
    previewText: row.preview_text,
    sourceConnectionId: row.source_connection_id,
    sourceCreatedAt: row.source_created_at,
    sourceDetached: row.source_detached,
    sourceId: row.source_id,
    sourceMetadata: row.source_metadata as NoteRecord['sourceMetadata'],
    sourceProvider: row.source_provider as NoteRecord['sourceProvider'],
    sourceUpdatedAt: row.source_updated_at,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function baseRowToNoteListItem(row: BaseNoteListRow): NoteListItem {
  const previewText = getNotePreview({contentMd: row.content_md}, 240)

  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayTitle: buildNoteDisplayTitle({
      contentMd: row.content_md,
      previewText,
      title: row.title,
    }),
    folderId: row.folder_id,
    id: row.id,
    position: row.position,
    previewText,
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function legacyRowToNote(row: LegacyNoteRow): NoteRecord {
  const previewText = getNotePreview({contentMd: row.content_text}, 240)

  return {
    contentJson: row.content as unknown as RichTextDocument,
    contentMd: row.content_text,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayTitle: buildNoteDisplayTitle({
      contentMd: row.content_text,
      title: row.title,
    }),
    folderId: row.folder_id,
    id: row.id,
    position: row.position,
    previewText,
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function legacyRowToNoteListItem(row: LegacyNoteListRow): NoteListItem {
  const previewText = getNotePreview({contentMd: row.content_text}, 240)

  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayTitle: buildNoteDisplayTitle({
      contentMd: row.content_text,
      previewText,
      title: row.title,
    }),
    folderId: row.folder_id,
    id: row.id,
    position: row.position,
    previewText,
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function rowToFolder(row: NoteFolderRow): NoteFolderRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    position: row.position,
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

function isFullNoteRow(row: NoteRow | BaseNoteRow | LegacyNoteRow): row is NoteRow {
  return 'preview_text' in row
}

function isBaseNoteRow(row: NoteRow | BaseNoteRow | LegacyNoteRow): row is BaseNoteRow {
  return 'content_md' in row
}

function isFullNoteListRow(row: FullNoteListRow | BaseNoteListRow | LegacyNoteListRow): row is FullNoteListRow {
  return 'preview_text' in row
}

function isBaseNoteListRow(row: FullNoteListRow | BaseNoteListRow | LegacyNoteListRow): row is BaseNoteListRow {
  return 'content_md' in row
}

function mapNoteRow(row: NoteRow | BaseNoteRow | LegacyNoteRow): NoteRecord {
  if (isFullNoteRow(row)) {
    preferredNoteSchema = 'full'
    return rowToNote(row)
  }

  if (isBaseNoteRow(row)) {
    preferredNoteSchema = 'base'
    return baseRowToNote(row)
  }

  preferredNoteSchema = 'legacy'
  return legacyRowToNote(row)
}

function mapNoteListRow(row: FullNoteListRow | BaseNoteListRow | LegacyNoteListRow): NoteListItem {
  if (isFullNoteListRow(row)) {
    preferredNoteSchema = 'full'
    return rowToNoteListItem(row)
  }

  if (isBaseNoteListRow(row)) {
    preferredNoteSchema = 'base'
    return baseRowToNoteListItem(row)
  }

  preferredNoteSchema = 'legacy'
  return legacyRowToNoteListItem(row)
}

function getNoteSchemaErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return ''

  const record = error as Record<string, unknown>
  return [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function isMissingNoteColumns(error: unknown, columns: string[]): boolean {
  const message = getNoteSchemaErrorMessage(error)
  if (!message) return false

  const isMissingColumnError =
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find')

  return isMissingColumnError && columns.some((column) =>
    message.includes(`notes.${column}`) || (message.includes(column) && message.includes('notes')),
  )
}

function isMissingFullNoteColumns(error: unknown): boolean {
  return isMissingNoteColumns(error, [
    'preview_text',
    'source_provider',
    'source_id',
    'source_connection_id',
    'source_created_at',
    'source_updated_at',
    'source_metadata',
  ])
}

function isMissingBaseNoteColumns(error: unknown): boolean {
  return isMissingNoteColumns(error, ['content_md', 'content_json'])
}

async function withNoteSchema<T>(operation: (schema: NoteSchema) => Promise<T>): Promise<T> {
  let schema = preferredNoteSchema

  while (true) {
    try {
      const result = await operation(schema)
      preferredNoteSchema = schema
      return result
    } catch (error) {
      if (schema === 'full' && isMissingFullNoteColumns(error)) {
        schema = 'base'
        continue
      }

      if ((schema === 'full' || schema === 'base') && isMissingBaseNoteColumns(error)) {
        schema = 'legacy'
        continue
      }

      throw error
    }
  }
}

// ============================================================
// Notes repository
// ============================================================

export const noteRepository = {
  async getStartupSnapshot(requestedNoteId?: string | null): Promise<unknown> {
    return rpcAdapter.call<unknown>('get_my_notes_startup_snapshot', {
      target_note_id: requestedNoteId ?? null,
    })
  },

  async listNotes(userId: string): Promise<NoteListItem[]> {
    return withNoteSchema(async (schema) => {
      const {data, error} = await getNotesTable()
        .select(
          schema === 'full'
            ? FULL_NOTE_LIST_SELECT
            : schema === 'base'
              ? BASE_NOTE_LIST_SELECT
              : LEGACY_NOTE_LIST_SELECT,
        )
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('updated_at', {ascending: false})

      if (error) throw error
      return ((data ?? []) as Array<FullNoteListRow | BaseNoteListRow | LegacyNoteListRow>).map(mapNoteListRow)
    })
  },

  async getNote(noteId: string): Promise<NoteRecord | null> {
    return withNoteSchema(async (schema) => {
      const {data, error} = await getNotesTable()
        .select(
          schema === 'full'
            ? FULL_NOTE_SELECT
            : schema === 'base'
              ? BASE_NOTE_SELECT
              : LEGACY_NOTE_SELECT,
        )
        .eq('id', noteId)
        .is('deleted_at', null)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      return data ? mapNoteRow(data as NoteRow | BaseNoteRow | LegacyNoteRow) : null
    })
  },

  async createNote(userId: string, input: CreateNoteInput): Promise<NoteRecord> {
    const {data, error} = await getNotesTable()
      .insert({
        user_id: userId,
        folder_id: input.folderId ?? null,
        title: input.title ?? 'New Note',
      })
      .select()
      .single()

    if (error) throw error
    return mapNoteRow(data as NoteRow | BaseNoteRow | LegacyNoteRow)
  },

  async updateNote(noteId: string, patch: UpdateNoteInput): Promise<NoteRecord> {
    return withNoteSchema(async (schema) => {
      const updates: Record<string, unknown> = {}

      if (patch.title !== undefined) updates.title = patch.title
      if (patch.folderId !== undefined) updates.folder_id = patch.folderId
      if (patch.position !== undefined) updates.position = patch.position
      if (patch.contentJson !== undefined) {
        if (schema === 'full') {
          updates.content_json = patch.contentJson
          updates.content_md = patch.contentMd ?? ''
          updates.preview_text = getNotePreview({
            contentMd: patch.contentMd ?? '',
            previewText: patch.previewText ?? null,
          }, 240)
        } else if (schema === 'base') {
          updates.content_json = patch.contentJson
          updates.content_md = patch.contentMd ?? ''
        } else {
          updates.content = patch.contentJson
          updates.content_text = patch.contentMd ?? ''
        }
      }

      const {data, error} = await getNotesTable()
        .update(updates)
        .eq('id', noteId)
        .select()
        .single()

      if (error) throw error
      return mapNoteRow(data as NoteRow | BaseNoteRow | LegacyNoteRow)
    })
  },

  async duplicateNoteAsEditable(userId: string, noteId: string): Promise<NoteRecord> {
    const original = await this.getNote(noteId)
    if (!original) {
      throw new Error('Note not found')
    }

    return withNoteSchema(async (schema) => {
      const duplicateTitle = original.title.trim()
        ? `${original.title.trim()} (Copy)`
        : 'Editable copy'

      const insertPayload: Record<string, unknown> = {
        folder_id: null,
        title: duplicateTitle,
        user_id: userId,
      }

      if (schema === 'full') {
        insertPayload.content_json = original.contentJson
        insertPayload.content_md = original.contentMd
        insertPayload.preview_text = getNotePreview({
          contentMd: original.contentMd,
          previewText: original.previewText,
        }, 240)
        insertPayload.source_connection_id = null
        insertPayload.source_created_at = null
        insertPayload.source_id = null
        insertPayload.source_metadata = {}
        insertPayload.source_provider = null
        insertPayload.source_updated_at = null
      } else if (schema === 'base') {
        insertPayload.content_json = original.contentJson
        insertPayload.content_md = original.contentMd
      } else {
        insertPayload.content = original.contentJson
        insertPayload.content_text = original.contentMd
      }

      const {data, error} = await getNotesTable()
        .insert(insertPayload)
        .select(
          schema === 'full'
            ? FULL_NOTE_SELECT
            : schema === 'base'
              ? BASE_NOTE_SELECT
              : LEGACY_NOTE_SELECT,
        )
        .single()

      if (error) {
        throw error
      }

      return mapNoteRow(data as NoteRow | BaseNoteRow | LegacyNoteRow)
    })
  },

  async deleteNote(noteId: string): Promise<void> {
    const {error} = await getNotesTable()
      .update({deleted_at: new Date().toISOString()})
      .eq('id', noteId)

    if (error) throw error
  },

  async batchInsertNotes(
    userId: string,
    notes: Array<{
      contentJson: unknown
      contentMd: string
      folderId: string | null
      position: number
      previewText: string
      sourceConnectionId: string
      sourceId: string
      sourceMetadata: Record<string, unknown>
      title: string
    }>,
  ): Promise<{insertedCount: number}> {
    if (notes.length === 0) {
      return {insertedCount: 0}
    }

    const rows = notes.map((note) => ({
      content_json: note.contentJson,
      content_md: note.contentMd,
      folder_id: note.folderId,
      position: note.position,
      preview_text: note.previewText,
      source_connection_id: note.sourceConnectionId,
      source_detached: true,
      source_id: note.sourceId,
      source_metadata: note.sourceMetadata,
      source_provider: 'obsidian',
      title: note.title,
      user_id: userId,
    }))

    const {error} = await getNotesTable().insert(rows)

    if (error) throw error

    return {insertedCount: rows.length}
  },

  async reorderNotes(updates: {noteId: string; folderId: string | null; position: number}[]): Promise<void> {
    await rpcAdapter.call('reorder_notes', {
      updates: JSON.stringify(updates.map((u) => ({
        noteId: u.noteId,
        folderId: u.folderId,
        position: u.position,
      }))),
    })
  },
}

// ============================================================
// Folders repository
// ============================================================

export const noteFolderRepository = {
  async listFolders(userId: string): Promise<NoteFolderRecord[]> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('note_folders')
      .select('*')
      .eq('user_id', userId)
      .order('position', {ascending: true})

    if (error) throw error
    return (data ?? []).map(rowToFolder)
  },

  async createFolder(userId: string, input: CreateFolderInput): Promise<NoteFolderRecord> {
    const {data, error} = await getSupabaseBrowserClient()
      .from('note_folders')
      .insert({
        user_id: userId,
        name: input.name,
        parent_id: input.parentId ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return rowToFolder(data)
  },

  async updateFolder(folderId: string, patch: UpdateFolderInput): Promise<NoteFolderRecord> {
    const updates: NoteFolderUpdate = {}

    if (patch.name !== undefined) updates.name = patch.name
    if (patch.parentId !== undefined) updates.parent_id = patch.parentId
    if (patch.position !== undefined) updates.position = patch.position

    const {data, error} = await getSupabaseBrowserClient()
      .from('note_folders')
      .update(updates)
      .eq('id', folderId)
      .select()
      .single()

    if (error) throw error
    return rowToFolder(data)
  },

  async deleteFolder(folderId: string): Promise<void> {
    const {error} = await getSupabaseBrowserClient()
      .from('note_folders')
      .delete()
      .eq('id', folderId)

    if (error) throw error
  },

  async reorderFolders(updates: {folderId: string; position: number}[]): Promise<void> {
    await rpcAdapter.call('reorder_note_folders', {
      updates: JSON.stringify(updates.map((u) => ({
        folderId: u.folderId,
        position: u.position,
      }))),
    })
  },

  async initializeDefaults(userId: string): Promise<{folderId: string; noteId: string; created: boolean}> {
    const result = await rpcAdapter.callSingle<{folderId: string; noteId: string; created: boolean}>(
      'initialize_user_notes',
      {p_user_id: userId},
    )

    return result
  },
}
