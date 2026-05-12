import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {ProjectGroupRecord} from './project-group.types'

type ProjectGroupRow = {
  created_at: string
  group_id: string
  label: string
  position: number
  project_id: string
  updated_at: string
}

function mapProjectGroupRow(row: ProjectGroupRow): ProjectGroupRecord {
  return {
    createdAt: row.created_at,
    id: row.group_id,
    label: row.label,
    position: row.position,
    projectId: row.project_id,
    updatedAt: row.updated_at,
  }
}

export type CreateProjectGroupInput = {
  label: string
  projectId: string
}

export type DeleteProjectGroupInput = {
  deleteCards: boolean
  groupId: string
}

export type ProjectGroupRepository = {
  createGroup(input: CreateProjectGroupInput): Promise<ProjectGroupRecord>
  deleteGroup(input: DeleteProjectGroupInput): Promise<void>
  renameGroup(groupId: string, label: string): Promise<ProjectGroupRecord>
  reorderGroups(groupIds: string[]): Promise<void>
}

export const projectGroupRepository: ProjectGroupRepository = {
  async createGroup(input) {
    return mapProjectGroupRow(await rpcAdapter.call<ProjectGroupRow>('create_project_group', {
      target_label: input.label,
      target_project_id: input.projectId,
    }))
  },
  async deleteGroup(input) {
    await rpcAdapter.call('delete_project_group', {
      target_delete_cards: input.deleteCards,
      target_group_id: input.groupId,
    })
  },
  async renameGroup(groupId, label) {
    return mapProjectGroupRow(await rpcAdapter.call<ProjectGroupRow>('rename_project_group', {
      target_group_id: groupId,
      target_label: label,
    }))
  },
  async reorderGroups(groupIds) {
    await rpcAdapter.call('reorder_project_groups', {
      target_group_ids: groupIds,
    })
  },
}
