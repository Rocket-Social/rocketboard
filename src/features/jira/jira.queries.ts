import {queryOptions, useMutation, useQueryClient} from '@tanstack/react-query'

import {
  getJiraConnectionStatus,
  syncProjectJiraStats,
} from './jira.connect'
import {jiraRepository} from './jira.repository'

export function organizationJiraStatusQueryOptions(organizationId: string) {
  return queryOptions({
    queryFn: () => getJiraConnectionStatus(organizationId),
    queryKey: ['jira-org-status', organizationId] as const,
    staleTime: 30_000,
  })
}

export function projectJiraContributorStatsQueryOptions(
  projectId: string,
  from?: string | null,
  to?: string | null,
  connectionSourceId?: string | null,
) {
  return queryOptions({
    queryFn: () => jiraRepository.getProjectContributorStats(
      projectId,
      from,
      to,
      connectionSourceId,
    ),
    queryKey: [
      'jira-contributor-stats',
      projectId,
      from ?? null,
      to ?? null,
      connectionSourceId ?? null,
    ] as const,
    staleTime: 30_000,
  })
}

export function projectJiraSettingsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => jiraRepository.getProjectJiraSettings(projectId),
    queryKey: ['jira-project-settings', projectId] as const,
    staleTime: 30_000,
  })
}

export function useSyncProjectJiraStats() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: syncProjectJiraStats,
    onSuccess: async (_data, params) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['jira-contributor-stats', params.projectId],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'jira-org-status',
        }),
      ])
    },
  })
}

export function useSetProjectJiraSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      connectionSourceId: string
      jiraProjectKey: string
      projectId: string
    }) => {
      await jiraRepository.setProjectJiraSource(
        params.projectId,
        params.connectionSourceId,
        params.jiraProjectKey,
      )
    },
    onSuccess: async (_data, params) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['jira-project-settings', params.projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['jira-contributor-stats', params.projectId],
        }),
      ])
    },
  })
}

export function useClearProjectJiraSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await jiraRepository.clearProjectJiraSource(projectId)
    },
    onSuccess: async (_data, projectId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['jira-project-settings', projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['jira-contributor-stats', projectId],
        }),
      ])
    },
  })
}
