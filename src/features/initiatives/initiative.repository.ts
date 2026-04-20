import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {
  CreateInitiativeInput,
  InitiativeCardRecord,
  InitiativeHealth,
  InitiativePickerCard,
  InitiativeRecord,
  InitiativeSparklinePoint,
  InitiativeStatus,
  InitiativeSummary,
  InitiativeUpdateRecord,
  InitiativeVisibility,
  PostInitiativeUpdateInput,
  UpdateInitiativeInput,
} from './initiative.types'

type InitiativeRow = {
  created_at: string
  description: string | null
  health: InitiativeHealth
  id: string
  latest_update_at: string | null
  latest_update_text: string | null
  lead_name: string | null
  lead_user_id: string | null
  name: string
  position: number
  status: InitiativeStatus
  target_date: string | null
  updated_at: string
  visibility: InitiativeVisibility
  workspace_id: string
}

type InitiativeSummaryRow = {
  cards_completed: number
  cards_completed_this_week: number
  cards_not_started: number
  cards_started: number
  initiative_id: string
  project_count: number
  total_cards: number
}

type InitiativeCardRow = {
  assignee_name: string
  assignee_user_id: string | null
  card_id: string
  completed_at: string | null
  created_at: string
  due_at: string | null
  effort: number | null
  priority_option_id: string | null
  project_id: string
  project_name: string
  start_at: string | null
  status_category: string
  status_label: string
  status_option_id: string | null
  title: string
}

type InitiativeUpdateRow = {
  author_name: string
  body_text: string
  created_at: string
  created_by_user_id: string
  health_snapshot: InitiativeHealth | null
  id: string
  initiative_id: string
}

function mapInitiativeRow(row: InitiativeRow): InitiativeRecord {
  return {
    createdAt: row.created_at,
    description: row.description,
    health: row.health,
    id: row.id,
    latestUpdateAt: row.latest_update_at,
    latestUpdateText: row.latest_update_text,
    leadName: row.lead_name,
    leadUserId: row.lead_user_id,
    name: row.name,
    position: row.position,
    status: row.status,
    targetDate: row.target_date,
    updatedAt: row.updated_at,
    visibility: row.visibility,
    workspaceId: row.workspace_id,
  }
}

function mapInitiativeSummaryRow(row: InitiativeSummaryRow): InitiativeSummary {
  return {
    cardsCompleted: Number(row.cards_completed),
    cardsCompletedThisWeek: Number(row.cards_completed_this_week),
    cardsNotStarted: Number(row.cards_not_started),
    cardsStarted: Number(row.cards_started),
    initiativeId: row.initiative_id,
    projectCount: Number(row.project_count),
    totalCards: Number(row.total_cards),
  }
}

function mapInitiativeCardRow(row: InitiativeCardRow): InitiativeCardRecord {
  return {
    assigneeName: row.assignee_name,
    assigneeUserId: row.assignee_user_id,
    cardId: row.card_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    dueAt: row.due_at,
    effort: row.effort,
    priorityOptionId: row.priority_option_id,
    projectId: row.project_id,
    projectName: row.project_name,
    startAt: row.start_at,
    statusCategory: row.status_category,
    statusLabel: row.status_label,
    statusOptionId: row.status_option_id,
    title: row.title,
  }
}

function mapInitiativeUpdateRow(row: InitiativeUpdateRow): InitiativeUpdateRecord {
  return {
    authorName: row.author_name,
    bodyText: row.body_text,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    healthSnapshot: row.health_snapshot,
    id: row.id,
    initiativeId: row.initiative_id,
  }
}

type InitiativePickerCardRow = {
  assignee_name: string
  card_id: string
  initiative_id: string | null
  project_id: string
  project_name: string
  status_category: string
  status_label: string
  title: string
}

function mapInitiativePickerCardRow(row: InitiativePickerCardRow): InitiativePickerCard {
  return {
    assigneeName: row.assignee_name,
    cardId: row.card_id,
    initiativeId: row.initiative_id,
    projectId: row.project_id,
    projectName: row.project_name,
    statusCategory: row.status_category,
    statusLabel: row.status_label,
    title: row.title,
  }
}

type InitiativeSparklineRow = {
  cards_completed_cumulative: number
  day: string
  initiative_id: string
  total_scope: number
}

function mapInitiativeSparklineRow(row: InitiativeSparklineRow): InitiativeSparklinePoint {
  return {
    cardsCompletedCumulative: Number(row.cards_completed_cumulative),
    day: row.day,
    initiativeId: row.initiative_id,
    totalScope: Number(row.total_scope),
  }
}

export type InitiativeRepository = {
  archiveInitiative(initiativeId: string): Promise<void>
  createInitiative(input: CreateInitiativeInput): Promise<InitiativeRecord>
  deleteInitiative(initiativeId: string): Promise<void>
  renameInitiative(initiativeId: string, name: string): Promise<void>
  getInitiativeCards(initiativeId: string): Promise<InitiativeCardRecord[]>
  getInitiativeUpdates(initiativeId: string): Promise<InitiativeUpdateRecord[]>
  getWorkspaceInitiativePickerCards(workspaceId: string, initiativeId: string): Promise<InitiativePickerCard[]>
  getWorkspaceInitiativeSparklines(workspaceId: string): Promise<InitiativeSparklinePoint[]>
  getWorkspaceInitiativeSummaries(workspaceId: string): Promise<InitiativeSummary[]>
  getWorkspaceInitiatives(workspaceId: string): Promise<InitiativeRecord[]>
  postInitiativeUpdate(input: PostInitiativeUpdateInput): Promise<InitiativeUpdateRecord>
  reorderInitiative(initiativeId: string, newPosition: number): Promise<void>
  setCardInitiative(cardId: string, initiativeId: string | null): Promise<void>
  updateInitiative(input: UpdateInitiativeInput): Promise<void>
}

export const initiativeRepository: InitiativeRepository = {
  async archiveInitiative(initiativeId) {
    await rpcAdapter.call('archive_initiative', {
      target_initiative_id: initiativeId,
    })
  },

  async deleteInitiative(initiativeId) {
    await rpcAdapter.call('delete_initiative', {
      target_initiative_id: initiativeId,
    })
  },

  async createInitiative(input) {
    return mapInitiativeRow(await rpcAdapter.call<InitiativeRow>('create_initiative', {
      target_description: input.description ?? null,
      target_lead_user_id: input.leadUserId ?? null,
      target_name: input.name,
      target_target_date: input.targetDate ?? null,
      target_visibility: input.visibility ?? 'open',
      target_workspace_id: input.workspaceId,
    }))
  },

  async getInitiativeCards(initiativeId) {
    const data = await rpcAdapter.call<InitiativeCardRow[]>('get_initiative_cards', {
      target_initiative_id: initiativeId,
    })
    return (data ?? []).map(mapInitiativeCardRow)
  },

  async getWorkspaceInitiativePickerCards(workspaceId, initiativeId) {
    const data = await rpcAdapter.call<InitiativePickerCardRow[]>('get_workspace_initiative_picker_cards', {
      target_initiative_id: initiativeId,
      target_workspace_id: workspaceId,
    })
    return (data ?? []).map(mapInitiativePickerCardRow)
  },

  async getInitiativeUpdates(initiativeId) {
    const data = await rpcAdapter.call<InitiativeUpdateRow[]>('get_initiative_updates', {
      target_initiative_id: initiativeId,
    })
    return (data ?? []).map(mapInitiativeUpdateRow)
  },

  async getWorkspaceInitiativeSparklines(workspaceId) {
    const data = await rpcAdapter.call<InitiativeSparklineRow[]>('get_workspace_initiative_sparklines', {
      target_workspace_id: workspaceId,
    })
    return (data ?? []).map(mapInitiativeSparklineRow)
  },

  async getWorkspaceInitiativeSummaries(workspaceId) {
    const data = await rpcAdapter.call<InitiativeSummaryRow[]>('get_workspace_initiative_summaries', {
      target_workspace_id: workspaceId,
    })
    return (data ?? []).map(mapInitiativeSummaryRow)
  },

  async getWorkspaceInitiatives(workspaceId) {
    const data = await rpcAdapter.call<InitiativeRow[]>('get_workspace_initiatives', {
      target_workspace_id: workspaceId,
    })
    return (data ?? []).map(mapInitiativeRow)
  },

  async postInitiativeUpdate(input) {
    return mapInitiativeUpdateRow(await rpcAdapter.call<InitiativeUpdateRow>('post_initiative_update', {
      target_body_text: input.bodyText,
      target_health: input.health,
      target_initiative_id: input.initiativeId,
    }))
  },

  async setCardInitiative(cardId, initiativeId) {
    await rpcAdapter.call('set_card_initiative', {
      target_card_id: cardId,
      target_initiative_id: initiativeId,
    })
  },

  async renameInitiative(initiativeId, name) {
    await rpcAdapter.call('rename_initiative', {
      target_initiative_id: initiativeId,
      target_name: name,
    })
  },

  async updateInitiative(input) {
    await rpcAdapter.call('update_initiative', {
      target_health: input.health ?? null,
      target_initiative_id: input.id,
      target_lead_user_id: input.leadUserId ?? null,
      target_name: input.name ?? null,
      target_description: input.description ?? null,
      target_status: input.status ?? null,
      target_target_date: input.targetDate ?? null,
      target_visibility: input.visibility ?? null,
    })
  },

  async reorderInitiative(initiativeId, newPosition) {
    await rpcAdapter.call('reorder_initiative', {
      target_initiative_id: initiativeId,
      target_new_position: newPosition,
    })
  },
}
