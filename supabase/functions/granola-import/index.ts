import { decryptToken, encryptToken } from '../_shared/github-crypto.ts'
import {captureEdgeException, withMonitoring} from '../_shared/monitoring.ts'
import {
  createServiceClient,
  getAuthenticatedUser,
  handleCors,
  jsonResponse,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'

const GranolaModeSchema = z.enum(['raw', 'enriched'])

const ConnectRequestSchema = z.object({
  action: z.literal('connect'),
  mode: GranolaModeSchema.optional(),
  token: z.string().optional(),
})

const DisconnectRequestSchema = z.object({
  action: z.literal('disconnect'),
})

const SyncRequestSchema = z.object({
  action: z.literal('sync'),
  cursor: z.string().nullable().optional(),
  mode: z.enum(['full', 'incremental']).optional(),
})

const SetModeRequestSchema = z.object({
  action: z.literal('set_mode'),
  convert_existing: z.boolean().optional(),
  mode: GranolaModeSchema,
})

export const GranolaImportBodySchema = z.discriminatedUnion('action', [
  ConnectRequestSchema,
  DisconnectRequestSchema,
  SyncRequestSchema,
  SetModeRequestSchema,
])
import {
  buildGranolaImportedNote,
  GRANOLA_PROVIDER,
  isCurrentGranolaImportVersion,
  shouldRefreshGranolaImportedNote,
  type GranolaConnectionMode,
  type GranolaConnectionStatus,
  type GranolaListNote,
  type GranolaNoteDetail,
  type GranolaSyncMode,
  pickGranolaPrimaryFolderName,
} from '../../../src/features/notes/granola-import.shared.ts'

const GRANOLA_API_BASE_URL = Deno.env.get('GRANOLA_API_BASE_URL') ?? 'https://public-api.granola.ai'
const GRANOLA_PAGE_SIZE = 10
const GRANOLA_SYNC_OVERLAP_MS = 60_000
const GRANOLA_IMPORT_SCHEMA_ERROR =
  'Granola import requires the canonical notes-import schema from the active Supabase owner migrations. Apply the latest Supabase migrations and try again.'

type NoteImportConnectionRow = {
  auth_method: string
  backfill_cursor: string | null
  created_at: string
  encrypted_access_token: string | null
  id: string
  initial_import_completed_at: string | null
  last_source_updated_at: string | null
  last_sync_error: string | null
  last_sync_finished_at: string | null
  last_sync_started_at: string | null
  mode: GranolaConnectionMode
  provider: typeof GRANOLA_PROVIDER
  root_folder_id: string | null
  status: GranolaConnectionStatus
  updated_at: string
  user_id: string
}

type ImportedNoteRow = {
  deleted_at: string | null
  folder_id: string | null
  id: string
  source_detached: boolean
  source_metadata: unknown
  source_id: string | null
  source_updated_at: string | null
}

type GranolaFolderState = {
  childFolderIdsByName: Map<string, string>
  nextFolderPosition: number
  nextNotePositionByFolderId: Map<string, number>
}

type ConnectRequest = z.infer<typeof ConnectRequestSchema>
type SyncRequest = z.infer<typeof SyncRequestSchema>
type SetModeRequest = z.infer<typeof SetModeRequestSchema>
type RequestBody = z.infer<typeof GranolaImportBodySchema>

type GranolaListResponse = {
  cursor: string | null
  hasMore: boolean
  notes: GranolaListNote[]
}

type PublicConnection = Omit<NoteImportConnectionRow, 'encrypted_access_token'>

function isMissingNoteImportColumnError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const record = error as Record<string, unknown>
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  const isMissingColumnError =
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find')

  if (!isMissingColumnError || !message.includes('notes')) {
    return false
  }

  return [
    'preview_text',
    'source_provider',
    'source_id',
    'source_connection_id',
    'source_created_at',
    'source_updated_at',
    'source_metadata',
  ].some((column) => message.includes(`notes.${column}`) || message.includes(column))
}

Deno.serve(withMonitoring('granola-import', async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  if (req.method !== 'POST') {
    return jsonResponse({error: 'Method not allowed'}, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return jsonResponse({error: 'Unauthorized'}, 401)
  }

  let body: RequestBody
  try {
    body = await parseJsonBody(req, GranolaImportBodySchema)
  } catch (error) {
    return jsonResponse(
      {error: error instanceof Error ? error.message : 'Invalid JSON body'},
      error && typeof error === 'object' && 'status' in error ? (error as {status: number}).status : 400,
    )
  }

  try {
    switch (body.action) {
      case 'connect':
        return await handleConnect(user.id, body)
      case 'disconnect':
        return await handleDisconnect(user.id)
      case 'sync':
        return await handleSync(user.id, body)
      case 'set_mode':
        return await handleSetMode(user.id, body)
    }
  } catch (error) {
    console.error('[granola-import] Unhandled error:', error)
    void captureEdgeException(error, {functionName: 'granola-import', userId: user.id})
    return jsonResponse({
      error: 'granola_import_failed',
      message: error instanceof Error ? error.message : 'Granola import failed.',
    }, 500)
  }
}))

async function handleConnect(userId: string, body: ConnectRequest) {
  const token = body.token?.trim()
  if (!token) {
    return jsonResponse({
      error: 'token_required',
      message: 'Paste a Granola API key to connect your account.',
    }, 400)
  }

  const validation = await listGranolaNotes(token, {pageSize: 1})
  if (!validation.ok) {
    return validation.response
  }

  const supabase = createServiceClient()
  const existingConnection = await getConnectionByUser(supabase, userId)
  const rootFolderId = await ensureGranolaFolder(supabase, userId, existingConnection?.root_folder_id ?? null)
  const encryptedToken = await encryptToken(token)
  const now = new Date().toISOString()

  const connectionMode = body.mode ?? 'capture'

  const payload = {
    auth_method: 'api_key',
    encrypted_access_token: encryptedToken,
    last_sync_error: null,
    mode: connectionMode,
    provider: GRANOLA_PROVIDER,
    root_folder_id: rootFolderId,
    status: 'connected' as const,
    updated_at: now,
    user_id: userId,
  }

  let connection: NoteImportConnectionRow | null = null
  if (existingConnection) {
    const {data, error} = await supabase
      .from('note_import_connections')
      .update(payload)
      .eq('id', existingConnection.id)
      .select('*')
      .single()

    if (error) {
      console.error('[granola-import] Failed to update connection:', error)
      return jsonResponse({
        error: 'save_failed',
        message: 'Rocketboard could not save the Granola connection.',
      }, 500)
    }

    connection = data as NoteImportConnectionRow
  } else {
    const {data, error} = await supabase
      .from('note_import_connections')
      .insert({
        ...payload,
        created_at: now,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[granola-import] Failed to create connection:', error)
      return jsonResponse({
        error: 'save_failed',
        message: 'Rocketboard could not save the Granola connection.',
      }, 500)
    }

    connection = data as NoteImportConnectionRow
  }

  return jsonResponse({
    connection: sanitizeConnection(connection),
    success: true,
  })
}

async function handleDisconnect(userId: string) {
  const supabase = createServiceClient()
  const connection = await getConnectionByUser(supabase, userId)
  if (!connection) {
    return jsonResponse({
      error: 'not_connected',
      message: 'No Granola connection was found for this account.',
    }, 404)
  }

  // Auto-detach mirrored notes so they become editable after disconnect.
  // Without this, mirrored notes would be frozen read-only with no way to update.
  let detachedCount = 0
  if (connection.mode === 'mirror') {
    try {
      const {count, error: detachError} = await supabase
        .from('notes')
        .update({source_detached: true})
        .eq('user_id', userId)
        .eq('source_provider', GRANOLA_PROVIDER)
        .eq('source_detached', false)
        .is('deleted_at', null)
        .select('id', {count: 'exact'})

      if (detachError) {
        console.error('[granola-import] Failed to auto-detach notes on disconnect:', detachError)
        return jsonResponse({
          error: 'disconnect_failed',
          message: 'Rocketboard could not disconnect Granola because mirrored notes could not be made editable.',
        }, 500)
      }

      detachedCount = count ?? 0
    } catch (detachErr) {
      console.error('[granola-import] Error auto-detaching notes on disconnect:', detachErr)
      return jsonResponse({
        error: 'disconnect_failed',
        message: 'Rocketboard could not disconnect Granola because mirrored notes could not be made editable.',
      }, 500)
    }
  }

  const now = new Date().toISOString()
  const {data, error} = await supabase
    .from('note_import_connections')
    .update({
      encrypted_access_token: null,
      last_sync_error: null,
      status: 'disconnected',
      updated_at: now,
    })
    .eq('id', connection.id)
    .select('*')
    .single()

  if (error) {
    console.error('[granola-import] Failed to disconnect:', error)
    return jsonResponse({
      error: 'disconnect_failed',
      message: 'Rocketboard could not disconnect Granola.',
    }, 500)
  }

  return jsonResponse({
    connection: sanitizeConnection(data as NoteImportConnectionRow),
    detached_count: detachedCount,
    success: true,
  })
}

async function handleSetMode(userId: string, body: SetModeRequest) {
  const supabase = createServiceClient()
  const connection = await getConnectionByUser(supabase, userId)
  if (!connection) {
    return jsonResponse({
      error: 'not_connected',
      message: 'No Granola connection was found for this account.',
    }, 404)
  }

  const now = new Date().toISOString()
  const {data, error} = await supabase
    .from('note_import_connections')
    .update({
      mode: body.mode,
      updated_at: now,
    })
    .eq('id', connection.id)
    .select('*')
    .single()

  if (error) {
    console.error('[granola-import] Failed to set mode:', error)
    return jsonResponse({
      error: 'set_mode_failed',
      message: 'Rocketboard could not change the import mode.',
    }, 500)
  }

  let convertedCount = 0
  if (body.convert_existing && body.mode === 'capture') {
    const {count} = await supabase
      .from('notes')
      .update({source_detached: true})
      .eq('user_id', userId)
      .eq('source_provider', GRANOLA_PROVIDER)
      .eq('source_detached', false)
      .is('deleted_at', null)

    convertedCount = count ?? 0
  }

  return jsonResponse({
    connection: sanitizeConnection(data as NoteImportConnectionRow),
    converted_count: convertedCount,
    success: true,
  })
}

async function handleSync(userId: string, body: SyncRequest) {
  const supabase = createServiceClient()
  const existingConnection = await getConnectionByUser(supabase, userId)

  if (!existingConnection) {
    return jsonResponse({
      error: 'not_connected',
      message: 'Connect Granola before running an import.',
    }, 404)
  }

  if (!existingConnection.encrypted_access_token) {
    return await markReconnectRequired(
      supabase,
      existingConnection.id,
      'Reconnect Granola to resume syncing imported notes.',
    )
  }

  const token = await decryptToken(existingConnection.encrypted_access_token)
  if (!token) {
    return await markReconnectRequired(
      supabase,
      existingConnection.id,
      'Reconnect Granola to resume syncing imported notes.',
    )
  }

  const rootFolderId = await ensureGranolaFolder(supabase, userId, existingConnection.root_folder_id)
  const now = new Date().toISOString()
  await supabase
    .from('note_import_connections')
    .update({
      last_sync_error: null,
      last_sync_started_at: now,
      root_folder_id: rootFolderId,
      status: 'connected',
      updated_at: now,
    })
    .eq('id', existingConnection.id)

  const repairBackfillRequired = await hasStaleGranolaImports(supabase, userId)
  const syncMode = resolveSyncMode(existingConnection, body.mode, repairBackfillRequired)
  const listResponse = await listGranolaNotes(token, {
    cursor: body.cursor ?? (syncMode === 'backfill' ? existingConnection.backfill_cursor : null),
    pageSize: GRANOLA_PAGE_SIZE,
    updatedAfter: syncMode === 'incremental'
      ? computeUpdatedAfter(existingConnection.last_source_updated_at)
      : null,
  })

  if (!listResponse.ok) {
    if (listResponse.status === 401) {
      return await markReconnectRequired(
        supabase,
        existingConnection.id,
        'Granola rejected the saved API key. Reconnect to resume syncing.',
      )
    }

    return await markSyncError(
      supabase,
      existingConnection.id,
      listResponse.status === 429
        ? 'Granola rate-limited the import. Wait a moment, then try again.'
        : 'Rocketboard could not load notes from Granola.',
      listResponse.status === 429 ? 429 : 502,
    )
  }

  const importedNotes = listResponse.data.notes
  let importedBySourceId: Map<string, ImportedNoteRow>
  try {
    importedBySourceId = await getImportedNotesBySourceId(supabase, userId, importedNotes.map((note) => note.id))
  } catch (error) {
    if (isMissingNoteImportColumnError(error)) {
      console.error('[granola-import] Missing notes import schema while loading imported notes:', error)
      return await markSyncError(supabase, existingConnection.id, GRANOLA_IMPORT_SCHEMA_ERROR)
    }

    throw error
  }
  const folderState = await loadGranolaFolderState(supabase, userId, rootFolderId)
  let importedCount = 0
  let skippedCount = 0
  let updatedCount = 0
  let maxSourceUpdatedAt = existingConnection.last_source_updated_at
    ? new Date(existingConnection.last_source_updated_at).getTime()
    : 0

  const isCapture = existingConnection.mode === 'capture'

  for (const note of importedNotes) {
    const localNote = importedBySourceId.get(note.id)
    const remoteSourceUpdatedAt = new Date(note.updated_at).getTime()
    maxSourceUpdatedAt = Math.max(maxSourceUpdatedAt, remoteSourceUpdatedAt)

    // Capture mode: if note already exists (even if deleted), skip entirely.
    // The user owns captured notes and we never overwrite their edits.
    if (isCapture && localNote) {
      skippedCount += 1
      continue
    }

    // Mirror mode: if the local note is detached (previously captured), skip it.
    // Never overwrite a note the user has taken ownership of.
    if (!isCapture && localNote?.source_detached) {
      skippedCount += 1
      continue
    }

    if (localNote && !shouldRefreshGranolaImportedNote({
      localSourceUpdatedAt: localNote.source_updated_at,
      remoteSourceUpdatedAt: note.updated_at,
      sourceMetadata: localNote.source_metadata,
    })) {
      skippedCount += 1
      continue
    }

    const detailResponse = await getGranolaNote(token, note.id)
    if (!detailResponse.ok) {
      if (detailResponse.status === 401) {
        return await markReconnectRequired(
          supabase,
          existingConnection.id,
          'Granola rejected the saved API key. Reconnect to resume syncing.',
        )
      }

      if (detailResponse.status === 404) {
        skippedCount += 1
        continue
      }

      return await markSyncError(
        supabase,
        existingConnection.id,
        detailResponse.status === 429
          ? 'Granola rate-limited the import. Wait a moment, then try again.'
          : 'Rocketboard could not fetch one of the Granola notes.',
        detailResponse.status === 429 ? 429 : 502,
      )
    }

    const detail = detailResponse.data
    const importedContent = buildGranolaImportedNote(detail)
    const targetFolderId = await resolveGranolaFolderIdForNote(
      supabase,
      userId,
      rootFolderId,
      detail,
      folderState,
    )

    if (localNote) {
      // Mirror mode only: update existing mirrored note
      const targetPosition = localNote.folder_id === targetFolderId
        ? undefined
        : await allocateNextNotePosition(supabase, userId, targetFolderId, folderState)
      const {error} = await supabase
        .from('notes')
        .update({
          content_json: importedContent.contentJson,
          content_md: importedContent.contentMd,
          folder_id: targetFolderId,
          ...(targetPosition !== undefined ? {position: targetPosition} : {}),
          preview_text: importedContent.previewText,
          source_connection_id: existingConnection.id,
          source_created_at: detail.created_at,
          source_id: detail.id,
          source_metadata: importedContent.sourceMetadata,
          source_provider: GRANOLA_PROVIDER,
          source_updated_at: detail.updated_at,
          title: importedContent.title,
        })
        .eq('id', localNote.id)

      if (error) {
        console.error('[granola-import] Failed to update imported note:', error)
        return await markSyncError(
          supabase,
          existingConnection.id,
          isMissingNoteImportColumnError(error)
            ? GRANOLA_IMPORT_SCHEMA_ERROR
            : 'Rocketboard could not update an imported Granola note.',
        )
      }

      updatedCount += 1
      continue
    }

    const nextPosition = await allocateNextNotePosition(supabase, userId, targetFolderId, folderState)
    const {error} = await supabase
      .from('notes')
      .insert({
        content_json: importedContent.contentJson,
        content_md: importedContent.contentMd,
        folder_id: targetFolderId,
        position: nextPosition,
        preview_text: importedContent.previewText,
        source_connection_id: existingConnection.id,
        source_created_at: detail.created_at,
        source_detached: isCapture,
        source_id: detail.id,
        source_metadata: importedContent.sourceMetadata,
        source_provider: GRANOLA_PROVIDER,
        source_updated_at: detail.updated_at,
        title: importedContent.title,
        user_id: userId,
      })

    if (error) {
      console.error('[granola-import] Failed to insert imported note:', error)
      return await markSyncError(
        supabase,
        existingConnection.id,
        isMissingNoteImportColumnError(error)
          ? GRANOLA_IMPORT_SCHEMA_ERROR
          : 'Rocketboard could not save an imported Granola note.',
      )
    }

    importedCount += 1
  }

  const syncFinishedAt = new Date().toISOString()
  const connectionPatch: Record<string, unknown> = {
    last_source_updated_at: maxSourceUpdatedAt > 0
      ? new Date(maxSourceUpdatedAt).toISOString()
      : existingConnection.last_source_updated_at,
    last_sync_error: null,
    last_sync_finished_at: syncFinishedAt,
    status: 'connected',
    updated_at: syncFinishedAt,
  }

  if (syncMode === 'backfill') {
    connectionPatch.backfill_cursor = listResponse.data.hasMore ? listResponse.data.cursor : null
    if (!listResponse.data.hasMore) {
      connectionPatch.initial_import_completed_at =
        existingConnection.initial_import_completed_at ?? syncFinishedAt
    }
  }

  const {data: updatedConnection, error: connectionError} = await supabase
    .from('note_import_connections')
    .update(connectionPatch)
    .eq('id', existingConnection.id)
    .select('*')
    .single()

  if (connectionError) {
    console.error('[granola-import] Failed to persist sync state:', connectionError)
    return await markSyncError(
      supabase,
      existingConnection.id,
      'Rocketboard could not save the Granola sync state.',
    )
  }

  const completedInitialImportThisRun =
    !existingConnection.initial_import_completed_at
    && !listResponse.data.hasMore
    && Boolean((updatedConnection as NoteImportConnectionRow).initial_import_completed_at)

  return jsonResponse({
    connection: sanitizeConnection(updatedConnection as NoteImportConnectionRow),
    did_complete_initial_import: completedInitialImportThisRun,
    has_more: listResponse.data.hasMore,
    imported_count: importedCount,
    initial_import_completed: !listResponse.data.hasMore
      && Boolean((updatedConnection as NoteImportConnectionRow).initial_import_completed_at),
    newest_imported_note_id: listResponse.data.hasMore
      ? null
      : await getNewestImportedNoteId(supabase, userId),
    next_cursor: listResponse.data.hasMore ? listResponse.data.cursor : null,
    skipped_count: skippedCount,
    success: true,
    sync_mode: syncMode,
    total_processed: importedNotes.length,
    updated_count: updatedCount,
  })
}

function sanitizeConnection(connection: NoteImportConnectionRow): PublicConnection {
  const {encrypted_access_token: _secret, ...publicConnection} = connection
  return publicConnection
}

function resolveSyncMode(
  connection: NoteImportConnectionRow,
  requestedMode: GranolaSyncMode | undefined,
  repairBackfillRequired: boolean,
) {
  if (requestedMode === 'backfill') {
    return 'backfill' as const
  }

  if (repairBackfillRequired) {
    return 'backfill' as const
  }

  if (!connection.initial_import_completed_at || connection.backfill_cursor) {
    return 'backfill' as const
  }

  return 'incremental' as const
}

function computeUpdatedAfter(lastSourceUpdatedAt: string | null) {
  if (!lastSourceUpdatedAt) {
    return null
  }

  const timestamp = new Date(lastSourceUpdatedAt).getTime()
  if (Number.isNaN(timestamp)) {
    return null
  }

  return new Date(Math.max(0, timestamp - GRANOLA_SYNC_OVERLAP_MS)).toISOString()
}

async function markReconnectRequired(
  supabase: ReturnType<typeof createServiceClient>,
  connectionId: string,
  message: string,
) {
  const now = new Date().toISOString()
  const {data} = await supabase
    .from('note_import_connections')
    .update({
      encrypted_access_token: null,
      last_sync_error: message,
      last_sync_finished_at: now,
      status: 'needs_reconnect',
      updated_at: now,
    })
    .eq('id', connectionId)
    .select('*')
    .single()

  return jsonResponse({
    connection: data ? sanitizeConnection(data as NoteImportConnectionRow) : null,
    error: 'needs_reconnect',
    message,
  }, 401)
}

async function markSyncError(
  supabase: ReturnType<typeof createServiceClient>,
  connectionId: string,
  message: string,
  status = 500,
) {
  const now = new Date().toISOString()
  const {data} = await supabase
    .from('note_import_connections')
    .update({
      last_sync_error: message,
      last_sync_finished_at: now,
      status: 'error',
      updated_at: now,
    })
    .eq('id', connectionId)
    .select('*')
    .single()

  return jsonResponse({
    connection: data ? sanitizeConnection(data as NoteImportConnectionRow) : null,
    error: 'sync_failed',
    message,
  }, status)
}

async function getConnectionByUser(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const {data, error} = await supabase
    .from('note_import_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', GRANOLA_PROVIDER)
    .maybeSingle()

  if (error) {
    console.error('[granola-import] Failed to load connection:', error)
    throw error
  }

  return data as NoteImportConnectionRow | null
}

async function hasStaleGranolaImports(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const {data, error} = await supabase
    .from('notes')
    .select('source_metadata')
    .eq('user_id', userId)
    .eq('source_provider', GRANOLA_PROVIDER)
    .is('deleted_at', null)

  if (error) {
    console.error('[granola-import] Failed to load existing Granola imports:', error)
    throw error
  }

  return (data ?? []).some((note) => !isCurrentGranolaImportVersion(note.source_metadata))
}

async function ensureGranolaFolder(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  currentFolderId: string | null,
) {
  if (currentFolderId) {
    const {data: existingFolder} = await supabase
      .from('note_folders')
      .select('id')
      .eq('id', currentFolderId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingFolder?.id) {
      return existingFolder.id
    }
  }

  const {data: folders, error: foldersError} = await supabase
    .from('note_folders')
    .select('id, name, position')
    .eq('user_id', userId)
    .is('parent_id', null)
    .order('position', {ascending: true})

  if (foldersError) {
    console.error('[granola-import] Failed to load folders:', foldersError)
    throw foldersError
  }

  const existingNames = new Set((folders ?? []).map((folder) => folder.name))
  let folderName = 'Granola'

  if (existingNames.has(folderName)) {
    folderName = 'Granola (Imported)'
    let suffix = 2
    while (existingNames.has(folderName)) {
      folderName = `Granola (Imported ${suffix})`
      suffix += 1
    }
  }

  const nextPosition = (folders ?? []).reduce((maxPosition, folder) => (
    Math.max(maxPosition, folder.position ?? 0)
  ), -1) + 1

  const {data: createdFolder, error: createError} = await supabase
    .from('note_folders')
    .insert({
      name: folderName,
      parent_id: null,
      position: nextPosition,
      user_id: userId,
    })
    .select('id')
    .single()

  if (createError || !createdFolder?.id) {
    console.error('[granola-import] Failed to create Granola folder:', createError)
    throw createError ?? new Error('Failed to create Granola folder')
  }

  return createdFolder.id as string
}

async function loadGranolaFolderState(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  rootFolderId: string,
): Promise<GranolaFolderState> {
  const {data: folders, error} = await supabase
    .from('note_folders')
    .select('id, name, position')
    .eq('user_id', userId)
    .eq('parent_id', rootFolderId)
    .order('position', {ascending: true})

  if (error) {
    console.error('[granola-import] Failed to load Granola child folders:', error)
    throw error
  }

  const childFolderIdsByName = new Map<string, string>()
  let nextFolderPosition = 0

  for (const folder of folders ?? []) {
    const trimmedName = folder.name?.trim()
    if (trimmedName) {
      childFolderIdsByName.set(trimmedName, folder.id as string)
    }
    nextFolderPosition = Math.max(nextFolderPosition, ((folder.position as number | null) ?? -1) + 1)
  }

  return {
    childFolderIdsByName,
    nextFolderPosition,
    nextNotePositionByFolderId: new Map(),
  }
}

async function resolveGranolaFolderIdForNote(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  rootFolderId: string,
  detail: GranolaNoteDetail,
  folderState: GranolaFolderState,
) {
  const primaryFolderName = pickGranolaPrimaryFolderName(detail)

  if (!primaryFolderName) {
    return rootFolderId
  }

  const existingFolderId = folderState.childFolderIdsByName.get(primaryFolderName)
  if (existingFolderId) {
    return existingFolderId
  }

  const {data: createdFolder, error} = await supabase
    .from('note_folders')
    .insert({
      name: primaryFolderName,
      parent_id: rootFolderId,
      position: folderState.nextFolderPosition,
      user_id: userId,
    })
    .select('id')
    .single()

  if (error || !createdFolder?.id) {
    console.error('[granola-import] Failed to create Granola child folder:', error)
    throw error ?? new Error('Failed to create Granola child folder')
  }

  folderState.childFolderIdsByName.set(primaryFolderName, createdFolder.id as string)
  folderState.nextFolderPosition += 1

  return createdFolder.id as string
}

async function allocateNextNotePosition(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  folderId: string,
  folderState: GranolaFolderState,
) {
  const existingNextPosition = folderState.nextNotePositionByFolderId.get(folderId)
  if (existingNextPosition !== undefined) {
    folderState.nextNotePositionByFolderId.set(folderId, existingNextPosition + 1)
    return existingNextPosition
  }

  const nextPosition = await getNextFolderPosition(supabase, userId, folderId)
  folderState.nextNotePositionByFolderId.set(folderId, nextPosition + 1)
  return nextPosition
}

async function getImportedNotesBySourceId(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  sourceIds: string[],
) {
  const result = new Map<string, ImportedNoteRow>()
  if (sourceIds.length === 0) {
    return result
  }

  const {data, error} = await supabase
    .from('notes')
    .select('id, source_id, source_updated_at, source_detached, deleted_at, folder_id, source_metadata')
    .eq('user_id', userId)
    .eq('source_provider', GRANOLA_PROVIDER)
    .in('source_id', sourceIds)

  if (error) {
    console.error('[granola-import] Failed to load imported notes:', error)
    throw error
  }

  for (const note of (data ?? []) as ImportedNoteRow[]) {
    if (note.source_id) {
      result.set(note.source_id, note)
    }
  }

  return result
}

async function getNextFolderPosition(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  folderId: string,
) {
  const {data} = await supabase
    .from('notes')
    .select('position')
    .eq('user_id', userId)
    .eq('folder_id', folderId)
    .order('position', {ascending: false})
    .limit(1)
    .maybeSingle()

  return ((data?.position as number | undefined) ?? -1) + 1
}

async function getNewestImportedNoteId(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const {data} = await supabase
    .from('notes')
    .select('id, source_updated_at, source_created_at, created_at')
    .eq('user_id', userId)
    .eq('source_provider', GRANOLA_PROVIDER)
    .is('deleted_at', null)

  if (!data || data.length === 0) {
    return null
  }

  const sorted = [...data].sort((left, right) => {
    const leftTimestamp = new Date(
      left.source_updated_at ?? left.source_created_at ?? left.created_at,
    ).getTime()
    const rightTimestamp = new Date(
      right.source_updated_at ?? right.source_created_at ?? right.created_at,
    ).getTime()

    return rightTimestamp - leftTimestamp
  })

  return (sorted[0]?.id as string | undefined) ?? null
}

async function granolaFetch<T>(
  token: string,
  path: string,
  searchParams?: URLSearchParams,
): Promise<
  | {ok: true; data: T}
  | {ok: false; response: Response; status: number}
> {
  const url = new URL(`${GRANOLA_API_BASE_URL}${path}`)
  if (searchParams) {
    url.search = searchParams.toString()
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    return {ok: false, response, status: response.status}
  }

  return {
    data: await response.json() as T,
    ok: true,
  }
}

async function listGranolaNotes(
  token: string,
  input: {
    cursor?: string | null
    pageSize: number
    updatedAfter?: string | null
  },
) {
  const searchParams = new URLSearchParams()
  searchParams.set('page_size', String(input.pageSize))

  if (input.cursor) {
    searchParams.set('cursor', input.cursor)
  }

  if (input.updatedAfter) {
    searchParams.set('updated_after', input.updatedAfter)
  }

  const response = await granolaFetch<GranolaListResponse>(token, '/v1/notes', searchParams)
  if (!response.ok) {
    return {
      ok: false as const,
      response: await granolaErrorResponse(response.status),
      status: response.status,
    }
  }

  return {
    data: response.data,
    ok: true as const,
  }
}

async function getGranolaNote(token: string, noteId: string) {
  const searchParams = new URLSearchParams()
  searchParams.set('include', 'transcript')

  const response = await granolaFetch<GranolaNoteDetail>(token, `/v1/notes/${noteId}`, searchParams)
  if (!response.ok) {
    return {
      ok: false as const,
      response: await granolaErrorResponse(response.status),
      status: response.status,
    }
  }

  return {
    data: response.data,
    ok: true as const,
  }
}

async function granolaErrorResponse(status: number) {
  if (status === 401) {
    return jsonResponse({
      error: 'invalid_token',
      message: 'Granola rejected that API key. Paste a valid key and try again.',
    }, 401)
  }

  if (status === 429) {
    return jsonResponse({
      error: 'granola_rate_limited',
      message: 'Granola rate-limited the import. Wait a moment, then try again.',
    }, 429)
  }

  return jsonResponse({
    error: 'granola_api_error',
    message: `Granola returned ${status} while syncing notes.`,
  }, 502)
}
