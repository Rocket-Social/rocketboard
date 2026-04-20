import {useMutation, useQueryClient} from '@tanstack/react-query'

import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {noteRepository} from './note.repository'
import {noteFolderRepository} from './note.repository'
import type {VaultImportProgress, VaultParseResult} from './obsidian-import'

const BATCH_SIZE = 50
const OBSIDIAN_PROVIDER = 'obsidian'

type ObsidianImportInput = {
  onProgress?: (progress: VaultImportProgress) => void
  parseResult: VaultParseResult
  userId: string
}

type ObsidianImportResult = {
  foldersCreated: number
  insertedCount: number
  skippedCount: number
}

async function ensureObsidianRootFolder(userId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()

  // Check for existing Obsidian connection with a root folder
  const {data: existingConnection} = await (supabase.from('note_import_connections') as any)
    .select('root_folder_id')
    .eq('user_id', userId)
    .eq('provider', OBSIDIAN_PROVIDER)
    .maybeSingle()

  if (existingConnection?.root_folder_id) {
    // Verify folder still exists
    const {data: folder} = await supabase
      .from('note_folders')
      .select('id')
      .eq('id', existingConnection.root_folder_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (folder?.id) {
      return folder.id as string
    }
  }

  // Create new root folder
  const folders = await noteFolderRepository.listFolders(userId)
  const existingNames = new Set(folders.filter((f) => !f.parentId).map((f) => f.name))
  let folderName = 'Obsidian'
  if (existingNames.has(folderName)) {
    folderName = 'Obsidian (Imported)'
    let suffix = 2
    while (existingNames.has(folderName)) {
      folderName = `Obsidian (Imported ${suffix})`
      suffix += 1
    }
  }

  const folder = await noteFolderRepository.createFolder(userId, {name: folderName})
  return folder.id
}

async function ensureChildFolder(
  userId: string,
  parentId: string,
  name: string,
  existingFolders: Map<string, string>,
): Promise<string> {
  const existingId = existingFolders.get(name)
  if (existingId) return existingId

  const folder = await noteFolderRepository.createFolder(userId, {name, parentId})
  existingFolders.set(name, folder.id)
  return folder.id
}

async function getExistingSourceIds(userId: string): Promise<Set<string>> {
  const {data, error} = await (getSupabaseBrowserClient().from('notes') as any)
    .select('source_id')
    .eq('user_id', userId)
    .eq('source_provider', OBSIDIAN_PROVIDER)

  if (error) throw error
  return new Set((data ?? []).map((row: {source_id: string}) => row.source_id).filter(Boolean))
}

async function upsertObsidianConnection(
  userId: string,
  rootFolderId: string,
): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  const now = new Date().toISOString()

  const {data: existing} = await (supabase.from('note_import_connections') as any)
    .select('id')
    .eq('user_id', userId)
    .eq('provider', OBSIDIAN_PROVIDER)
    .maybeSingle()

  if (existing?.id) {
    await (supabase.from('note_import_connections') as any)
      .update({
        last_sync_finished_at: now,
        root_folder_id: rootFolderId,
        status: 'connected',
        updated_at: now,
      })
      .eq('id', existing.id)

    return existing.id as string
  }

  const {data: created, error} = await (supabase.from('note_import_connections') as any)
    .insert({
      auth_method: 'file_upload',
      created_at: now,
      mode: 'capture',
      provider: OBSIDIAN_PROVIDER,
      root_folder_id: rootFolderId,
      status: 'connected',
      updated_at: now,
      user_id: userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return created.id as string
}

async function runObsidianImport({
  onProgress,
  parseResult,
  userId,
}: ObsidianImportInput): Promise<ObsidianImportResult> {
  const {notes} = parseResult

  // Step 1: Create folder structure
  onProgress?.({current: 0, currentFile: 'Creating folders...', phase: 'inserting', total: notes.length})

  const rootFolderId = await ensureObsidianRootFolder(userId)
  const connectionId = await upsertObsidianConnection(userId, rootFolderId)

  // Load existing child folders under root
  const allFolders = await noteFolderRepository.listFolders(userId)
  const childFolders = new Map<string, string>(
    allFolders
      .filter((f) => f.parentId === rootFolderId)
      .map((f) => [f.name, f.id]),
  )

  // Build folder mapping for all unique paths (max 1 level deep under root)
  const folderIdByPath = new Map<string, string>()
  let foldersCreated = 0

  for (const note of notes) {
    if (!note.folderPath) continue
    if (folderIdByPath.has(note.folderPath)) continue

    // Use the first directory segment as the child folder name
    // (My Notes supports root + 1 level of children)
    const firstSegment = note.folderPath.split('/')[0] ?? note.folderPath
    if (!folderIdByPath.has(firstSegment)) {
      const wasNew = !childFolders.has(firstSegment)
      const folderId = await ensureChildFolder(userId, rootFolderId, firstSegment, childFolders)
      folderIdByPath.set(firstSegment, folderId)
      if (wasNew) foldersCreated += 1
    }

    // Map the full path to the same first-segment folder (flattening deeper nesting)
    if (note.folderPath !== firstSegment) {
      folderIdByPath.set(note.folderPath, folderIdByPath.get(firstSegment)!)
    }
  }

  // Step 2: Dedup — find which notes already exist
  const existingSourceIds = await getExistingSourceIds(userId)

  // Step 3: Batch insert
  const notesToInsert = notes.filter((note) => !existingSourceIds.has(note.relativePath))
  const skippedCount = notes.length - notesToInsert.length
  let insertedCount = 0
  let nextPosition = 0

  for (let i = 0; i < notesToInsert.length; i += BATCH_SIZE) {
    const batch = notesToInsert.slice(i, i + BATCH_SIZE)

    onProgress?.({
      current: i + batch.length,
      currentFile: batch[0]?.relativePath ?? '',
      phase: 'inserting',
      total: notesToInsert.length,
    })

    const rows = batch.map((note) => {
      const folderId = note.folderPath
        ? (folderIdByPath.get(note.folderPath) ?? folderIdByPath.get(note.folderPath.split('/')[0] ?? '') ?? rootFolderId)
        : rootFolderId

      return {
        contentJson: note.contentJson,
        contentMd: note.contentMd,
        folderId,
        position: nextPosition++,
        previewText: note.previewText,
        sourceConnectionId: connectionId,
        sourceId: note.relativePath,
        sourceMetadata: note.frontmatter,
        title: note.title,
      }
    })

    const result = await noteRepository.batchInsertNotes(userId, rows)
    insertedCount += result.insertedCount
  }

  onProgress?.({current: notesToInsert.length, currentFile: '', phase: 'done', total: notesToInsert.length})

  return {foldersCreated, insertedCount, skippedCount}
}

export function useObsidianImportMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {onProgress?: (progress: VaultImportProgress) => void; parseResult: VaultParseResult}) =>
      runObsidianImport({...input, userId}),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ['notes', 'list', userId]})
      void queryClient.invalidateQueries({queryKey: ['notes', 'folders', userId]})
      void queryClient.invalidateQueries({queryKey: ['notes', 'granola-import', 'connection', userId]})
    },
  })
}
