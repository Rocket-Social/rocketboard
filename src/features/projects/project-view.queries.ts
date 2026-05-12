import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  patchProjectTableViewPersonalLayout,
  patchProjectTableViewSharedConfig,
} from './project-data.cache'
import {projectViewRepository} from './project-view.repository'
import type {TableGroupBy} from '../cards/card.types'
import type {
  ProjectOverviewConfig,
  ProjectTableFilters,
  ProjectTableSort,
} from './project-view.types'

export function useSetTableSharedConfigMutation(projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      filters: ProjectTableFilters
      groupBy: TableGroupBy
      personFilterUserId: string | null
      sort: ProjectTableSort
      visibleFieldKeys: string[]
    }) => projectViewRepository.setSharedConfig(projectViewId, input),
    onSuccess: async (tableView) => {
      patchProjectTableViewSharedConfig(queryClient, projectId, projectViewId, tableView)
    },
  })
}

export function useSetTablePersonalLayoutMutation(projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      collapsedGroups: string[]
      columnWidths: Record<string, number>
    }) =>
      projectViewRepository.setPersonalLayout(
        projectViewId,
        input.collapsedGroups,
        input.columnWidths,
      ),
    onSuccess: async (tableView) => {
      patchProjectTableViewPersonalLayout(queryClient, projectId, projectViewId, tableView)
    },
  })
}

export function overviewSharedConfigQueryOptions(projectViewId: string) {
  return {
    queryFn: () => projectViewRepository.getOverviewSharedConfig(projectViewId),
    queryKey: ['overview-shared-config', projectViewId] as const,
  }
}

export function ganttSharedConfigQueryOptions(projectViewId: string) {
  return {
    queryFn: () => projectViewRepository.getGanttSharedConfig(projectViewId),
    queryKey: ['gantt-shared-config', projectViewId] as const,
  }
}

export function useGanttSharedConfigQuery(projectViewId: string | null) {
  return useQuery({
    ...ganttSharedConfigQueryOptions(projectViewId ?? ''),
    enabled: Boolean(projectViewId),
    retry: false,
  })
}

export function useSetGanttSharedConfigMutation(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      projectViewRepository.setGanttSharedConfig(projectViewId, config),
    onError: (error) => {
      console.error('[gantt-save] Failed to save gantt config:', error)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ganttSharedConfigQueryOptions(projectViewId).queryKey, data)
    },
  })
}

export function useOverviewSharedConfigQuery(projectViewId: string | null) {
  return useQuery({
    ...overviewSharedConfigQueryOptions(projectViewId ?? ''),
    enabled: Boolean(projectViewId),
    retry: false,
  })
}

export function useSetOverviewSharedConfigMutation(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: ProjectOverviewConfig) =>
      projectViewRepository.setOverviewSharedConfig(projectViewId, config),
    onError: (error) => {
      console.error('[overview-save] Failed to save overview config:', error)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(overviewSharedConfigQueryOptions(projectViewId).queryKey, data)
    },
  })
}
