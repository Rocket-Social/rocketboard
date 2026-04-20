import {useMutation, useQueryClient} from '@tanstack/react-query'

import type {TaskBoardMode} from '../cards/card.types'
import {patchProjectTaskMode} from './project-data.cache'
import {runInBackground} from './project-mutation.utils'
import {projectTaskModeKeys} from './project-task-mode.queries'
import {projectTaskModeRepository} from './project-task-mode.repository'

export function useSetProjectTaskModeMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    TaskBoardMode,
    Error,
    TaskBoardMode,
    {previousTaskMode: TaskBoardMode | undefined}
  >({
    mutationFn: (taskMode: TaskBoardMode) => projectTaskModeRepository.setProjectTaskMode(projectId, taskMode),
    onError: (_error, _taskMode, context) => {
      queryClient.setQueryData(projectTaskModeKeys.detail(projectId), context?.previousTaskMode)
    },
    onMutate: async (taskMode) => {
      await queryClient.cancelQueries({queryKey: projectTaskModeKeys.detail(projectId)})
      const previousTaskMode = queryClient.getQueryData<TaskBoardMode | undefined>(projectTaskModeKeys.detail(projectId))

      patchProjectTaskMode(queryClient, projectId, taskMode)

      return {previousTaskMode}
    },
    onSuccess: (taskMode) => {
      patchProjectTaskMode(queryClient, projectId, taskMode)
    },
    onSettled: () => {
      runInBackground(queryClient.invalidateQueries({queryKey: projectTaskModeKeys.detail(projectId)}))
    },
  })
}
