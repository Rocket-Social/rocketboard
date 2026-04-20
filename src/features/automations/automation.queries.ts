import {queryOptions, type QueryClient, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  automationRepository,
  type CreateProjectAutomationInput,
  type UpdateProjectAutomationInput,
} from './automation.repository'

export function projectAutomationsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => automationRepository.listProjectAutomations(projectId),
    queryKey: ['project-automations', projectId] as const,
    staleTime: 15_000,
  })
}

export function projectAutomationRunsQueryOptions(projectId: string, limit = 25, cursor?: string | null) {
  return queryOptions({
    queryFn: () => automationRepository.listProjectAutomationRuns({
      cursor: cursor ?? null,
      limit,
      projectId,
    }),
    queryKey: ['project-automation-runs', projectId, {cursor: cursor ?? null, limit}] as const,
    staleTime: 15_000,
  })
}

export async function invalidateProjectAutomationQueries(
  queryClient: QueryClient,
  projectId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({queryKey: ['project-automations', projectId]}),
    queryClient.invalidateQueries({queryKey: ['project-automation-runs', projectId]}),
  ])
}

export function useProjectAutomationsQuery(projectId: string | null, options?: {enabled?: boolean}) {
  return useQuery({
    ...projectAutomationsQueryOptions(projectId ?? 'missing-project'),
    enabled: (options?.enabled ?? true) && Boolean(projectId),
  })
}

export function useProjectAutomationRunsQuery(
  projectId: string | null,
  limit = 25,
  cursor?: string | null,
  options?: {enabled?: boolean},
) {
  return useQuery({
    ...projectAutomationRunsQueryOptions(projectId ?? 'missing-project', limit, cursor),
    enabled: (options?.enabled ?? true) && Boolean(projectId),
  })
}

export function useCreateProjectAutomationMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CreateProjectAutomationInput, 'projectId'>) =>
      automationRepository.createProjectAutomation({
        ...input,
        projectId,
      }),
    onSuccess: async () => {
      await invalidateProjectAutomationQueries(queryClient, projectId)
    },
  })
}

export function useUpdateProjectAutomationMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateProjectAutomationInput) => automationRepository.updateProjectAutomation(input),
    onSuccess: async () => {
      await invalidateProjectAutomationQueries(queryClient, projectId)
    },
  })
}

export function usePauseProjectAutomationMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (automationId: string) => automationRepository.pauseProjectAutomation(automationId),
    onSuccess: async () => {
      await invalidateProjectAutomationQueries(queryClient, projectId)
    },
  })
}

export function useResumeProjectAutomationMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (automationId: string) => automationRepository.resumeProjectAutomation(automationId),
    onSuccess: async () => {
      await invalidateProjectAutomationQueries(queryClient, projectId)
    },
  })
}

export function useDeleteProjectAutomationMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (automationId: string) => automationRepository.deleteProjectAutomation(automationId),
    onSuccess: async () => {
      await invalidateProjectAutomationQueries(queryClient, projectId)
    },
  })
}

export function useReorderProjectAutomationsMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (automationIds: string[]) => automationRepository.reorderProjectAutomations(projectId, automationIds),
    onSuccess: async () => {
      await invalidateProjectAutomationQueries(queryClient, projectId)
    },
  })
}
