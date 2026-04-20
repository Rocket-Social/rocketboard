import {callEdgeFunction} from '../../platform/edge/edge-client'
import {snakeToCamel} from '../../platform/data/rpc-adapter'
import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import type {Database} from '../../platform/supabase/database.types'
import {
  coerceGranolaConnectionStatus,
  GRANOLA_PROVIDER,
  type GranolaAuthMethod,
  type GranolaConnectionMode,
  type GranolaConnectionRecord,
  type GranolaSyncMode,
} from './granola-import.shared'

type ConnectionRow = Pick<
  Database['public']['Tables']['note_import_connections']['Row'],
  | 'backfill_cursor'
  | 'created_at'
  | 'id'
  | 'initial_import_completed_at'
  | 'last_source_updated_at'
  | 'last_sync_error'
  | 'last_sync_finished_at'
  | 'last_sync_started_at'
  | 'provider'
  | 'root_folder_id'
  | 'status'
  | 'updated_at'
  | 'user_id'
> & {
  auth_method: string
  mode: string
}

type GranolaConnectResult = {
  connection: GranolaConnectionRecord
  success: true
}

type GranolaSetModeResult = {
  connection: GranolaConnectionRecord
  convertedCount: number
  success: true
}

export type GranolaSyncResult = {
  connection: GranolaConnectionRecord
  didCompleteInitialImport: boolean
  hasMore: boolean
  importedCount: number
  initialImportCompleted: boolean
  newestImportedNoteId: string | null
  nextCursor: string | null
  skippedCount: number
  success: true
  syncMode: GranolaSyncMode
  totalProcessed: number
  updatedCount: number
}

function coerceConnectionMode(value: string | null | undefined): GranolaConnectionMode {
  return value === 'mirror' ? 'mirror' : 'capture'
}

function coerceAuthMethod(value: string | null | undefined): GranolaAuthMethod {
  return value === 'oauth' ? 'oauth' : 'api_key'
}

function mapConnection(row: ConnectionRow): GranolaConnectionRecord {
  return {
    authMethod: coerceAuthMethod(row.auth_method),
    backfillCursor: row.backfill_cursor,
    createdAt: row.created_at,
    id: row.id,
    initialImportCompletedAt: row.initial_import_completed_at,
    lastSourceUpdatedAt: row.last_source_updated_at,
    lastSyncError: row.last_sync_error,
    lastSyncFinishedAt: row.last_sync_finished_at,
    lastSyncStartedAt: row.last_sync_started_at,
    mode: coerceConnectionMode(row.mode),
    provider: GRANOLA_PROVIDER,
    rootFolderId: row.root_folder_id,
    status: coerceGranolaConnectionStatus(row.status),
    updatedAt: row.updated_at,
    userId: row.user_id,
  }
}

async function invokeGranolaImport<T>(body: Record<string, unknown>, errorFallback: string): Promise<T> {
  return callEdgeFunction<T>('granola-import', {
    body,
    errorFallback,
    transformResponse: (data) => snakeToCamel<T>(data),
  })
}

export const granolaImportRepository = {
  async connect(token: string, mode: GranolaConnectionMode = 'capture'): Promise<GranolaConnectResult> {
    return invokeGranolaImport<GranolaConnectResult>(
      {action: 'connect', mode, token},
      'Rocketboard could not connect to Granola.',
    )
  },

  async disconnect(): Promise<GranolaConnectResult> {
    return invokeGranolaImport<GranolaConnectResult>(
      {action: 'disconnect'},
      'Rocketboard could not disconnect Granola.',
    )
  },

  async getConnection(userId: string): Promise<GranolaConnectionRecord | null> {
    const {data, error} = await (getSupabaseBrowserClient()
      .from('note_import_connections') as any)
      .select([
        'auth_method',
        'backfill_cursor',
        'created_at',
        'id',
        'initial_import_completed_at',
        'last_source_updated_at',
        'last_sync_error',
        'last_sync_finished_at',
        'last_sync_started_at',
        'mode',
        'provider',
        'root_folder_id',
        'status',
        'updated_at',
        'user_id',
      ].join(', '))
      .eq('user_id', userId)
      .eq('provider', GRANOLA_PROVIDER)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return null
    }

    return mapConnection(data as ConnectionRow)
  },

  async setMode(mode: GranolaConnectionMode, convertExisting = false): Promise<GranolaSetModeResult> {
    return invokeGranolaImport<GranolaSetModeResult>(
      {action: 'set_mode', convert_existing: convertExisting, mode},
      'Rocketboard could not change the import mode.',
    )
  },

  async sync(input: {cursor?: string | null; mode?: GranolaSyncMode} = {}): Promise<GranolaSyncResult> {
    return invokeGranolaImport<GranolaSyncResult>(
      {action: 'sync', cursor: input.cursor ?? null, mode: input.mode ?? null},
      'Rocketboard could not sync Granola notes.',
    )
  },
}
