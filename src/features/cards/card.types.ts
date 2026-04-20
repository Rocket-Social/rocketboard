import type {AttachmentRecord} from '../attachments/attachment.types'
import type {CardCustomFieldValueMap} from '../fields/field.types'
import {cloneRichTextDocument, type RichTextDocument} from '../rich-text/rich-text'

export type StatusCategory = 'not_started' | 'started' | 'completed'

export type TaskBoardMode = 'standard' | 'sprint'

export type ProjectStatusOption = {
  category: StatusCategory
  color: string | null
  id: string
  isDefault: boolean
  key: string
  label: string
  position: number
}

export type ProjectPriorityOption = {
  color: string | null
  id: string
  isDefault: boolean
  key: string
  label: string
  sortOrder: number
}

export type TableGroupBy = 'assignee' | 'due_date' | 'group' | 'priority' | 'status'

export type CardRecord = {
  assigneeName: string
  assigneeUserId: string | null
  bodyJson?: RichTextDocument
  bodyMd?: string
  cardRef?: string | null
  completedAt: string | null
  createdAt: string
  dueAt: string | null
  effort: number | null
  groupId: string | null
  groupPosition: number
  id: string
  priorityOptionId: string | null
  projectId: string
  projectCardNumber?: number | null
  projectKey?: string | null
  customFieldValues: CardCustomFieldValueMap
  initiativeId: string | null
  sprintId: string | null
  startAt: string | null
  statusOptionId: string | null
  statusPosition: number
  tags: string[]
  title: string
}

export type CardComment = {
  authorName: string
  authorUserId?: string | null
  bodyText: string
  createdAt: string
  id: string
}

export type CardDetail = CardRecord & {
  attachments: AttachmentRecord[]
  comments: CardComment[]
}

export type CreateCardInput = {
  bodyJson?: RichTextDocument | null
  bodyMd?: string
  dueAt?: string | null
  effort?: number | null
  groupId?: string | null
  initiativeId?: string | null
  priorityOptionId?: string | null
  projectId: string
  sprintId?: string | null
  startAt?: string | null
  statusOptionId?: string | null
  tags?: string[]
  title: string
}

export type DuplicateCardsInput = {
  cardIds: string[]
  projectId: string
}

export type UpdateCardInput = {
  bodyJson?: RichTextDocument
  bodyMd?: string
  completedAt?: string | null
  dueAt?: string | null
  effort: number | null
  id: string
  initiativeId?: string | null
  priorityOptionId: string | null
  startAt?: string | null
  statusOptionId: string | null
  tags: string[]
  title: string
}

export type SetCardAssigneeInput = {
  assigneeUserId: string | null
  cardId: string
  projectId: string
}

export type AddCardCommentInput = {
  bodyText: string
  cardId: string
}

export type UploadCardAttachmentInput = {
  cardId: string
  file: File
  projectId: string
}

export type MoveCardInput = {
  cardId: string
  projectId: string
  targetPosition: number
  targetStatusOptionId: string | null
}

export type MoveCardToGroupInput = {
  cardId: string
  projectId: string
  targetGroupId: string | null
  targetPosition?: number | null
}

export type SetCardScheduleInput = {
  cardId: string
  dueAt: string | null
  projectId: string
  startAt: string | null
}

export type CardRow = {
  assignee_name: string
  assignee_user_id: string | null
  body_json: CardRecord['bodyJson'] | null
  body_md: string | null
  card_ref?: string | null
  card_id: string
  custom_field_values: CardCustomFieldValueMap | null
  due_at: string | null
  effort: number | null
  group_id: string | null
  group_position: number
  initiative_id: string | null
  priority_option_id: string | null
  project_card_number?: number | null
  project_key?: string | null
  sprint_id: string | null
  start_at: string | null
  status_option_id: string | null
  status_position: number
  tags: string[] | null
  title: string
  created_at: string
  completed_at: string | null
}

export function mapCardRow(row: CardRow, projectId: string): CardRecord {
  return {
    assigneeName: row.assignee_name,
    assigneeUserId: row.assignee_user_id,
    bodyJson: row.body_json ? cloneRichTextDocument(row.body_json, row.body_md ?? '') : undefined,
    bodyMd: row.body_md ?? undefined,
    cardRef: row.card_ref ?? null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    customFieldValues: row.custom_field_values ?? {},
    dueAt: row.due_at,
    effort: row.effort,
    groupId: row.group_id,
    groupPosition: row.group_position,
    id: row.card_id,
    initiativeId: row.initiative_id,
    priorityOptionId: row.priority_option_id,
    projectId,
    projectCardNumber: row.project_card_number ?? null,
    projectKey: row.project_key ?? null,
    sprintId: row.sprint_id,
    startAt: row.start_at,
    statusOptionId: row.status_option_id,
    statusPosition: row.status_position,
    tags: row.tags ?? [],
    title: row.title,
  }
}
