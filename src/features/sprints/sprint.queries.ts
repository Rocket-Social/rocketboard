import {useMutation, useQueryClient} from '@tanstack/react-query'

import type {CardRecord, ProjectStatusOption} from '../cards/card.types'
import {patchProjectCards, patchProjectSprints} from '../projects/project-data.cache'
import {
  restoreQuerySnapshots,
  runInBackground,
  snapshotQueries,
} from '../projects/project-mutation.utils'
import {invalidateProjectDataSlices} from '../projects/project-shell.queries'
import {projectStatusOptionsQueryOptions} from '../projects/project-shell.queries'
import {sprintRepository} from './sprint.repository'
import type {
  CompleteSprintInput,
  CreateSprintInput,
  ProjectSprintRecord,
  UpdateSprintInput,
} from './sprint.types'

function sortProjectSprints(sprints: ProjectSprintRecord[]) {
  return [...sprints].sort((left, right) => left.position - right.position)
}

function getCompletedStatusOptionIds(statusOptions: ProjectStatusOption[]) {
  return new Set(
    statusOptions
      .filter((option) => option.category === 'completed')
      .map((option) => option.id),
  )
}

function moveIncompleteCardsFromCompletedSprint(
  cards: CardRecord[],
  sourceSprintId: string,
  targetSprintId: string | null,
  completedStatusOptionIds: Set<string>,
) {
  return cards.map((card) => {
    if (card.sprintId !== sourceSprintId) return card
    if (card.statusOptionId && completedStatusOptionIds.has(card.statusOptionId)) {
      return card
    }

    return {...card, sprintId: targetSprintId}
  })
}

export function useCreateSprintMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSprintInput) => sprintRepository.createSprint(input),
    onSuccess: (sprint) => {
      patchProjectSprints(queryClient, projectId, (sprints) =>
        sortProjectSprints([...sprints, sprint]),
      )
      runInBackground(invalidateProjectDataSlices(queryClient, projectId, ['sprints']))
    },
  })
}

export function useUpdateSprintMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateSprintInput) => sprintRepository.updateSprint(input),
    onMutate: async (input) => {
      const sprintSnapshots = await snapshotQueries<ProjectSprintRecord[]>(queryClient, ['project', 'sprints', projectId])

      patchProjectSprints(queryClient, projectId, (sprints) =>
        sprints.map((sprint) =>
          sprint.id === input.id
            ? {
                ...sprint,
                endDate: input.endDate,
                goal: input.goal,
                name: input.name,
                startDate: input.startDate,
              }
            : sprint,
        ),
      )

      return {sprintSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.sprintSnapshots ?? [])
    },
    onSuccess: () => {
      runInBackground(invalidateProjectDataSlices(queryClient, projectId, ['sprints']))
    },
  })
}

export function useStartSprintMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sprintId: string) => sprintRepository.startSprint(sprintId),
    onMutate: async (sprintId) => {
      const sprintSnapshots = await snapshotQueries<ProjectSprintRecord[]>(queryClient, ['project', 'sprints', projectId])

      patchProjectSprints(queryClient, projectId, (sprints) =>
        sprints.map((sprint) => {
          if (sprint.id === sprintId) {
            return {...sprint, status: 'active'}
          }

          if (sprint.status === 'active') {
            return {...sprint, status: 'planned'}
          }

          return sprint
        }),
      )

      return {sprintSnapshots}
    },
    onError: (_error, _sprintId, context) => {
      restoreQuerySnapshots(queryClient, context?.sprintSnapshots ?? [])
    },
    onSuccess: () => {
      runInBackground(invalidateProjectDataSlices(queryClient, projectId, ['sprints']))
    },
  })
}

export function useCompleteSprintMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CompleteSprintInput) => sprintRepository.completeSprint(input),
    onMutate: async (input) => {
      const [cardSnapshots, sprintSnapshots] = await Promise.all([
        snapshotQueries(queryClient, ['project', 'cards', projectId]),
        snapshotQueries<ProjectSprintRecord[]>(queryClient, ['project', 'sprints', projectId]),
      ])

      const statusOptions =
        queryClient.getQueryData<ProjectStatusOption[]>(projectStatusOptionsQueryOptions(projectId).queryKey) ?? []
      const completedStatusOptionIds = getCompletedStatusOptionIds(statusOptions)
      const completedAt = new Date().toISOString()

      patchProjectSprints(queryClient, projectId, (sprints) =>
        sprints.map((sprint) =>
          sprint.id === input.sprintId
            ? {...sprint, completedAt, status: 'completed', updatedAt: completedAt}
            : sprint,
        ),
      )

      const canOptimisticallyMoveCards = statusOptions.length > 0 && (
        input.action === 'return_to_backlog'
        || (input.action === 'move_to_next' && input.nextSprint?.kind === 'existing')
      )

      if (canOptimisticallyMoveCards) {
        const targetSprintId = input.action === 'move_to_next'
          ? (input.nextSprint?.kind === 'existing' ? input.nextSprint.sprintId : null)
          : null
        patchProjectCards(queryClient, projectId, (cards) =>
          moveIncompleteCardsFromCompletedSprint(
            cards,
            input.sprintId,
            targetSprintId,
            completedStatusOptionIds,
          ),
        )
      }

      return {cardSnapshots, sprintSnapshots}
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.cardSnapshots ?? [])
      restoreQuerySnapshots(queryClient, context?.sprintSnapshots ?? [])
    },
    onSuccess: (createdSprint, input) => {
      if (createdSprint) {
        patchProjectSprints(queryClient, projectId, (sprints) =>
          sortProjectSprints([
            ...sprints.filter((sprint) => sprint.id !== createdSprint.id),
            createdSprint,
          ]),
        )
      }

      if (createdSprint && input.action === 'move_to_next' && input.nextSprint?.kind === 'create') {
        const statusOptions =
          queryClient.getQueryData<ProjectStatusOption[]>(projectStatusOptionsQueryOptions(projectId).queryKey) ?? []
        const completedStatusOptionIds = getCompletedStatusOptionIds(statusOptions)

        if (completedStatusOptionIds.size > 0) {
          patchProjectCards(queryClient, projectId, (cards) =>
            moveIncompleteCardsFromCompletedSprint(
              cards,
              input.sprintId,
              createdSprint.id,
              completedStatusOptionIds,
            ),
          )
        }
      }

      runInBackground(invalidateProjectDataSlices(queryClient, projectId, ['cards', 'sprints']))
    },
  })
}

export function useDeleteSprintMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sprintId: string) => sprintRepository.deleteSprint(sprintId),
    onSuccess: (_result, sprintId) => {
      patchProjectSprints(queryClient, projectId, (sprints) =>
        sprints.filter((sprint) => sprint.id !== sprintId),
      )
      runInBackground(invalidateProjectDataSlices(queryClient, projectId, ['cards', 'sprints']))
    },
  })
}
