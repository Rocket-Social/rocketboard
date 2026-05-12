import type {SupabaseClient, User} from '@supabase/supabase-js'

import {formatAuthUserName} from './session.js'

type JsonObject = Record<string, unknown>

type KnownRpc =
  | 'add_card_comment'
  | 'create_card'
  | 'get_card_activity'
  | 'get_card_detail'
  | 'get_project_card_rows'
  | 'get_project_custom_fields'
  | 'get_project_document_snapshot'
  | 'get_project_groups'
  | 'get_project_priority_options'
  | 'get_project_share_snapshot'
  | 'get_project_sprints'
  | 'get_project_status_options'
  | 'get_shell_summary_rows_v2'
  | 'move_card_to_group'
  | 'search_accessible_content'
  | 'search_project_content'
  | 'search_workspace_content'
  | 'set_card_assignee'
  | 'set_card_field_value'
  | 'set_card_sprint'
  | 'trash_cards'
  | 'update_card'

type ShellSummaryRow = {
  default_project_view_id: string | null
  member_count: number | null
  project_access: 'open' | 'private' | null
  project_builtin_field_labels: Record<string, unknown> | null
  project_created_at: string
  project_icon: string | null
  project_id: string
  project_key: string
  project_name: string
  project_position: number
  project_slug: string
  project_updated_at: string
  project_views: Array<{
    id?: unknown
    isDefault?: unknown
    isHidden?: unknown
    name?: unknown
    position?: unknown
    viewType?: unknown
  }> | null
  task_count: number | null
  workspace_color_token: string | null
  workspace_icon: string | null
  workspace_id: string
  workspace_name: string
  workspace_organization_id: string
  workspace_organization_name: string | null
  workspace_slug: string
}

type StatusOptionRow = {
  category: 'completed' | 'not_started' | 'started'
  color: string | null
  id: string
  is_default: boolean
  key: string
  label: string
  position: number
}

type PriorityOptionRow = {
  color: string | null
  id: string
  is_default: boolean
  key: string
  label: string
  sort_order: number
}

type ProjectGroupRow = {
  created_at: string
  group_id: string
  label: string
  position: number
  project_id: string
  updated_at: string
}

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
  status: 'active' | 'completed' | 'planned'
  updated_at: string
}

type CustomFieldPayload = {
  fieldType: 'date' | 'number' | 'single_select' | 'text'
  id: string
  key: string
  name: string
  options?: Array<{
    color?: string | null
    id: string
    label: string
  }>
}

type ProjectShareSnapshot = {
  canManageProject?: boolean
  invites?: Array<{
    createdAt: string
    email: string
    id: string
    role: 'admin' | 'member'
  }>
  members?: Array<{
    email: string
    id: string
    name: string
    role: 'admin' | 'member'
  }>
}

export type CardRow = {
  assignee_name: string
  assignee_user_id: string | null
  body_json: JsonObject | null
  body_text: string | null
  card_id: string
  card_ref: string
  completed_at: string | null
  created_at: string
  custom_field_values: Record<string, unknown> | null
  due_at: string | null
  effort: number | null
  group_id: string | null
  group_position: number
  initiative_id: string | null
  priority_option_id: string | null
  project_card_number: number
  project_key: string
  sprint_id: string | null
  start_at: string | null
  status_option_id: string | null
  status_position: number
  tags: string[] | null
  title: string
}

type CardDetailPayload = {
  assigneeName: string
  assigneeUserId: string | null
  attachments: Array<{
    contentType: string | null
    createdAt: string
    fileName: string
    id: string
    sizeBytes: number
    storagePath: string
    uploadedByName: string
  }>
  bodyJson: JsonObject | null
  bodyText: string
  cardRef: string
  comments: Array<{
    authorName: string
    bodyText: string
    createdAt: string
    id: string
  }>
  completedAt: string | null
  createdAt: string
  customFieldValues: Record<string, unknown>
  dueAt: string | null
  effort: number | null
  groupId: string | null
  groupPosition: number
  id: string
  initiativeId: string | null
  priorityOptionId: string | null
  projectCardNumber: number
  projectId: string
  projectKey: string
  sprintId: string | null
  startAt: string | null
  statusOptionId: string | null
  statusPosition: number
  tags: string[]
  title: string
}

type CardActivityRow = {
  actor_id: string | null
  actor_name: string
  card_id: string
  created_at: string
  event_action: string
  event_type: string
  id: string
  metadata: JsonObject
  title: string
}

type SearchSnapshot = {
  cards?: SearchCardHit[]
  documents?: SearchDocumentHit[]
}

type SearchCardHit = {
  cardId: string
  cardRef?: string
  priorityOptionId: string | null
  projectCardNumber?: number
  projectId?: string
  projectKey?: string
  projectName?: string
  projectSlug?: string
  rank: number
  snippet: string
  statusOptionId: string | null
  title: string
  workspaceId?: string
  workspaceName?: string
  workspaceSlug?: string
}

type SearchDocumentHit = {
  documentId: string
  projectId?: string
  projectKey?: string
  projectName?: string
  projectSlug?: string
  projectViewId: string
  rank: number
  snippet: string
  source: 'comment' | 'document'
  title: string
  workspaceId?: string
  workspaceName?: string
  workspaceSlug?: string
}

type DocumentSnapshot = {
  attachments: Array<{
    contentType: string | null
    createdAt: string
    fileName: string
    id: string
    sizeBytes: number
    storagePath: string
    uploadedByName: string
  }>
  comments: Array<{
    authorName: string
    bodyText: string
    createdAt: string
    id: string
  }>
  document: {
    contentJson: JsonObject | null
    contentMd: string
    id: string
    projectId: string
    projectKey?: string
    projectName?: string
    projectSlug?: string
    projectViewId?: string
    title: string
    updatedAt: string
    updatedByName: string
    version: number
  }
  versions: Array<{
    authorName: string
    createdAt: string
    id: string
    title: string
    version: number
  }>
}

type ActivityEventRow = {
  card_id: string | null
  created_at: string
  event_action: string
  metadata: JsonObject
}

export type ProjectContext = {
  canManageProject: boolean
  currentUser: {
    email: string | null
    id: string
    name: string
  }
  customFields: Array<{
    fieldType: CustomFieldPayload['fieldType']
    id: string
    key: string
    name: string
    options: Array<{
      color: string | null
      id: string
      label: string
    }>
  }>
  defaultPriorityId: string | null
  defaultStatusId: string | null
  groups: Array<{
    id: string
    label: string
    position: number
  }>
  members: Array<{
    email: string
    id: string
    name: string
    role: 'admin' | 'member'
  }>
  priorities: Array<{
    color: string | null
    id: string
    isDefault: boolean
    key: string
    label: string
    sortOrder: number
  }>
  project: {
    access: 'open' | 'private'
    defaultProjectViewId: string | null
    icon: string
    id: string
    key: string
    memberCount: number
    name: string
    projectViews: ShellSummaryRow['project_views']
    slug: string
    taskCount: number
    updatedAt: string
  }
  sprints: Array<{
    completedAt: string | null
    endDate: string | null
    goal: string | null
    id: string
    name: string
    position: number
    startDate: string | null
    status: 'active' | 'completed' | 'planned'
  }>
  statuses: Array<{
    category: StatusOptionRow['category']
    color: string | null
    id: string
    isDefault: boolean
    key: string
    label: string
    position: number
  }>
  workspace: {
    colorToken: string
    id: string
    name: string
    organizationId: string
    organizationName: string
    slug: string
  }
}

type ResolveProjectOptions = {
  project: string
  workspace?: string | null
}

type ResolveCardOptions = {
  card: string
  project?: string | null
  workspace?: string | null
  writeMode: boolean
}

type ResolveDocumentOptions = {
  document?: string | null
  project?: string | null
  projectViewId?: string | null
  title?: string | null
  workspace?: string | null
}

type CreateCardInput = {
  assignee?: string | null
  bodyJson?: unknown | null
  bodyText?: string
  customFields?: Record<string, unknown> | null
  dueAt?: string | null
  effort?: number | null
  group?: string | null
  priority?: string | null
  project: string
  sprint?: string | null
  startAt?: string | null
  status?: string | null
  tags?: string[]
  title: string
  workspace?: string | null
}

type UpdateCardInput = {
  assignee?: string | null
  bodyJson?: unknown | null
  bodyText?: string
  card: string
  customFields?: Record<string, unknown> | null
  dueAt?: string | null
  effort?: number | null
  group?: string | null
  priority?: string | null
  project?: string | null
  sprint?: string | null
  startAt?: string | null
  status?: string | null
  tags?: string[]
  title?: string
  workspace?: string | null
}

type ListCardsInput = {
  assignee?: string | null
  group?: string | null
  limit?: number
  project: string
  query?: string | null
  sprint?: string | null
  status?: string | null
  workspace?: string | null
}

type SearchInput = {
  project?: string | null
  query: string
  workspace?: string | null
}

type SprintSummaryInput = {
  project: string
  sprint?: string | null
  workspace?: string | null
}

export class RocketboardService {
  private readonly projectContextCache = new Map<string, ProjectContext>()
  private shellSummaryCache: {rows: ShellSummaryRow[]; expiry: number} | null = null

  constructor(
    private readonly client: SupabaseClient,
    private readonly user: User,
    readonly writesEnabled: boolean,
  ) {}

  async listWorkspaces() {
    const rows = await this.loadShellSummaryRows()
    const workspaces = new Map<string, {
      colorToken: string
      id: string
      name: string
      organizationId: string
      organizationName: string
      projects: Array<{
        access: 'open' | 'private'
        icon: string
        id: string
        key: string
        memberCount: number
        name: string
        slug: string
        taskCount: number
        updatedAt: string
      }>
      slug: string
    }>()

    for (const row of rows) {
      const workspace = workspaces.get(row.workspace_id)
      const project = {
        access: (row.project_access === 'private' ? 'private' : 'open') as 'open' | 'private',
        icon: row.project_icon ?? '📁',
        id: row.project_id,
        key: row.project_key,
        memberCount: Number(row.member_count ?? 0),
        name: row.project_name,
        slug: row.project_slug,
        taskCount: Number(row.task_count ?? 0),
        updatedAt: row.project_updated_at,
      }

      if (workspace) {
        workspace.projects.push(project)
        continue
      }

      workspaces.set(row.workspace_id, {
        colorToken: row.workspace_color_token ?? 'slate',
        id: row.workspace_id,
        name: row.workspace_name,
        organizationId: row.workspace_organization_id,
        organizationName: row.workspace_organization_name ?? '',
        projects: [project],
        slug: row.workspace_slug,
      })
    }

    return {
      currentUser: this.getCurrentUserSummary(),
      workspaces: Array.from(workspaces.values()).map(workspace => ({
        ...workspace,
        projects: workspace.projects.sort((left, right) => left.name.localeCompare(right.name)),
      })),
    }
  }

  async getProjectContext(input: ResolveProjectOptions) {
    return this.loadProjectContext(input)
  }

  async listCards(input: ListCardsInput) {
    const context = await this.loadProjectContext({project: input.project, workspace: input.workspace})
    const cards = await this.loadProjectCards(context.project.id)
    const query = normalizeMatch(input.query ?? '')
    const status = input.status ? this.resolveStatus(context, input.status).id : null
    const sprint = input.sprint ? this.resolveSprint(context, input.sprint).id : null
    const group = input.group ? this.resolveGroup(context, input.group).id : null
    const assignee = input.assignee ? this.resolveAssignee(context, input.assignee) : null

    const filteredCards = cards.filter(card => {
      if (status && card.status_option_id !== status) {
        return false
      }
      if (sprint && card.sprint_id !== sprint) {
        return false
      }
      if (group && card.group_id !== group) {
        return false
      }
      if (assignee && card.assignee_user_id !== assignee.id) {
        return false
      }
      if (query && !matchesCardQuery(card, query)) {
        return false
      }
      return true
    })

    return {
      cards: (
        typeof input.limit === 'number'
          ? filteredCards.slice(0, normalizeLimit(input.limit, 200))
          : filteredCards
      ).map(card => this.mapCardRowToOutput(card, context)),
      project: context.project,
    }
  }

  async getCard(input: ResolveCardOptions) {
    const resolved = await this.resolveCard(input)
    return {
      card: await this.buildCardDetailOutput(resolved.cardId, resolved.projectContext),
    }
  }

  async createCard(input: CreateCardInput) {
    this.assertWritesEnabled()

    const context = await this.loadProjectContext({project: input.project, workspace: input.workspace})
    const priority = input.priority ? this.resolvePriority(context, input.priority).id : context.defaultPriorityId
    const status = input.status ? this.resolveStatus(context, input.status).id : context.defaultStatusId
    const group = input.group ? this.resolveGroup(context, input.group).id : null
    const sprint = input.sprint ? this.resolveSprint(context, input.sprint).id : null

    const createdCardRows = await this.rpc<CardRow[]>('create_card', {
      target_body_json: input.bodyJson ?? null,
      target_body_text: input.bodyText ?? '',
      target_due_at: input.dueAt ?? null,
      target_effort: input.effort ?? null,
      target_group_id: group,
      target_priority_option_id: priority,
      target_project_id: context.project.id,
      target_sprint_id: sprint,
      target_start_at: input.startAt ?? null,
      target_status_option_id: status,
      target_tags: input.tags ?? [],
      target_title: input.title,
    })

    const createdCard = createdCardRows[0]
    if (!createdCard) {
      throw new Error('Rocketboard did not return the created card.')
    }

    if (typeof input.assignee !== 'undefined') {
      const assignee = input.assignee === null ? null : this.resolveAssignee(context, input.assignee)
      await this.rpc('set_card_assignee', {
        target_assignee_user_id: assignee?.id ?? null,
        target_card_id: createdCard.card_id,
      })
    }

    if (input.customFields) {
      await this.applyCustomFieldUpdates(createdCard.card_id, context, input.customFields)
    }

    this.invalidateProject(context.project.id)

    return {
      card: await this.buildCardDetailOutput(createdCard.card_id, await this.loadProjectContext({project: context.project.id})),
    }
  }

  async updateCard(input: UpdateCardInput) {
    this.assertWritesEnabled()

    const resolved = await this.resolveCard({
      card: input.card,
      project: input.project,
      workspace: input.workspace,
      writeMode: true,
    })

    const context = resolved.projectContext
    const currentCard = await this.loadCardDetail(resolved.cardId)

    const targetStatus = typeof input.status === 'undefined' ? currentCard.statusOptionId : input.status === null ? null : this.resolveStatus(context, input.status).id
    const targetPriority =
      typeof input.priority === 'undefined'
        ? currentCard.priorityOptionId
        : input.priority === null
          ? null
          : this.resolvePriority(context, input.priority).id

    const shouldCallUpdateCard =
      typeof input.title !== 'undefined' ||
      typeof input.bodyText !== 'undefined' ||
      typeof input.bodyJson !== 'undefined' ||
      typeof input.status !== 'undefined' ||
      typeof input.priority !== 'undefined' ||
      typeof input.startAt !== 'undefined' ||
      typeof input.dueAt !== 'undefined' ||
      typeof input.effort !== 'undefined' ||
      typeof input.tags !== 'undefined'

    if (shouldCallUpdateCard) {
      await this.rpc('update_card', {
        target_body_json: typeof input.bodyJson === 'undefined' ? currentCard.bodyJson : input.bodyJson,
        target_body_text: typeof input.bodyText === 'undefined' ? currentCard.bodyText : input.bodyText ?? '',
        target_card_id: resolved.cardId,
        target_due_at: typeof input.dueAt === 'undefined' ? currentCard.dueAt : input.dueAt,
        target_effort: typeof input.effort === 'undefined' ? currentCard.effort : input.effort,
        target_priority_option_id: targetPriority,
        target_start_at: typeof input.startAt === 'undefined' ? currentCard.startAt : input.startAt,
        target_status_option_id: targetStatus,
        target_tags: typeof input.tags === 'undefined' ? currentCard.tags : input.tags ?? [],
        target_title: typeof input.title === 'undefined' ? currentCard.title : input.title,
      })
    }

    if (typeof input.assignee !== 'undefined') {
      const assignee = input.assignee === null ? null : this.resolveAssignee(context, input.assignee)
      await this.rpc('set_card_assignee', {
        target_assignee_user_id: assignee?.id ?? null,
        target_card_id: resolved.cardId,
      })
    }

    if (typeof input.sprint !== 'undefined') {
      const sprint = input.sprint === null ? null : this.resolveSprint(context, input.sprint)
      await this.rpc('set_card_sprint', {
        target_card_id: resolved.cardId,
        target_sprint_id: sprint?.id ?? null,
      })
    }

    if (typeof input.group !== 'undefined') {
      const group = input.group === null ? null : this.resolveGroup(context, input.group)
      await this.rpc('move_card_to_group', {
        target_card_id: resolved.cardId,
        target_group_id: group?.id ?? null,
        target_position: null,
      })
    }

    if (input.customFields) {
      await this.applyCustomFieldUpdates(resolved.cardId, context, input.customFields)
    }

    this.invalidateProject(context.project.id)

    return {
      card: await this.buildCardDetailOutput(resolved.cardId, await this.loadProjectContext({project: context.project.id})),
    }
  }

  async addCardComment(input: {bodyText: string; card: string; project?: string | null; workspace?: string | null}) {
    this.assertWritesEnabled()

    const resolved = await this.resolveCard({
      card: input.card,
      project: input.project,
      workspace: input.workspace,
      writeMode: true,
    })

    const rows = await this.rpc<Array<{author_name: string; body_text: string; created_at: string; id: string}>>('add_card_comment', {
      target_body_text: input.bodyText,
      target_card_id: resolved.cardId,
    })
    const comment = rows[0]
    if (!comment) {
      throw new Error('Rocketboard did not return the created card comment.')
    }

    return {
      cardId: resolved.cardId,
      cardRef: resolved.cardRow.card_ref,
      comment: {
        authorName: comment.author_name,
        bodyText: comment.body_text,
        createdAt: comment.created_at,
        id: comment.id,
      },
    }
  }

  async trashCard(input: {card: string; project?: string | null; workspace?: string | null}) {
    this.assertWritesEnabled()

    const resolved = await this.resolveCard({
      card: input.card,
      project: input.project,
      workspace: input.workspace,
      writeMode: true,
    })

    await this.rpc('trash_cards', {
      target_card_ids: [resolved.cardId],
    })

    this.invalidateProject(resolved.projectContext.project.id)

    return {
      trashedCard: {
        cardId: resolved.cardId,
        cardRef: resolved.cardRow.card_ref,
        projectId: resolved.projectContext.project.id,
        title: resolved.cardRow.title,
      },
    }
  }

  async search(input: SearchInput) {
    const query = input.query.trim()
    if (!query) {
      throw new Error('Search query is required.')
    }

    if (input.project) {
      const project = await this.resolveProject({project: input.project, workspace: input.workspace})
      const payload = await this.rpc<SearchSnapshot>('search_project_content', {
        target_project_id: project.project_id,
        target_query: query,
      })
      return {
        cards: (payload.cards ?? []).map(card => this.mapSearchCardHit(card)),
        documents: (payload.documents ?? []).map(document => this.mapSearchDocumentHit(document)),
        scope: {projectId: project.project_id, projectKey: project.project_key, projectName: project.project_name},
      }
    }

    if (input.workspace) {
      const workspace = await this.resolveWorkspace(input.workspace)
      const payload = await this.rpc<SearchSnapshot>('search_workspace_content', {
        target_query: query,
        target_workspace_id: workspace.id,
      })
      return {
        cards: (payload.cards ?? []).map(card => this.mapSearchCardHit(card)),
        documents: (payload.documents ?? []).map(document => this.mapSearchDocumentHit(document)),
        scope: {workspaceId: workspace.id, workspaceName: workspace.name},
      }
    }

    const payload = await this.rpc<SearchSnapshot>('search_accessible_content', {
      target_query: query,
    })
    return {
      cards: (payload.cards ?? []).map(card => this.mapSearchCardHit(card)),
      documents: (payload.documents ?? []).map(document => this.mapSearchDocumentHit(document)),
      scope: {kind: 'accessible'},
    }
  }

  async getDocument(input: ResolveDocumentOptions) {
    const resolvedDocument = await this.resolveDocument(input)
    const snapshot = await this.rpc<DocumentSnapshot>('get_project_document_snapshot', {
      target_project_view_id: resolvedDocument.projectViewId,
    })

    if (!snapshot) {
      throw new Error('Document snapshot not found.')
    }

    return {
      document: snapshot,
    }
  }

  async getSprintSummary(input: SprintSummaryInput) {
    const context = await this.loadProjectContext({project: input.project, workspace: input.workspace})
    const sprint = input.sprint ? this.resolveSprint(context, input.sprint) : pickDefaultSprint(context)

    if (!sprint) {
      throw new Error('No sprint could be resolved for this project.')
    }

    const cards = (await this.loadProjectCards(context.project.id)).filter(card => card.sprint_id === sprint.id)
    const statusById = new Map(context.statuses.map(status => [status.id, status]))
    const completedStatusIds = new Set(context.statuses.filter(status => status.category === 'completed').map(status => status.id))

    const countsByStatus = context.statuses.map(status => ({
      category: status.category,
      count: cards.filter(card => card.status_option_id === status.id).length,
      label: status.label,
      statusId: status.id,
    }))

    const totalEffort = cards.reduce((sum, card) => sum + (card.effort ?? 0), 0)
    const statusEvents = await this.loadLatestStatusChangeEvents(context.project.id, cards.map(card => card.card_id))

    const sprintMidpoint = computeSprintMidpoint(sprint.startDate, sprint.endDate)
    const today = startOfDay(new Date())
    const atRisk = cards.flatMap(card => {
      const status = card.status_option_id ? statusById.get(card.status_option_id) ?? null : null
      const isCompleted = Boolean(status && completedStatusIds.has(status.id))
      if (isCompleted) {
        return []
      }

      const reasons: string[] = []
      const dueDate = card.due_at ? startOfDay(new Date(card.due_at)) : null
      if (dueDate && dueDate.getTime() < today.getTime()) {
        reasons.push('Overdue and not completed.')
      } else if (dueDate && daysBetween(today, dueDate) <= 2) {
        reasons.push('Due within 2 days and not completed.')
      }

      const staleStatusBaseline = statusEvents.get(card.card_id) ?? card.created_at
      if (daysBetween(startOfDay(new Date(staleStatusBaseline)), today) >= 5) {
        reasons.push('No status change for 5+ days while still incomplete.')
      }

      if (!card.assignee_user_id && sprintMidpoint && today.getTime() >= sprintMidpoint.getTime()) {
        reasons.push('Unassigned after the sprint midpoint.')
      }

      if (reasons.length === 0) {
        return []
      }

      return [
        {
          assigneeName: card.assignee_user_id ? card.assignee_name : null,
          cardId: card.card_id,
          cardRef: card.card_ref,
          dueAt: card.due_at,
          reasons,
          statusCategory: status?.category ?? null,
          statusLabel: status?.label ?? null,
          title: card.title,
        },
      ]
    })

    return {
      atRisk,
      countsByStatus,
      project: {
        id: context.project.id,
        key: context.project.key,
        name: context.project.name,
      },
      sprint,
      totalCards: cards.length,
      totalEffort,
    }
  }

  private async buildCardDetailOutput(cardId: string, projectContext: ProjectContext) {
    const [detail, activity] = await Promise.all([
      this.loadCardDetail(cardId),
      this.rpc<CardActivityRow[]>('get_card_activity', {
        target_card_id: cardId,
      }),
    ])
    const status = detail.statusOptionId ? projectContext.statuses.find(option => option.id === detail.statusOptionId) ?? null : null
    const priority = detail.priorityOptionId ? projectContext.priorities.find(option => option.id === detail.priorityOptionId) ?? null : null
    const sprint = detail.sprintId ? projectContext.sprints.find(option => option.id === detail.sprintId) ?? null : null
    const group = detail.groupId ? projectContext.groups.find(option => option.id === detail.groupId) ?? null : null

    return {
      assignee: detail.assigneeUserId
        ? {
            id: detail.assigneeUserId,
            name: detail.assigneeName,
          }
        : null,
      attachments: detail.attachments,
      bodyJson: detail.bodyJson,
      bodyText: detail.bodyText,
      cardId: detail.id,
      cardRef: detail.cardRef,
      comments: detail.comments,
      completedAt: detail.completedAt,
      createdAt: detail.createdAt,
      customFieldValues: detail.customFieldValues ?? {},
      dueAt: detail.dueAt,
      effort: detail.effort,
      group: group
        ? {
            id: group.id,
            label: group.label,
          }
        : null,
      initiativeId: detail.initiativeId,
      priority: priority
        ? {
            color: priority.color,
            id: priority.id,
            key: priority.key,
            label: priority.label,
          }
        : null,
      project: {
        id: detail.projectId,
        key: detail.projectKey,
        projectCardNumber: detail.projectCardNumber,
      },
      recentActivity: activity.map(event => ({
        actorId: event.actor_id,
        actorName: event.actor_name,
        createdAt: event.created_at,
        eventAction: event.event_action,
        eventType: event.event_type,
        id: event.id,
        metadata: event.metadata ?? {},
        title: event.title,
      })),
      sprint: sprint
        ? {
            id: sprint.id,
            name: sprint.name,
            status: sprint.status,
          }
        : null,
      startAt: detail.startAt,
      status: status
        ? {
            category: status.category,
            id: status.id,
            key: status.key,
            label: status.label,
          }
        : null,
      tags: detail.tags,
      title: detail.title,
    }
  }

  private async loadShellSummaryRows() {
    const now = Date.now()
    if (this.shellSummaryCache && now < this.shellSummaryCache.expiry) {
      return this.shellSummaryCache.rows
    }
    const rows = await this.rpc<ShellSummaryRow[]>('get_shell_summary_rows_v2')
    this.shellSummaryCache = {rows, expiry: now + 30_000}
    return rows
  }

  private async loadProjectCards(projectId: string) {
    return this.rpc<CardRow[]>('get_project_card_rows', {target_project_id: projectId})
  }

  private async loadProjectContext(input: ResolveProjectOptions): Promise<ProjectContext> {
    const project = await this.resolveProject(input)
    const cacheKey = `${project.project_id}:${project.project_updated_at}`
    const cachedContext = this.projectContextCache.get(cacheKey)
    if (cachedContext) {
      return cachedContext
    }

    const [statuses, priorities, groups, sprints, customFields, shareSnapshot] = await Promise.all([
      this.rpc<StatusOptionRow[]>('get_project_status_options', {target_project_id: project.project_id}),
      this.rpc<PriorityOptionRow[]>('get_project_priority_options', {target_project_id: project.project_id}),
      this.rpc<ProjectGroupRow[]>('get_project_groups', {target_project_id: project.project_id}),
      this.rpc<ProjectSprintRow[]>('get_project_sprints', {target_project_id: project.project_id}).catch(() => [] as ProjectSprintRow[]),
      this.rpc<CustomFieldPayload[]>('get_project_custom_fields', {target_project_id: project.project_id}),
      this.rpc<ProjectShareSnapshot>('get_project_share_snapshot', {target_project_id: project.project_id}),
    ])

    const context: ProjectContext = {
      canManageProject: shareSnapshot.canManageProject === true,
      currentUser: this.getCurrentUserSummary(),
      customFields: (customFields ?? []).map(field => ({
        fieldType: field.fieldType,
        id: field.id,
        key: field.key,
        name: field.name,
        options: (field.options ?? []).map(option => ({
          color: option.color ?? null,
          id: option.id,
          label: option.label,
        })),
      })),
      defaultPriorityId: priorities.find(option => option.is_default)?.id ?? null,
      defaultStatusId: statuses.find(option => option.is_default)?.id ?? null,
      groups: groups.map(group => ({
        id: group.group_id,
        label: group.label,
        position: group.position,
      })),
      members: (shareSnapshot.members ?? []).map(member => ({
        email: member.email,
        id: member.id,
        name: member.name,
        role: member.role,
      })),
      priorities: priorities.map(priority => ({
        color: priority.color,
        id: priority.id,
        isDefault: priority.is_default,
        key: priority.key,
        label: priority.label,
        sortOrder: priority.sort_order,
      })),
      project: {
        access: project.project_access === 'private' ? 'private' : 'open',
        defaultProjectViewId: project.default_project_view_id,
        icon: project.project_icon ?? '📁',
        id: project.project_id,
        key: project.project_key,
        memberCount: Number(project.member_count ?? 0),
        name: project.project_name,
        projectViews: project.project_views,
        slug: project.project_slug,
        taskCount: Number(project.task_count ?? 0),
        updatedAt: project.project_updated_at,
      },
      sprints: sprints.map(sprint => ({
        completedAt: sprint.completed_at,
        endDate: sprint.end_date,
        goal: sprint.goal,
        id: sprint.id,
        name: sprint.name,
        position: sprint.position,
        startDate: sprint.start_date,
        status: sprint.status,
      })),
      statuses: statuses.map(status => ({
        category: status.category,
        color: status.color,
        id: status.id,
        isDefault: status.is_default,
        key: status.key,
        label: status.label,
        position: status.position,
      })),
      workspace: {
        colorToken: project.workspace_color_token ?? 'slate',
        id: project.workspace_id,
        name: project.workspace_name,
        organizationId: project.workspace_organization_id,
        organizationName: project.workspace_organization_name ?? '',
        slug: project.workspace_slug,
      },
    }

    this.projectContextCache.set(cacheKey, context)
    return context
  }

  private async resolveProject(input: ResolveProjectOptions) {
    const rows = await this.loadShellSummaryRows()
    const workspaceScope = input.workspace ? this.resolveWorkspaceFromRows(rows, input.workspace) : null
    const scopedRows = workspaceScope ? rows.filter(row => row.workspace_id === workspaceScope.id) : rows

    return resolveUniqueMatch(
      scopedRows,
      input.project,
      row => [
        row.project_id,
        row.project_key,
        row.project_slug,
        row.project_name,
        `${row.workspace_slug}/${row.project_slug}`,
      ],
      row => `${row.project_key} (${row.workspace_name}/${row.project_name})`,
      'project',
    )
  }

  private async resolveWorkspace(workspace: string) {
    const rows = await this.loadShellSummaryRows()
    return this.resolveWorkspaceFromRows(rows, workspace)
  }

  private resolveWorkspaceFromRows(rows: ShellSummaryRow[], workspace: string) {
    const candidates = new Map<string, {id: string; name: string; slug: string}>()
    for (const row of rows) {
      candidates.set(row.workspace_id, {
        id: row.workspace_id,
        name: row.workspace_name,
        slug: row.workspace_slug,
      })
    }

    return resolveUniqueMatch(
      Array.from(candidates.values()),
      workspace,
      item => [item.id, item.slug, item.name],
      item => `${item.name} (${item.slug})`,
      'workspace',
    )
  }

  private async resolveCard(input: ResolveCardOptions) {
    const identifier = input.card.trim()
    if (!identifier) {
      throw new Error('Card identifier is required.')
    }

    const projectContext = input.project ? await this.loadProjectContext({project: input.project, workspace: input.workspace}) : null

    if (looksLikeUuid(identifier)) {
      const detail = await this.loadCardDetail(identifier)
      const detailContext = projectContext ?? (await this.loadProjectContext({project: detail.projectId}))
      if (projectContext && detail.projectId !== projectContext.project.id) {
        throw new Error(`Card ${identifier} does not belong to project ${projectContext.project.key}.`)
      }
      const cardRow = await this.loadCardRowById(detailContext.project.id, identifier)
      return {cardId: identifier, cardRow, projectContext: detailContext}
    }

    const refMatch = identifier.toUpperCase().match(/^([A-Z][A-Z0-9]{1,7})-(\d+)$/)
    if (refMatch) {
      const project = await this.resolveProject({project: refMatch[1], workspace: input.workspace})
      const context = projectContext ?? (await this.loadProjectContext({project: project.project_id}))
      const cardRows = await this.loadProjectCards(project.project_id)
      const card = cardRows.find(row => row.project_card_number === Number(refMatch[2]))
      if (!card) {
        throw new Error(`Card ${identifier.toUpperCase()} was not found.`)
      }
      return {cardId: card.card_id, cardRow: card, projectContext: context}
    }

    if (!projectContext) {
      throw new Error('Resolving a card by title requires a project scope. Pass `project` or use a card UUID/cardRef.')
    }

    const cards = await this.loadProjectCards(projectContext.project.id)
    const exactMatch = resolveUniqueCandidate(
      cards.filter(card => normalizeMatch(card.title) === normalizeMatch(identifier)),
      card => `${card.card_ref}: ${card.title}`,
      'card',
      identifier,
      input.writeMode,
    )
    if (exactMatch) {
      return {cardId: exactMatch.card_id, cardRow: exactMatch, projectContext}
    }

    const fuzzyMatches = cards.filter(card => matchesCardQuery(card, normalizeMatch(identifier)))
    const fuzzyMatch = resolveUniqueCandidate(
      fuzzyMatches,
      card => `${card.card_ref}: ${card.title}`,
      'card',
      identifier,
      input.writeMode,
    )
    if (!fuzzyMatch) {
      throw new Error(`Card "${identifier}" was not found in project ${projectContext.project.key}.`)
    }

    return {cardId: fuzzyMatch.card_id, cardRow: fuzzyMatch, projectContext}
  }

  private async resolveDocument(input: ResolveDocumentOptions) {
    if (input.projectViewId) {
      const query = this.client
        .from('documents')
        .select('id,title,project_id,project_view_id')
        .eq('project_view_id', input.projectViewId)
        .maybeSingle()
      const {data, error} = await query
      if (error) {
        throw new Error(error.message)
      }
      if (!data) {
        throw new Error(`Document view ${input.projectViewId} was not found.`)
      }

      if (input.project) {
        const project = await this.resolveProject({project: input.project, workspace: input.workspace})
        if (data.project_id !== project.project_id) {
          throw new Error(`Document view ${input.projectViewId} does not belong to project ${project.project_key}.`)
        }
      }

      return {
        documentId: data.id,
        projectId: data.project_id,
        projectViewId: data.project_view_id,
        title: data.title,
      }
    }

    if (input.document && looksLikeUuid(input.document)) {
      const query = this.client
        .from('documents')
        .select('id,title,project_id,project_view_id')
        .eq('id', input.document)
        .maybeSingle()
      const {data, error} = await query
      if (error) {
        throw new Error(error.message)
      }
      if (!data) {
        throw new Error(`Document ${input.document} was not found.`)
      }

      if (input.project) {
        const project = await this.resolveProject({project: input.project, workspace: input.workspace})
        if (data.project_id !== project.project_id) {
          throw new Error(`Document ${input.document} does not belong to project ${project.project_key}.`)
        }
      }

      return {
        documentId: data.id,
        projectId: data.project_id,
        projectViewId: data.project_view_id,
        title: data.title,
      }
    }

    const title = (input.title ?? input.document ?? '').trim()
    if (!title) {
      throw new Error('Document identifier or title is required.')
    }

    const projectIds = await this.resolveDocumentScopeProjectIds(input.project, input.workspace)
    const query = this.client
      .from('documents')
      .select('id,title,project_id,project_view_id')
      .in('project_id', projectIds)
      .order('updated_at', {ascending: false})
    const {data, error} = await query
    if (error) {
      throw new Error(error.message)
    }

    const exactMatches = (data ?? []).filter(document => normalizeMatch(document.title) === normalizeMatch(title))
    const exactMatch = resolveUniqueCandidate(
      exactMatches,
      document => `${document.title} (${document.id})`,
      'document',
      title,
    )
    if (exactMatch) {
      return {
        documentId: exactMatch.id,
        projectId: exactMatch.project_id,
        projectViewId: exactMatch.project_view_id,
        title: exactMatch.title,
      }
    }

    const fuzzyMatches = (data ?? []).filter(document => normalizeMatch(document.title).includes(normalizeMatch(title)))
    const fuzzyMatch = resolveUniqueCandidate(
      fuzzyMatches,
      document => `${document.title} (${document.id})`,
      'document',
      title,
      false,
    )
    if (!fuzzyMatch) {
      throw new Error(`Document "${title}" was not found.`)
    }

    return {
      documentId: fuzzyMatch.id,
      projectId: fuzzyMatch.project_id,
      projectViewId: fuzzyMatch.project_view_id,
      title: fuzzyMatch.title,
    }
  }

  private async resolveDocumentScopeProjectIds(project?: string | null, workspace?: string | null) {
    if (project) {
      return [(await this.resolveProject({project, workspace})).project_id]
    }

    const rows = await this.loadShellSummaryRows()
    if (workspace) {
      const resolvedWorkspace = this.resolveWorkspaceFromRows(rows, workspace)
      return rows.filter(row => row.workspace_id === resolvedWorkspace.id).map(row => row.project_id)
    }

    return rows.map(row => row.project_id)
  }

  private async loadCardDetail(cardId: string) {
    const payload = await this.rpc<CardDetailPayload | null>('get_card_detail', {
      target_card_id: cardId,
    })
    if (!payload) {
      throw new Error(`Card ${cardId} was not found.`)
    }
    return payload
  }

  private async loadCardRowById(projectId: string, cardId: string) {
    const rows = await this.loadProjectCards(projectId)
    const row = rows.find(card => card.card_id === cardId)
    if (!row) {
      throw new Error(`Card ${cardId} was not found in project ${projectId}.`)
    }
    return row
  }

  private async loadLatestStatusChangeEvents(projectId: string, cardIds: string[]) {
    if (cardIds.length === 0) {
      return new Map<string, string>()
    }

    const {data, error} = await this.client
      .from('activity_events')
      .select('card_id, created_at, event_action, metadata')
      .eq('project_id', projectId)
      .in('card_id', cardIds)
      .order('created_at', {ascending: false})

    if (error) {
      throw new Error(error.message)
    }

    const result = new Map<string, string>()
    for (const event of (data ?? []) as ActivityEventRow[]) {
      if (!event.card_id || result.has(event.card_id)) {
        continue
      }

      if (event.metadata?.field === 'status_option_id') {
        result.set(event.card_id, event.created_at)
      }
    }

    return result
  }

  private async applyCustomFieldUpdates(cardId: string, context: ProjectContext, updates: Record<string, unknown>) {
    const rpcCalls = Object.entries(updates).map(([fieldReference, rawValue]) => {
      const field = this.resolveCustomField(context, fieldReference)

      const params: {
        target_card_id: string
        target_date_value: string | null
        target_field_definition_id: string
        target_field_option_id: string | null
        target_number_value: number | null
        target_text_value: string | null
      } = {
        target_card_id: cardId,
        target_date_value: null,
        target_field_definition_id: field.id,
        target_field_option_id: null,
        target_number_value: null,
        target_text_value: null,
      }

      if (rawValue === null) {
        return this.rpc('set_card_field_value', params)
      }

      switch (field.fieldType) {
        case 'text': {
          if (typeof rawValue !== 'string') {
            throw new Error(`Custom field ${field.name} expects a text value.`)
          }
          params.target_text_value = rawValue
          break
        }
        case 'number': {
          if (typeof rawValue !== 'number') {
            throw new Error(`Custom field ${field.name} expects a numeric value.`)
          }
          params.target_number_value = rawValue
          break
        }
        case 'date': {
          if (typeof rawValue !== 'string') {
            throw new Error(`Custom field ${field.name} expects an ISO date string.`)
          }
          params.target_date_value = rawValue
          break
        }
        case 'single_select': {
          if (typeof rawValue !== 'string') {
            throw new Error(`Custom field ${field.name} expects a select option label or id.`)
          }
          const option = resolveUniqueMatch(
            field.options,
            rawValue,
            item => [item.id, item.label],
            item => item.label,
            `custom field option for ${field.name}`,
          )
          params.target_field_option_id = option.id
          break
        }
      }

      return this.rpc('set_card_field_value', params)
    })

    await Promise.all(rpcCalls)
  }

  private mapCardRowToOutput(card: CardRow, context: ProjectContext) {
    const status = card.status_option_id ? context.statuses.find(option => option.id === card.status_option_id) ?? null : null
    const priority = card.priority_option_id ? context.priorities.find(option => option.id === card.priority_option_id) ?? null : null
    const sprint = card.sprint_id ? context.sprints.find(option => option.id === card.sprint_id) ?? null : null
    const group = card.group_id ? context.groups.find(option => option.id === card.group_id) ?? null : null

    return {
      assignee: card.assignee_user_id
        ? {
            id: card.assignee_user_id,
            name: card.assignee_name,
          }
        : null,
      cardId: card.card_id,
      cardRef: card.card_ref,
      completedAt: card.completed_at,
      createdAt: card.created_at,
      customFieldValues: card.custom_field_values ?? {},
      dueAt: card.due_at,
      effort: card.effort,
      group: group
        ? {
            id: group.id,
            label: group.label,
          }
        : null,
      initiativeId: card.initiative_id,
      priority: priority
        ? {
            color: priority.color,
            id: priority.id,
            key: priority.key,
            label: priority.label,
          }
        : null,
      projectCardNumber: card.project_card_number,
      projectId: context.project.id,
      projectKey: context.project.key,
      sprint: sprint
        ? {
            id: sprint.id,
            name: sprint.name,
            status: sprint.status,
          }
        : null,
      startAt: card.start_at,
      status: status
        ? {
            category: status.category,
            id: status.id,
            key: status.key,
            label: status.label,
          }
        : null,
      tags: card.tags ?? [],
      title: card.title,
    }
  }

  private mapSearchCardHit(card: SearchCardHit) {
    return {
      cardId: card.cardId,
      cardRef: card.cardRef ?? null,
      priorityOptionId: card.priorityOptionId,
      projectCardNumber: card.projectCardNumber ?? null,
      projectId: card.projectId ?? null,
      projectKey: card.projectKey ?? null,
      projectName: card.projectName ?? null,
      projectSlug: card.projectSlug ?? null,
      rank: card.rank,
      snippet: card.snippet,
      statusOptionId: card.statusOptionId,
      title: card.title,
      workspaceId: card.workspaceId ?? null,
      workspaceName: card.workspaceName ?? null,
      workspaceSlug: card.workspaceSlug ?? null,
    }
  }

  private mapSearchDocumentHit(document: SearchDocumentHit) {
    return {
      documentId: document.documentId,
      projectId: document.projectId ?? null,
      projectKey: document.projectKey ?? null,
      projectName: document.projectName ?? null,
      projectSlug: document.projectSlug ?? null,
      projectViewId: document.projectViewId,
      rank: document.rank,
      snippet: document.snippet,
      source: document.source,
      title: document.title,
      workspaceId: document.workspaceId ?? null,
      workspaceName: document.workspaceName ?? null,
      workspaceSlug: document.workspaceSlug ?? null,
    }
  }

  private resolveStatus(context: ProjectContext, value: string) {
    return resolveUniqueMatch(
      context.statuses,
      value,
      option => [option.id, option.key, option.label],
      option => option.label,
      'status',
    )
  }

  private resolvePriority(context: ProjectContext, value: string) {
    return resolveUniqueMatch(
      context.priorities,
      value,
      option => [option.id, option.key, option.label],
      option => option.label,
      'priority',
    )
  }

  private resolveGroup(context: ProjectContext, value: string) {
    return resolveUniqueMatch(
      context.groups,
      value,
      option => [option.id, option.label],
      option => option.label,
      'group',
    )
  }

  private resolveSprint(context: ProjectContext, value: string) {
    if (normalizeMatch(value) === 'active') {
      const activeSprint = context.sprints.find(sprint => sprint.status === 'active')
      if (!activeSprint) {
        throw new Error(`Project ${context.project.key} does not have an active sprint.`)
      }
      return activeSprint
    }

    return resolveUniqueMatch(
      context.sprints,
      value,
      option => [option.id, option.name],
      option => option.name,
      'sprint',
    )
  }

  private resolveAssignee(context: ProjectContext, value: string) {
    if (normalizeMatch(value) === 'me') {
      const currentUser = context.members.find(member => member.id === this.user.id)
      return currentUser ?? {
        email: this.user.email ?? '',
        id: this.user.id,
        name: this.getCurrentUserSummary().name,
        role: 'member' as const,
      }
    }

    return resolveUniqueMatch(
      context.members,
      value,
      member => [member.id, member.email, member.name],
      member => `${member.name} <${member.email}>`,
      'assignee',
    )
  }

  private resolveCustomField(context: ProjectContext, value: string) {
    return resolveUniqueMatch(
      context.customFields,
      value,
      field => [field.id, field.key, field.name],
      field => field.name,
      'custom field',
    )
  }

  private getCurrentUserSummary() {
    return {
      email: this.user.email ?? null,
      id: this.user.id,
      name: formatAuthUserName(this.user),
    }
  }

  private async rpc<T>(fn: KnownRpc, args?: JsonObject): Promise<T> {
    const {data, error} = await this.client.rpc(fn, args)
    if (error) {
      throw new Error(error.message)
    }

    return (data ?? null) as T
  }

  private assertWritesEnabled() {
    if (!this.writesEnabled) {
      throw new Error('Rocketboard MCP write tools are disabled. Set ROCKETBOARD_MCP_ENABLE_WRITES=true before starting the server.')
    }
  }

  private invalidateProject(projectId: string) {
    for (const key of this.projectContextCache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        this.projectContextCache.delete(key)
      }
    }
    this.shellSummaryCache = null
  }
}

export function normalizeMatch(value: string) {
  return value.trim().toLowerCase()
}

export function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export function resolveUniqueMatch<T>(
  values: T[],
  query: string,
  getCandidates: (value: T) => string[],
  getLabel: (value: T) => string,
  entityLabel: string,
) {
  const normalizedQuery = normalizeMatch(query)
  const exactMatches = values.filter(value =>
    getCandidates(value).some(candidate => normalizeMatch(candidate) === normalizedQuery),
  )

  const exact = resolveUniqueCandidate(exactMatches, getLabel, entityLabel, query)
  if (exact) {
    return exact
  }

  const fuzzyMatches = values.filter(value =>
    getCandidates(value).some(candidate => normalizeMatch(candidate).includes(normalizedQuery)),
  )
  const fuzzy = resolveUniqueCandidate(fuzzyMatches, getLabel, entityLabel, query, false)
  if (!fuzzy) {
    throw new Error(`${capitalize(entityLabel)} "${query}" was not found.`)
  }

  return fuzzy
}

export function resolveUniqueCandidate<T>(
  values: T[],
  getLabel: (value: T) => string,
  entityLabel: string,
  query: string,
  writeMode = false,
) {
  if (values.length === 0) {
    return null
  }

  if (values.length > 1) {
    const candidates = values.slice(0, 10).map(getLabel).join(', ')
    const ambiguityPrefix = writeMode ? 'Refusing to mutate on an ambiguous match.' : 'Match was ambiguous.'
    throw new Error(`${ambiguityPrefix} ${capitalize(entityLabel)} "${query}" could refer to: ${candidates}`)
  }

  return values[0]
}

export function matchesCardQuery(card: CardRow, query: string) {
  const normalizedQuery = normalizeMatch(query)
  const tags = (card.tags ?? []).map(tag => normalizeMatch(tag))
  return (
    normalizeMatch(card.title).includes(normalizedQuery) ||
    normalizeMatch(card.card_ref).includes(normalizedQuery) ||
    normalizeMatch(card.body_text ?? '').includes(normalizedQuery) ||
    tags.some(tag => tag.includes(normalizedQuery))
  )
}

function normalizeLimit(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(Math.trunc(value), fallback))
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function pickDefaultSprint(context: ProjectContext) {
  return context.sprints.find(sprint => sprint.status === 'active') ?? context.sprints[0] ?? null
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function daysBetween(left: Date, right: Date) {
  return Math.floor((right.getTime() - left.getTime()) / 86_400_000)
}

function computeSprintMidpoint(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) {
    return null
  }

  const start = startOfDay(new Date(startDate))
  const end = startOfDay(new Date(endDate))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return null
  }

  return new Date(start.getTime() + Math.floor((end.getTime() - start.getTime()) / 2))
}
