import {useEffect, useState} from 'react'
import {queryOptions, useQuery} from '@tanstack/react-query'

import {projectTaskModeRepository} from './project-task-mode.repository'

export const projectTaskModeKeys = {
  all: ['project', 'task-mode'] as const,
  detail: (projectId: string) => ['project', 'task-mode', projectId] as const,
}

export function projectTaskModeQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => projectTaskModeRepository.getProjectTaskMode(projectId),
    queryKey: projectTaskModeKeys.detail(projectId),
    staleTime: 0,
  })
}

export function useProjectTaskModeQuery(projectId: string, options?: {enabled?: boolean}) {
  const enabled = options?.enabled ?? true
  const query = useQuery({
    ...projectTaskModeQueryOptions(projectId),
    enabled,
    refetchOnMount: 'always',
  })
  const [readyProjectId, setReadyProjectId] = useState<string | null>(enabled ? null : projectId)

  useEffect(() => {
    setReadyProjectId(enabled ? null : projectId)
  }, [enabled, projectId])

  useEffect(() => {
    if (!enabled || (!query.isFetching && query.isSuccess)) {
      setReadyProjectId(projectId)
    }
  }, [enabled, projectId, query.isFetching, query.isSuccess])

  return {
    ...query,
    isReady: !enabled || readyProjectId === projectId,
    taskMode: query.data,
  }
}
