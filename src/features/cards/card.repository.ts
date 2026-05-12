import {z} from 'zod'

import {blobStore} from '../../platform/blob/blob-store'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {AttachmentRecord} from '../attachments/attachment.types'
import {
  mapCardRow,
  type AddCardCommentInput,
  type AgentCardCommentRunContext,
  type AgentCardRunSummary,
  type AgentToolCallAuditEntry,
  type CardComment,
  type CardDetail,
  type CardRecord,
  type CardRow,
  type CreateCardInput,
  type DuplicateCardsInput,
  type MoveCardInput,
  type MoveCardToGroupInput,
  type SetCardAssigneeInput,
  type SetCardScheduleInput,
  type UploadCardAttachmentInput,
  type UpdateCardInput,
} from './card.types'

export const CARD_NOT_FOUND = 'CARD_NOT_FOUND'

// Phase 4 (PR 4-A): the worker-written tool-call audit shape arrives
// inside `get_card_detail.comments[*].agent_run_context.tool_calls`.
// `rpcAdapter.callSingle` already snake→camelCases every key in the
// response, so the schemas below validate the camelCase keys the rest
// of the frontend consumes. Malformed entries are dropped (with a
// console.warn breadcrumb) instead of crashing the CardSheet render.
const agentToolCallStatusSchema = z.enum([
  'awaiting_approval',
  'executed',
  'rejected',
  'expired',
])

const agentRunStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'cancelled',
])

const agentToolCallAuditEntrySchema = z.object({
  approvedByUserId: z.string().nullable().optional(),
  args: z.record(z.string(), z.unknown()).default({}),
  editedArgs: z.record(z.string(), z.unknown()).optional(),
  executedAt: z.string().optional(),
  name: z.string().min(1),
  queuedAt: z.string().optional(),
  rejectedAt: z.string().optional(),
  rejectedByUserId: z.string().nullable().optional(),
  rejectionReason: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  status: agentToolCallStatusSchema,
  toolUseId: z.string().min(1),
})

const agentCardCommentRunContextSchema = z.object({
  personaAccentColor: z.string().nullable().optional(),
  personaId: z.string().min(1),
  personaName: z.string().min(1),
  runId: z.string().min(1),
  status: agentRunStatusSchema,
  toolCalls: z.array(z.unknown()).default([]),
})

const agentCardRunSummarySchema = z.object({
  personaAccentColor: z.string().nullable().optional(),
  personaId: z.string().min(1),
  personaName: z.string().min(1),
  runId: z.string().min(1),
  status: agentRunStatusSchema,
})

function parseAgentToolCallAuditEntry(raw: unknown): AgentToolCallAuditEntry | null {
  const parsed = agentToolCallAuditEntrySchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[card.repository] dropping malformed tool_call audit entry', parsed.error.issues)
    return null
  }
  return parsed.data as AgentToolCallAuditEntry
}

function parseAgentRunContext(raw: unknown): AgentCardCommentRunContext | null {
  if (raw === null || raw === undefined) return null
  const parsed = agentCardCommentRunContextSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[card.repository] dropping malformed agent_run_context', parsed.error.issues)
    return null
  }
  const toolCalls = parsed.data.toolCalls
    .map(parseAgentToolCallAuditEntry)
    .filter((entry): entry is AgentToolCallAuditEntry => entry !== null)
  return {
    personaAccentColor: parsed.data.personaAccentColor ?? null,
    personaId: parsed.data.personaId,
    personaName: parsed.data.personaName,
    runId: parsed.data.runId,
    status: parsed.data.status,
    toolCalls,
  }
}

function parseAgentRunSummary(raw: unknown): AgentCardRunSummary | null {
  if (raw === null || raw === undefined) return null
  const parsed = agentCardRunSummarySchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[card.repository] dropping malformed agent_run_summary', parsed.error.issues)
    return null
  }
  return {
    personaAccentColor: parsed.data.personaAccentColor ?? null,
    personaId: parsed.data.personaId,
    personaName: parsed.data.personaName,
    runId: parsed.data.runId,
    status: parsed.data.status,
  }
}

type RawCardComment = {
  agentRunContext?: unknown
  authorName?: string | null
  authorUserId?: string | null
  bodyText?: string | null
  createdAt?: string | null
  id: string
  isStreaming?: boolean | null
}

function normalizeComment(raw: RawCardComment): CardComment {
  return {
    agentRunContext: parseAgentRunContext(raw.agentRunContext),
    authorName: raw.authorName ?? 'Unknown',
    authorUserId: raw.authorUserId ?? null,
    bodyText: raw.bodyText ?? '',
    createdAt: raw.createdAt ?? '',
    id: raw.id,
    isStreaming: raw.isStreaming ?? false,
  }
}

// Forward + backward compat (D13): the SQL extension may not yet be
// deployed, in which case `agent_run_context` / `is_streaming` are
// absent from the JSONB row. The pre-existing `authorUserId` field
// arrives as null from older shapes. `normalizeComment` defaults each
// new field so missing keys never crash the render.
function applyCardDetailShape(data: unknown): CardDetail {
  const raw = data as Record<string, unknown> & CardDetail
  const rawComments = Array.isArray(raw.comments) ? raw.comments : []
  const normalizedComments = rawComments.map((entry) => normalizeComment(entry as RawCardComment))
  const summarySource = parseAgentRunSummary(
    (raw as {agentRunSummary?: unknown}).agentRunSummary,
  )
  return {
    ...(raw as CardDetail),
    agentRunSummary: summarySource,
    comments: normalizedComments,
  }
}

export type CardRepository = {
  addComment(input: AddCardCommentInput): Promise<CardComment>
  archiveCards(cardIds: string[]): Promise<void>
  createCard(input: CreateCardInput): Promise<CardRecord>
  deleteCard(cardId: string): Promise<void>
  deleteCards(cardIds: string[]): Promise<void>
  duplicateCards(input: DuplicateCardsInput): Promise<CardRecord[]>
  getCardDetail(cardId: string): Promise<CardDetail>
  moveCard(input: MoveCardInput): Promise<CardRecord>
  moveCardToGroup(input: MoveCardToGroupInput): Promise<CardRecord>
  setCardAssignee(input: SetCardAssigneeInput): Promise<CardRecord>
  setCardSchedule(input: SetCardScheduleInput): Promise<CardRecord>
  permanentDeleteCards(cardIds: string[]): Promise<void>
  restoreCards(cardIds: string[]): Promise<void>
  trashCards(cardIds: string[]): Promise<void>
  unarchiveCards(cardIds: string[]): Promise<void>
  uploadAttachment(input: UploadCardAttachmentInput): Promise<AttachmentRecord>
  updateCard(input: UpdateCardInput): Promise<CardRecord>
}

async function loadCardDetail(cardId: string) {
  const data = await rpcAdapter.callSingle<CardDetail | null>('get_card_detail', {
    target_card_id: cardId,
  })

  if (!data) {
    throw new Error(CARD_NOT_FOUND)
  }

  return applyCardDetailShape(data)
}

export const cardRepository: CardRepository = {
  async archiveCards(cardIds) {
    if (cardIds.length === 0) return
    await rpcAdapter.call('archive_cards', {target_card_ids: cardIds})
  },
  async addComment(input) {
    const rows = await rpcAdapter.callAndTransform<CardComment[]>('add_card_comment', {
      target_body_text: input.bodyText,
      target_card_id: input.cardId,
    })
    const comment = rows?.[0]

    if (!comment) {
      throw new Error(CARD_NOT_FOUND)
    }

    return comment
  },
  async deleteCard(cardId) {
    await rpcAdapter.call('delete_card', {target_card_id: cardId})
  },
  async deleteCards(cardIds) {
    if (cardIds.length === 0) return
    if (cardIds.length === 1) {
      await rpcAdapter.call('delete_card', {target_card_id: cardIds[0]})
      return
    }
    await rpcAdapter.call('delete_cards', {target_card_ids: cardIds})
  },
  async createCard(input) {
    const rows = await rpcAdapter.call<CardRow[]>('create_card', {
      target_body_json: input.bodyJson ?? null,
      target_body_md: input.bodyMd ?? '',
      target_due_at: input.dueAt ?? null,
      target_effort: input.effort ?? null,
      target_group_id: input.groupId ?? null,
      target_priority_option_id: input.priorityOptionId ?? null,
      target_project_id: input.projectId,
      target_sprint_id: input.sprintId ?? null,
      target_initiative_id: input.initiativeId ?? null,
      target_start_at: input.startAt ?? null,
      target_status_option_id: input.statusOptionId ?? null,
      target_tags: input.tags ?? [],
      target_title: input.title,
    })
    const card = rows?.[0]

    if (!card) {
      throw new Error(CARD_NOT_FOUND)
    }

    return mapCardRow(card, input.projectId)
  },
  async duplicateCards(input) {
    if (input.cardIds.length === 0) return []
    const rows = await rpcAdapter.call<CardRow[]>('duplicate_cards', {
      target_card_ids: input.cardIds,
      target_project_id: input.projectId,
    })
    return (rows ?? []).map((row) => mapCardRow(row, input.projectId))
  },
  async getCardDetail(cardId) {
    return loadCardDetail(cardId)
  },
  async moveCard(input) {
    const rows = await rpcAdapter.call<CardRow[]>('move_card', {
      target_card_id: input.cardId,
      target_position: input.targetPosition,
      target_status_option_id: input.targetStatusOptionId,
    })
    const card = rows?.[0]

    if (!card) {
      throw new Error(CARD_NOT_FOUND)
    }

    return mapCardRow(card, input.projectId)
  },
  async moveCardToGroup(input) {
    const rows = await rpcAdapter.call<CardRow[]>('move_card_to_group', {
      target_card_id: input.cardId,
      target_group_id: input.targetGroupId,
      target_position: input.targetPosition ?? null,
    })
    const card = rows?.[0]

    if (!card) {
      throw new Error(CARD_NOT_FOUND)
    }

    return mapCardRow(card, input.projectId)
  },
  async setCardAssignee(input) {
    const rows = await rpcAdapter.call<CardRow[]>('set_card_assignee', {
      target_assignee_user_id: input.assigneeUserId,
      target_card_id: input.cardId,
    })
    const card = rows?.[0]

    if (!card) {
      throw new Error(CARD_NOT_FOUND)
    }

    return mapCardRow(card, input.projectId)
  },
  async setCardSchedule(input) {
    const rows = await rpcAdapter.call<CardRow[]>('set_card_schedule', {
      target_card_id: input.cardId,
      target_due_at: input.dueAt,
      target_start_at: input.startAt,
    })
    const card = rows?.[0]

    if (!card) {
      throw new Error(CARD_NOT_FOUND)
    }

    return mapCardRow(card, input.projectId)
  },
  async permanentDeleteCards(cardIds) {
    if (cardIds.length === 0) return
    await rpcAdapter.call('permanent_delete_cards', {target_card_ids: cardIds})
  },
  async restoreCards(cardIds) {
    if (cardIds.length === 0) return
    await rpcAdapter.call('restore_cards', {target_card_ids: cardIds})
  },
  async trashCards(cardIds) {
    if (cardIds.length === 0) return
    await rpcAdapter.call('trash_cards', {target_card_ids: cardIds})
  },
  async unarchiveCards(cardIds) {
    if (cardIds.length === 0) return
    await rpcAdapter.call('unarchive_cards', {target_card_ids: cardIds})
  },
  async uploadAttachment(input) {
    const storagePath = await blobStore.uploadProjectAttachment({
      file: input.file,
      parentId: input.cardId,
      projectId: input.projectId,
    })

    try {
      return await rpcAdapter.callAndTransform<AttachmentRecord>('create_card_attachment', {
        target_card_id: input.cardId,
        target_content_type: input.file.type || null,
        target_file_name: input.file.name,
        target_project_id: input.projectId,
        target_size_bytes: input.file.size,
        target_storage_path: storagePath,
      })
    } catch (error) {
      await blobStore.remove([storagePath])
      throw error
    }
  },
  async updateCard(input) {
    const rows = await rpcAdapter.call<CardRow[]>('update_card', {
      target_body_json: input.bodyJson,
      target_body_md: input.bodyMd ?? '',
      target_card_id: input.id,
      target_completed_at: input.completedAt ?? null,
      target_due_at: input.dueAt ?? null,
      target_effort: input.effort ?? null,
      target_initiative_changed: 'initiativeId' in input,
      target_initiative_id: input.initiativeId ?? null,
      target_priority_option_id: input.priorityOptionId,
      target_start_at: input.startAt ?? null,
      target_status_option_id: input.statusOptionId,
      target_tags: input.tags,
      target_title: input.title,
    })
    const card = rows?.[0]

    if (!card) {
      throw new Error(CARD_NOT_FOUND)
    }

    const detail = await loadCardDetail(input.id)
    return {
      ...mapCardRow(card, detail.projectId),
      assigneeName: detail.assigneeName,
    }
  },
}
