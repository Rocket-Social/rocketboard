import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {CompleteSprintInput, CreateSprintInput, ProjectSprintRecord, UpdateSprintInput} from './sprint.types'

type ProjectSprintRow = {
  completed_at: string | null
  created_at: string
  end_date: string | null
  goal: string | null
  id: string
  name: string
  position: number
  project_id: string
  start_date: string | null
  status: ProjectSprintRecord['status']
  updated_at: string
}

function mapProjectSprintRow(row: ProjectSprintRow): ProjectSprintRecord {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    endDate: row.end_date,
    goal: row.goal,
    id: row.id,
    name: row.name,
    position: row.position,
    projectId: row.project_id,
    startDate: row.start_date,
    status: row.status,
    updatedAt: row.updated_at,
  }
}

export type SprintRepository = {
  completeSprint(input: CompleteSprintInput): Promise<ProjectSprintRecord | null>
  createSprint(input: CreateSprintInput): Promise<ProjectSprintRecord>
  deleteSprint(sprintId: string): Promise<void>
  getProjectSprints(projectId: string): Promise<ProjectSprintRecord[]>
  setCardSprint(cardId: string, sprintId: string | null): Promise<void>
  startSprint(sprintId: string): Promise<void>
  updateSprint(input: UpdateSprintInput): Promise<void>
}

export const sprintRepository: SprintRepository = {
  async completeSprint(input) {
    return (await rpcAdapter.callSingle<ProjectSprintRecord>('complete_sprint', {
      target_action: input.action,
      target_next_sprint_end_date:
        input.nextSprint?.kind === 'create' ? input.nextSprint.endDate ?? null : null,
      target_next_sprint_goal:
        input.nextSprint?.kind === 'create' ? input.nextSprint.goal ?? null : null,
      target_next_sprint_id:
        input.nextSprint?.kind === 'existing' ? input.nextSprint.sprintId : null,
      target_next_sprint_name:
        input.nextSprint?.kind === 'create' ? input.nextSprint.sprintName : null,
      target_next_sprint_start_date:
        input.nextSprint?.kind === 'create' ? input.nextSprint.startDate ?? null : null,
      target_sprint_id: input.sprintId,
    })) ?? null
  },
  async createSprint(input) {
    return mapProjectSprintRow(await rpcAdapter.call<ProjectSprintRow>('create_project_sprint', {
      target_end_date: input.endDate ?? null,
      target_goal: input.goal ?? null,
      target_name: input.name,
      target_project_id: input.projectId,
      target_start_date: input.startDate ?? null,
    }))
  },
  async deleteSprint(sprintId) {
    await rpcAdapter.call('delete_sprint', {
      target_sprint_id: sprintId,
    })
  },
  async getProjectSprints(projectId) {
    const data = await rpcAdapter.call<ProjectSprintRow[]>('get_project_sprints', {
      target_project_id: projectId,
    })

    return (data ?? []).map(mapProjectSprintRow)
  },
  async setCardSprint(cardId, sprintId) {
    await rpcAdapter.call('set_card_sprint', {
      target_card_id: cardId,
      target_sprint_id: sprintId,
    })
  },
  async startSprint(sprintId) {
    await rpcAdapter.call('start_sprint', {
      target_sprint_id: sprintId,
    })
  },
  async updateSprint(input) {
    await rpcAdapter.call('update_project_sprint', {
      target_end_date: input.endDate ?? null,
      target_goal: input.goal ?? null,
      target_name: input.name ?? null,
      target_sprint_id: input.id,
      target_start_date: input.startDate ?? null,
    })
  },
}
