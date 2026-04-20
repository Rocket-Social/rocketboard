import type {QueryClient} from '@tanstack/react-query'

import type {
  CardRecord,
  MoveCardInput,
  MoveCardToGroupInput,
  ProjectPriorityOption,
  ProjectStatusOption,
  TaskBoardMode,
} from '../cards/card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import type {ProjectGroupRecord} from './project-group.types'
import type {ProjectTableViewState} from './project-view.types'
import type {ProjectTableViewStatesResult} from './project-shell.repository'

// ── Decomposed cache patching utilities ──────────────────────────────
// Direct setQueryData calls against the decomposed query keys.
// Replaces the 577-line project-shell.cache.ts monolithic cache system.

export function patchProjectCards(
  queryClient: QueryClient,
  projectId: string,
  updater: (cards: CardRecord[]) => CardRecord[],
) {
  queryClient.setQueryData<CardRecord[]>(
    ['project', 'cards', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectGroups(
  queryClient: QueryClient,
  projectId: string,
  updater: (groups: ProjectGroupRecord[]) => ProjectGroupRecord[],
) {
  queryClient.setQueryData<ProjectGroupRecord[]>(
    ['project', 'groups', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectFields(
  queryClient: QueryClient,
  projectId: string,
  updater: (fields: CustomFieldDefinition[]) => CustomFieldDefinition[],
) {
  queryClient.setQueryData<CustomFieldDefinition[]>(
    ['project', 'fields', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectStatusOptions(
  queryClient: QueryClient,
  projectId: string,
  updater: (options: ProjectStatusOption[]) => ProjectStatusOption[],
) {
  queryClient.setQueryData<ProjectStatusOption[]>(
    ['project', 'status-options', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectPriorityOptions(
  queryClient: QueryClient,
  projectId: string,
  updater: (options: ProjectPriorityOption[]) => ProjectPriorityOption[],
) {
  queryClient.setQueryData<ProjectPriorityOption[]>(
    ['project', 'priority-options', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectSprints(
  queryClient: QueryClient,
  projectId: string,
  updater: (sprints: ProjectSprintRecord[]) => ProjectSprintRecord[],
) {
  queryClient.setQueryData<ProjectSprintRecord[]>(
    ['project', 'sprints', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectTaskMode(
  queryClient: QueryClient,
  projectId: string,
  taskMode: TaskBoardMode,
) {
  queryClient.setQueryData<TaskBoardMode>(
    ['project', 'task-mode', projectId],
    taskMode,
  )
}

export function patchProjectTableViewStatesResult(
  queryClient: QueryClient,
  projectId: string,
  updater: (result: ProjectTableViewStatesResult) => ProjectTableViewStatesResult,
) {
  queryClient.setQueryData<ProjectTableViewStatesResult>(
    ['project', 'table-view-states', projectId],
    (current) => current ? updater(current) : current,
  )
}

export function patchProjectTableViewStates(
  queryClient: QueryClient,
  projectId: string,
  projectViewId: string,
  tableView: ProjectTableViewState,
) {
  patchProjectTableViewState(queryClient, projectId, projectViewId, () => tableView)
}

function patchProjectTableViewState(
  queryClient: QueryClient,
  projectId: string,
  projectViewId: string,
  updater: (current: ProjectTableViewState | undefined) => ProjectTableViewState,
) {
  patchProjectTableViewStatesResult(
    queryClient,
    projectId,
    (current) => {
      return {
        ...current,
        tableViewStates: {
          ...current.tableViewStates,
          [projectViewId]: updater(current.tableViewStates[projectViewId]),
        },
      }
    },
  )
}

export function patchProjectTableViewSharedConfig(
  queryClient: QueryClient,
  projectId: string,
  projectViewId: string,
  tableView: ProjectTableViewState,
) {
  patchProjectTableViewState(queryClient, projectId, projectViewId, (current) => ({
    personalConfig: current?.personalConfig ?? tableView.personalConfig,
    sharedConfig: tableView.sharedConfig,
    sharedVersion: tableView.sharedVersion,
  }))
}

export function patchProjectTableViewPersonalLayout(
  queryClient: QueryClient,
  projectId: string,
  projectViewId: string,
  tableView: ProjectTableViewState,
) {
  patchProjectTableViewState(queryClient, projectId, projectViewId, (current) => ({
    personalConfig: tableView.personalConfig,
    sharedConfig: current?.sharedConfig ?? tableView.sharedConfig,
    sharedVersion: current?.sharedVersion ?? tableView.sharedVersion,
  }))
}

// ── Card move position arithmetic ────────────────────────────────────
// Extracted from the monolithic cache helpers. Handles same-column and
// cross-column position updates for card drag-and-drop.

export function applyCardMoveToCache(
  queryClient: QueryClient,
  input: MoveCardInput,
  card: CardRecord,
): boolean {
  let moved = false

  patchProjectCards(queryClient, input.projectId, (cards) => {
    const currentCard = cards.find((entry) => entry.id === input.cardId)
    if (!currentCard) return cards

    const targetCount = cards.filter(
      (entry) => entry.statusOptionId === input.targetStatusOptionId && entry.id !== input.cardId,
    ).length
    const normalizedTargetPosition = Math.max(0, Math.min(input.targetPosition, targetCount))
    const sourcePosition = currentCard.statusPosition
    const sourceStatusOptionId = currentCard.statusOptionId

    if (sourceStatusOptionId === input.targetStatusOptionId && sourcePosition === normalizedTargetPosition) {
      return cards
    }

    moved = true

    return cards.map((entry) => {
      if (entry.id === input.cardId) {
        return {
          ...entry, ...card,
          statusPosition: normalizedTargetPosition,
          statusOptionId: input.targetStatusOptionId,
        }
      }

      if (sourceStatusOptionId === input.targetStatusOptionId) {
        if (entry.statusOptionId !== sourceStatusOptionId) return entry
        if (normalizedTargetPosition > sourcePosition) {
          if (entry.statusPosition > sourcePosition && entry.statusPosition <= normalizedTargetPosition) {
            return {...entry, statusPosition: entry.statusPosition - 1}
          }
          return entry
        }
        if (entry.statusPosition >= normalizedTargetPosition && entry.statusPosition < sourcePosition) {
          return {...entry, statusPosition: entry.statusPosition + 1}
        }
        return entry
      }

      if (entry.statusOptionId === sourceStatusOptionId && entry.statusPosition > sourcePosition) {
        return {...entry, statusPosition: entry.statusPosition - 1}
      }
      if (entry.statusOptionId === input.targetStatusOptionId && entry.statusPosition >= normalizedTargetPosition) {
        return {...entry, statusPosition: entry.statusPosition + 1}
      }
      return entry
    })
  })

  return moved
}

export function applyCardMoveToGroupCache(
  queryClient: QueryClient,
  input: MoveCardToGroupInput,
  cardPatch?: Partial<CardRecord>,
): boolean {
  let moved = false

  patchProjectCards(queryClient, input.projectId, (cards) => {
    const currentCard = cards.find((entry) => entry.id === input.cardId)
    if (!currentCard) return cards

    const targetCount = cards.filter(
      (entry) => entry.groupId === input.targetGroupId && entry.id !== input.cardId,
    ).length
    const normalizedTargetPosition = Math.max(0, Math.min(input.targetPosition ?? targetCount, targetCount))
    const sourceGroupId = currentCard.groupId
    const sourcePosition = currentCard.groupPosition

    if (sourceGroupId === input.targetGroupId && sourcePosition === normalizedTargetPosition) {
      return cards
    }

    moved = true

    return cards.map((entry) => {
      if (entry.id === input.cardId) {
        return {
          ...entry,
          ...cardPatch,
          groupId: cardPatch && 'groupId' in cardPatch ? cardPatch.groupId ?? null : input.targetGroupId,
          groupPosition: cardPatch && 'groupPosition' in cardPatch
            ? cardPatch.groupPosition ?? normalizedTargetPosition
            : normalizedTargetPosition,
        }
      }

      if (sourceGroupId === input.targetGroupId) {
        if (entry.groupId !== sourceGroupId) return entry
        if (normalizedTargetPosition > sourcePosition) {
          if (entry.groupPosition > sourcePosition && entry.groupPosition <= normalizedTargetPosition) {
            return {...entry, groupPosition: entry.groupPosition - 1}
          }
          return entry
        }
        if (entry.groupPosition >= normalizedTargetPosition && entry.groupPosition < sourcePosition) {
          return {...entry, groupPosition: entry.groupPosition + 1}
        }
        return entry
      }

      if (entry.groupId === sourceGroupId && entry.groupPosition > sourcePosition) {
        return {...entry, groupPosition: entry.groupPosition - 1}
      }
      if (entry.groupId === input.targetGroupId && entry.groupPosition >= normalizedTargetPosition) {
        return {...entry, groupPosition: entry.groupPosition + 1}
      }
      return entry
    })
  })

  return moved
}

// ── Realtime card patch ──────────────────────────────────────────────

export type CardCachePatch = {
  assigneeName?: string
  assigneeUserId?: string | null
  bodyJson?: CardRecord['bodyJson']
  bodyMd: string
  completedAt?: string | null
  dueAt: string | null
  effort: number | null
  groupId?: string | null
  groupPosition?: number
  id: string
  initiativeId?: string | null
  priorityOptionId: CardRecord['priorityOptionId']
  projectId: string
  sprintId?: string | null
  startAt: string | null
  statusOptionId: CardRecord['statusOptionId']
  statusPosition: number
  tags: string[]
  title: string
}

export function applyRealtimeCardPatch(queryClient: QueryClient, patch: CardCachePatch) {
  patchProjectCards(queryClient, patch.projectId, (cards) =>
    cards.map((entry) => {
      if (entry.id !== patch.id) return entry
      return {
        ...entry,
        assigneeName: patch.assigneeName ?? (patch.assigneeUserId === null ? 'Unassigned' : entry.assigneeName),
        assigneeUserId: 'assigneeUserId' in patch ? patch.assigneeUserId ?? null : entry.assigneeUserId,
        bodyJson: patch.bodyJson ?? entry.bodyJson,
        bodyMd: patch.bodyMd,
        completedAt: 'completedAt' in patch ? patch.completedAt ?? null : entry.completedAt,
        dueAt: patch.dueAt,
        effort: patch.effort,
        groupId: 'groupId' in patch ? patch.groupId ?? null : entry.groupId,
        groupPosition: 'groupPosition' in patch ? patch.groupPosition ?? entry.groupPosition : entry.groupPosition,
        initiativeId: 'initiativeId' in patch ? patch.initiativeId ?? null : entry.initiativeId,
        priorityOptionId: patch.priorityOptionId,
        sprintId: 'sprintId' in patch ? patch.sprintId ?? null : entry.sprintId,
        startAt: patch.startAt,
        statusOptionId: patch.statusOptionId,
        statusPosition: entry.statusPosition,
        tags: patch.tags,
        title: patch.title,
      }
    }),
  )
}
