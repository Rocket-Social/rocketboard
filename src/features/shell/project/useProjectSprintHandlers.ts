import {useCallback, useMemo} from 'react'

import {useToast} from '../../../components/ui/toast'
import {resolveCompleteSprintMoveTarget} from '../../sprints/complete-sprint-target'
import {getCreateSprintDateDefaults} from '../../sprints/sprint-date'
import {
  useCreateSprintMutation,
  useCompleteSprintMutation,
  useStartSprintMutation,
  useUpdateSprintMutation,
} from '../../sprints/sprint.queries'
import type {CompleteSprintAction, CompleteSprintInput, ProjectSprintRecord} from '../../sprints/sprint.types'
import type {CompleteSprintDialogState} from './ProjectDialogContext'

export type ProjectSprintHandlers = {
  createSprintDateDefaults: {
    endDate: string | null
    startDate: string | null
  }
  editingSprint: ProjectSprintRecord | null
  handleCompleteSprintAction: (action: CompleteSprintAction) => void
  handleSubmitSprint: (input: {
    endDate?: string | null
    goal?: string | null
    name: string
    startDate?: string | null
  }) => void
  renameSprint: (sprintId: string, name: string) => void
  startSprint: (sprintId: string) => void
}

export function useProjectSprintHandlers({
  projectId,
  projectSprints,
  editingSprintId,
  completeSprintState,
  setCompleteSprintState,
}: {
  projectId: string
  projectSprints: ProjectSprintRecord[]
  editingSprintId: string | null
  completeSprintState: CompleteSprintDialogState | null
  setCompleteSprintState: (state: CompleteSprintDialogState | null) => void
}): ProjectSprintHandlers {
  const {toast} = useToast()
  const createSprintMutation = useCreateSprintMutation(projectId)
  const completeSprintMutation = useCompleteSprintMutation(projectId)
  const startSprintMutation = useStartSprintMutation(projectId)
  const updateSprintMutation = useUpdateSprintMutation(projectId)

  const createSprintDateDefaults = useMemo(
    () => getCreateSprintDateDefaults(projectSprints),
    [projectSprints],
  )
  const editingSprint =
    projectSprints.find((sprint) => sprint.id === editingSprintId) ?? null

  const handleCompleteSprintAction = useCallback(
    (selectedAction: CompleteSprintAction) => {
      if (!completeSprintState) return
      const {incompleteCount, sprintId, sprintName} = completeSprintState

      void (async () => {
        let action = selectedAction
        let nextSprint: CompleteSprintInput['nextSprint'] = null

        if (incompleteCount === 0) {
          action = 'keep'
        } else if (selectedAction === 'move_to_next') {
          nextSprint = resolveCompleteSprintMoveTarget(projectSprints, sprintId)
        }

        await completeSprintMutation.mutateAsync({
          action,
          nextSprint,
          sprintId,
        })

        toast({title: `"${sprintName}" completed`})
        setCompleteSprintState(null)
      })().catch(() => {
        toast({title: 'Could not complete sprint', variant: 'error'})
      })
    },
    [
      completeSprintMutation,
      completeSprintState,
      projectSprints,
      setCompleteSprintState,
      toast,
    ],
  )

  const handleSubmitSprint = useCallback(
    (input: {
      endDate?: string | null
      goal?: string | null
      name: string
      startDate?: string | null
    }) => {
      if (editingSprint) {
        updateSprintMutation.mutate(
          {
            endDate: input.endDate ?? null,
            goal: input.goal ?? null,
            id: editingSprint.id,
            name: input.name,
            startDate: input.startDate ?? null,
          },
          {
            onSuccess: () => toast({title: `Sprint "${input.name}" updated`}),
            onError: () =>
              toast({title: 'Could not update sprint', variant: 'error'}),
          },
        )
        return
      }

      createSprintMutation.mutate(
        {
          endDate: input.endDate,
          goal: input.goal,
          name: input.name,
          projectId,
          startDate: input.startDate,
        },
        {
          onSuccess: () => toast({title: `Sprint "${input.name}" created`}),
          onError: () =>
            toast({title: 'Could not create sprint', variant: 'error'}),
        },
      )
    },
    [createSprintMutation, editingSprint, projectId, toast, updateSprintMutation],
  )

  const renameSprint = useCallback(
    (sprintId: string, name: string) => {
      const sprint = projectSprints.find((entry) => entry.id === sprintId)
      if (!sprint) return

      updateSprintMutation.mutate(
        {
          endDate: sprint.endDate,
          goal: sprint.goal,
          id: sprintId,
          name,
          startDate: sprint.startDate,
        },
        {
          onError: () =>
            toast({title: 'Could not rename sprint', variant: 'error'}),
        },
      )
    },
    [projectSprints, toast, updateSprintMutation],
  )

  const startSprint = useCallback(
    (sprintId: string) => {
      startSprintMutation.mutate(sprintId, {
        onError: () =>
          toast({title: 'Could not start sprint', variant: 'error'}),
      })
    },
    [startSprintMutation, toast],
  )

  return {
    createSprintDateDefaults,
    editingSprint,
    handleCompleteSprintAction,
    handleSubmitSprint,
    renameSprint,
    startSprint,
  }
}
