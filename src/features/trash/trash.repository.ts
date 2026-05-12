import {rpcAdapter} from '../../platform/data/rpc-adapter'

export type TrashItemRow = {
  entity_id: string
  entity_type: 'card' | 'project' | 'document'
  deleted_at: string
  deleted_by_name: string
  project_name: string | null
  title: string
}

export type ArchiveItemRow = {
  entity_id: string
  entity_type: 'card' | 'project' | 'document'
  archived_at: string
  archived_by_name: string
  project_name: string | null
  title: string
}

export type TrashItem = {
  deletedAt: string
  deletedByName: string
  entityId: string
  entityType: 'card' | 'project' | 'document'
  projectName: string | null
  title: string
}

export type ArchiveItem = {
  archivedAt: string
  archivedByName: string
  entityId: string
  entityType: 'card' | 'project' | 'document'
  projectName: string | null
  title: string
}

function mapTrashRow(row: TrashItemRow): TrashItem {
  return {
    deletedAt: row.deleted_at,
    deletedByName: row.deleted_by_name,
    entityId: row.entity_id,
    entityType: row.entity_type,
    projectName: row.project_name,
    title: row.title,
  }
}

function mapArchiveRow(row: ArchiveItemRow): ArchiveItem {
  return {
    archivedAt: row.archived_at,
    archivedByName: row.archived_by_name,
    entityId: row.entity_id,
    entityType: row.entity_type,
    projectName: row.project_name,
    title: row.title,
  }
}

export const trashRepository = {
  async getWorkspaceTrash(workspaceId: string): Promise<TrashItem[]> {
    const rows = await rpcAdapter.call<TrashItemRow[]>('get_workspace_trash', {
      target_workspace_id: workspaceId,
    })
    return (rows ?? []).map(mapTrashRow)
  },

  async getWorkspaceArchive(workspaceId: string): Promise<ArchiveItem[]> {
    const rows = await rpcAdapter.call<ArchiveItemRow[]>('get_workspace_archive', {
      target_workspace_id: workspaceId,
    })
    return (rows ?? []).map(mapArchiveRow)
  },
}
