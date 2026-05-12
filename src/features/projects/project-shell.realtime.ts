import {useEffect} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {realtimeAdapter} from '../../platform/realtime/realtime-adapter'
import {projectAutomationsQueryOptions} from '../automations/automation.queries'
import {applyRealtimeCardDetailPatch, cardDetailQueryOptions} from '../cards/card.queries'
import type {CardRecord} from '../cards/card.types'
import {
  documentPresenceQueryOptions,
  patchKnownDocumentPresence,
  projectDocumentQueryOptions,
  removeKnownDocumentPresence,
} from '../documents/document.queries'
import {cloneRichTextDocument} from '../rich-text/rich-text'
import {projectAccessQueryOptions} from '../access/access.queries'
import type {ProjectAccessSnapshot} from '../access/access.types'
import {applyRealtimeCardPatch, patchProjectCards} from './project-data.cache'
import {
  projectCardsQueryOptions,
  projectFieldsQueryOptions,
  projectGroupsQueryOptions,
  projectPriorityOptionsQueryOptions,
  projectStatusOptionsQueryOptions,
  projectTableViewStatesQueryOptions,
  workspaceSummariesQueryOptions,
} from './project-shell.queries'
import {projectTaskModeQueryOptions} from './project-task-mode.queries'

type UseProjectRealtimeOptions = {
  documentId?: string | null
  documentViewId?: string | null
  projectId: string
}

type RealtimePayload = {
  eventType?: 'DELETE' | 'INSERT' | 'UPDATE'
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}

type RealtimeCardRow = {
  assignee_user_id: string | null
  body_json?: CardRecord['bodyJson'] | null
  body_md: string | null
  completed_at: string | null
  due_at: string | null
  effort: number | null
  group_id: string | null
  group_position: number
  id: string
  position: number
  priority_option_id: CardRecord['priorityOptionId']
  project_id: string
  initiative_id: string | null
  sprint_id: string | null
  start_at: string | null
  status_option_id: CardRecord['statusOptionId']
  tags: string[] | null
  title: string
}

type RealtimePresenceRow = {
  document_id: string
  last_seen_at: string
  state: string
  user_id: string
}

function isRealtimeCardRow(value: Record<string, unknown> | null | undefined): value is RealtimeCardRow {
  return Boolean(
    value
    && typeof value.id === 'string'
    && typeof value.project_id === 'string'
    && typeof value.title === 'string'
    && typeof value.position === 'number'
    && typeof value.group_position === 'number'
    && (typeof value.effort === 'number' || value.effort === null)
    && (typeof value.status_option_id === 'string' || value.status_option_id === null)
    && (typeof value.priority_option_id === 'string' || value.priority_option_id === null),
  )
}

function mapRealtimeCardPatch(row: RealtimeCardRow) {
  return {
    assigneeUserId: row.assignee_user_id,
    bodyJson: row.body_json ? cloneRichTextDocument(row.body_json, row.body_md ?? '') : undefined,
    bodyMd: row.body_md ?? '',
    completedAt: row.completed_at,
    dueAt: row.due_at,
    effort: row.effort,
    groupId: row.group_id,
    groupPosition: row.group_position,
    id: row.id,
    initiativeId: row.initiative_id,
    priorityOptionId: row.priority_option_id,
    projectId: row.project_id,
    sprintId: row.sprint_id,
    startAt: row.start_at,
    statusOptionId: row.status_option_id,
    statusPosition: row.position,
    tags: row.tags ?? [],
    title: row.title,
  }
}

function findCurrentProjectCard(queryClient: ReturnType<typeof useQueryClient>, projectId: string, cardId: string) {
  const decomposedCards = queryClient.getQueryData<CardRecord[]>(projectCardsQueryOptions(projectId).queryKey)
  return decomposedCards?.find((card) => card.id === cardId) ?? null
}

function resolveAssigneeName(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  assigneeUserId: string | null,
) {
  if (!assigneeUserId) {
    return 'Unassigned'
  }

  const accessSnapshot = queryClient.getQueryData<ProjectAccessSnapshot | undefined>(projectAccessQueryOptions(projectId).queryKey)
  return accessSnapshot?.collaborators.find((member) => member.id === assigneeUserId)?.name ?? null
}

function isRealtimePresenceRow(value: Record<string, unknown> | null | undefined): value is RealtimePresenceRow {
  return Boolean(
    value
    && typeof value.document_id === 'string'
    && typeof value.user_id === 'string'
    && typeof value.state === 'string'
    && typeof value.last_seen_at === 'string',
  )
}

export function useProjectRealtime({documentId, documentViewId, projectId}: UseProjectRealtimeOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const invalidateProjectStructure = () =>
      Promise.all([
        queryClient.invalidateQueries({queryKey: projectFieldsQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: projectStatusOptionsQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: projectPriorityOptionsQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: projectGroupsQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: projectTaskModeQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: projectTableViewStatesQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
      ])

    const invalidateProjectCards = () =>
      Promise.all([
        queryClient.invalidateQueries({queryKey: projectCardsQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: ['project-search', projectId]}),
        queryClient.invalidateQueries({queryKey: ['workspace-search']}),
      ])

    const invalidateProjectAccess = () =>
      queryClient.invalidateQueries({queryKey: projectAccessQueryOptions(projectId).queryKey})
    const invalidateProjectAutomations = () =>
      Promise.all([
        queryClient.invalidateQueries({queryKey: projectAutomationsQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({queryKey: ['project-automation-runs', projectId]}),
      ])
    const invalidateDocument = () =>
      documentViewId
        ? Promise.all([
            queryClient.invalidateQueries({queryKey: projectDocumentQueryOptions(documentViewId).queryKey}),
            ...(documentId
              ? [queryClient.invalidateQueries({queryKey: documentPresenceQueryOptions(documentId).queryKey})]
              : []),
          ])
        : Promise.resolve()
    const invalidateCardDetail = (cardId: string | null) =>
      cardId
        ? queryClient.invalidateQueries({queryKey: cardDetailQueryOptions(cardId).queryKey})
        : Promise.resolve()
    const resolveCardId = (payload: RealtimePayload) => {
      const newId = payload.new?.id
      const oldId = payload.old?.id
      const newCardId = payload.new?.card_id
      const oldCardId = payload.old?.card_id

      if (typeof newId === 'string') {
        return newId
      }

      if (typeof oldId === 'string') {
        return oldId
      }

      if (typeof newCardId === 'string') {
        return newCardId
      }

      if (typeof oldCardId === 'string') {
        return oldCardId
      }

      return null
    }

    const channel = realtimeAdapter.channel(`project-shell-${projectId}`)

    channel.on('postgres_changes', {
      event: '*',
      filter: `id=eq.${projectId}`,
      schema: 'public',
      table: 'projects',
    }, () => {
      void invalidateProjectStructure()
    })

    channel.on('postgres_changes', {
      event: '*',
      filter: `project_id=eq.${projectId}`,
      schema: 'public',
      table: 'cards',
    }, (payload) => {
      const realtimePayload = payload as RealtimePayload
      const cardId = resolveCardId(realtimePayload)

      if (realtimePayload.eventType === 'DELETE' && cardId) {
        patchProjectCards(queryClient, projectId, (cards) => cards.filter((e) => e.id !== cardId))
        void invalidateCardDetail(cardId)
        return
      }

      if (realtimePayload.eventType === 'UPDATE' && isRealtimeCardRow(realtimePayload.new)) {
        const previousCard = findCurrentProjectCard(queryClient, projectId, realtimePayload.new.id)
        const nextAssigneeName = resolveAssigneeName(queryClient, projectId, realtimePayload.new.assignee_user_id)

        if (
          previousCard
          && realtimePayload.new.assignee_user_id !== previousCard.assigneeUserId
          && nextAssigneeName == null
        ) {
          void Promise.all([invalidateProjectCards(), invalidateCardDetail(realtimePayload.new.id)])
          return
        }

        const patch = {
          ...mapRealtimeCardPatch(realtimePayload.new),
          assigneeName: nextAssigneeName ?? previousCard?.assigneeName,
        }

        applyRealtimeCardPatch(queryClient, patch)
        applyRealtimeCardDetailPatch(queryClient, patch)
        void Promise.all([
          queryClient.invalidateQueries({queryKey: ['project-search', projectId]}),
          queryClient.invalidateQueries({queryKey: ['workspace-search']}),
        ])
        return
      }

      void Promise.all([invalidateProjectCards(), invalidateCardDetail(cardId)])
    })

    for (const table of ['project_views', 'documents', 'field_definitions'] as const) {
      channel.on('postgres_changes', {
        event: '*',
        filter: `project_id=eq.${projectId}`,
        schema: 'public',
        table,
      }, () => {
        void Promise.all([invalidateProjectStructure(), invalidateDocument()])
      })
    }

    for (const table of ['project_invites', 'project_members'] as const) {
      channel.on('postgres_changes', {
        event: '*',
        filter: `project_id=eq.${projectId}`,
        schema: 'public',
        table,
      }, () => {
        void Promise.all([
          invalidateProjectStructure(),
          invalidateProjectAccess(),
        ])
      })
    }

    for (const table of ['project_automations', 'project_automation_runs'] as const) {
      channel.on('postgres_changes', {
        event: '*',
        filter: `project_id=eq.${projectId}`,
        schema: 'public',
        table,
      }, () => {
        void invalidateProjectAutomations()
      })
    }

    channel.on('postgres_changes', {
      event: '*',
      filter: `project_id=eq.${projectId}`,
      schema: 'public',
      table: 'attachments',
    }, (payload) => {
      const realtimePayload = payload as RealtimePayload
      const cardId = resolveCardId(realtimePayload)

      void Promise.all([
        invalidateProjectStructure(),
        invalidateDocument(),
        invalidateCardDetail(cardId),
      ])
    })

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'field_options',
    }, (payload) => {
      const realtimePayload = payload as RealtimePayload
      const fieldDefId = String((realtimePayload.new ?? realtimePayload.old)?.field_definition_id ?? '')

      const cachedFields = queryClient.getQueryData<Array<{id: string}>>(projectFieldsQueryOptions(projectId).queryKey)

      // Only filter when we have cached data to check against. When cache is empty
      // (initial load, or cache was evicted), fall through to invalidation.
      if (cachedFields && (!fieldDefId || !cachedFields.some((f) => f.id === fieldDefId))) {
        return
      }

      void invalidateProjectStructure()
    })

    // card_field_values listener removed: custom field values now stored on cards.custom_data,
    // covered by the cards table listener above.

    if (documentId) {
      for (const table of ['document_comments', 'document_versions'] as const) {
        channel.on('postgres_changes', {
          event: '*',
          filter: `document_id=eq.${documentId}`,
          schema: 'public',
          table,
        }, () => {
          void Promise.all([
            invalidateDocument(),
            queryClient.invalidateQueries({queryKey: ['project-search', projectId]}),
            queryClient.invalidateQueries({queryKey: ['workspace-search']}),
          ])
        })
      }

      channel.on('postgres_changes', {
        event: '*',
        filter: `document_id=eq.${documentId}`,
        schema: 'public',
        table: 'document_presence',
      }, (payload) => {
        const realtimePayload = payload as RealtimePayload

        if (realtimePayload.eventType === 'DELETE' && isRealtimePresenceRow(realtimePayload.old)) {
          const removed = removeKnownDocumentPresence(queryClient, documentId, realtimePayload.old.user_id)

          if (!removed) {
            void invalidateDocument()
          }

          return
        }

        if (isRealtimePresenceRow(realtimePayload.new)) {
          const patched = patchKnownDocumentPresence(queryClient, documentId, {
            lastSeenAt: realtimePayload.new.last_seen_at,
            state: realtimePayload.new.state,
            userId: realtimePayload.new.user_id,
          })

          if (!patched) {
            void invalidateDocument()
          }

          return
        }

        void invalidateDocument()
      })
    }

    void channel.subscribe()

    return () => {
      void realtimeAdapter.removeChannel(channel)
    }
  }, [documentId, documentViewId, projectId, queryClient])
}
