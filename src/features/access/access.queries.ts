import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {invalidateAllProjectData, workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {accessRepository} from './access.repository'
import type {
  AddProjectAccessInput,
  AddWorkspaceAccessInput,
  CreateProjectInviteInput,
  CreateWorkspaceInviteInput,
  RemoveProjectAccessInput,
  RemoveWorkspaceAccessInput,
  SetProjectAccessRoleInput,
  SetProjectVisibilityInput,
  SetWorkspaceAccessRoleInput,
  SetWorkspaceVisibilityInput,
} from './access.types'

export function projectAccessQueryOptions(projectId: string) {
  return {
    queryFn: () => accessRepository.getProjectAccessSnapshot(projectId),
    queryKey: ['project-access', projectId] as const,
  }
}

export function projectAccessRouteContextQueryOptions(orgSlug: string, workspaceSlug: string, projectSlug: string) {
  return {
    queryFn: () => accessRepository.getProjectAccessRouteContext(orgSlug, workspaceSlug, projectSlug),
    queryKey: ['project-access-route-context', orgSlug, workspaceSlug, projectSlug] as const,
  }
}

export function workspaceAccessQueryOptions(workspaceId: string) {
  return {
    queryFn: () => accessRepository.getWorkspaceAccessSnapshot(workspaceId),
    queryKey: ['workspace-access', workspaceId] as const,
  }
}

export function workspaceAccessProjectsQueryOptions(workspaceId: string) {
  return {
    queryFn: () => accessRepository.listWorkspaceAccessProjects(workspaceId),
    queryKey: ['workspace-access-projects', workspaceId] as const,
  }
}

export function workspaceAccessRouteContextQueryOptions(orgSlug: string, workspaceSlug: string) {
  return {
    queryFn: () => accessRepository.getWorkspaceAccessRouteContext(orgSlug, workspaceSlug),
    queryKey: ['workspace-access-route-context', orgSlug, workspaceSlug] as const,
  }
}

export function useProjectAccessQuery(projectId: string | null) {
  return useQuery({
    ...projectAccessQueryOptions(projectId ?? 'missing-project'),
    enabled: Boolean(projectId),
  })
}

export function useProjectAccessRouteContextQuery(orgSlug: string | null, workspaceSlug: string | null, projectSlug: string | null) {
  return useQuery({
    ...projectAccessRouteContextQueryOptions(
      orgSlug ?? 'missing-org',
      workspaceSlug ?? 'missing-workspace',
      projectSlug ?? 'missing-project',
    ),
    enabled: Boolean(orgSlug) && Boolean(workspaceSlug) && Boolean(projectSlug),
  })
}

export function useWorkspaceAccessQuery(workspaceId: string | null) {
  return useQuery({
    ...workspaceAccessQueryOptions(workspaceId ?? 'missing-workspace'),
    enabled: Boolean(workspaceId),
  })
}

export function useWorkspaceAccessProjectsQuery(workspaceId: string | null) {
  return useQuery({
    ...workspaceAccessProjectsQueryOptions(workspaceId ?? 'missing-workspace'),
    enabled: Boolean(workspaceId),
  })
}

export function useWorkspaceAccessRouteContextQuery(orgSlug: string | null, workspaceSlug: string | null) {
  return useQuery({
    ...workspaceAccessRouteContextQueryOptions(orgSlug ?? 'missing-org', workspaceSlug ?? 'missing-workspace'),
    enabled: Boolean(orgSlug) && Boolean(workspaceSlug),
  })
}

export function useSearchWorkspaceMembersQuery(workspaceId: string | null, query: string, excludeProjectId?: string) {
  return useQuery({
    enabled: Boolean(workspaceId) && query.trim().length > 0,
    queryFn: () => accessRepository.searchWorkspaceMembers(workspaceId!, query, excludeProjectId),
    queryKey: ['workspace-access-search', workspaceId, query, excludeProjectId] as const,
  })
}

export function useAddProjectAccessMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<AddProjectAccessInput, 'projectId'>) =>
      accessRepository.addProjectAccess({...input, projectId}),
    onSuccess: async () => {
      await Promise.all([
        invalidateAllProjectData(queryClient, projectId),
        queryClient.invalidateQueries({queryKey: projectAccessQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access-route-context',
        }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access-projects',
        }),
        queryClient.invalidateQueries({queryKey: ['workspace-access-search']}),
      ])
    },
  })
}

export function useCreateProjectInviteMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CreateProjectInviteInput, 'projectId'>) =>
      accessRepository.createProjectInvite({...input, projectId}),
    onSuccess: async () => {
      await Promise.all([
        invalidateAllProjectData(queryClient, projectId),
        queryClient.invalidateQueries({queryKey: projectAccessQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access-route-context',
        }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access-projects',
        }),
      ])
    },
  })
}

export function useSetProjectAccessRoleMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<SetProjectAccessRoleInput, 'projectId'>) =>
      accessRepository.setProjectAccessRole({...input, projectId}),
    onSuccess: async () => {
      await Promise.all([
        invalidateAllProjectData(queryClient, projectId),
        queryClient.invalidateQueries({queryKey: projectAccessQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access-route-context',
        }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access-projects',
        }),
      ])
    },
  })
}

export function useRemoveProjectAccessMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<RemoveProjectAccessInput, 'projectId'>) =>
      accessRepository.removeProjectAccess({...input, projectId}),
    onSuccess: async () => {
      await Promise.all([
        invalidateAllProjectData(queryClient, projectId),
        queryClient.invalidateQueries({queryKey: projectAccessQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access-route-context',
        }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access-projects',
        }),
      ])
    },
  })
}

export function useAddWorkspaceAccessMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<AddWorkspaceAccessInput, 'workspaceId'>) =>
      accessRepository.addWorkspaceAccess({...input, workspaceId}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workspaceAccessQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceAccessProjectsQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access',
        }),
        queryClient.invalidateQueries({queryKey: ['workspace-access-search']}),
      ])
    },
  })
}

export function useCreateWorkspaceInviteMutation(workspaceId: string, orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CreateWorkspaceInviteInput, 'workspaceId'>) =>
      accessRepository.createWorkspaceInvite({...input, workspaceId}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workspaceAccessQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({
          queryKey: workspaceAccessRouteContextQueryOptions(orgSlug, workspaceSlug).queryKey,
        }),
        queryClient.invalidateQueries({queryKey: workspaceAccessProjectsQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
      ])
    },
  })
}

export function useSetWorkspaceAccessRoleMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<SetWorkspaceAccessRoleInput, 'workspaceId'>) =>
      accessRepository.setWorkspaceAccessRole({...input, workspaceId}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workspaceAccessQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceAccessProjectsQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access',
        }),
      ])
    },
  })
}

export function useRemoveWorkspaceAccessMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<RemoveWorkspaceAccessInput, 'workspaceId'>) =>
      accessRepository.removeWorkspaceAccess({...input, workspaceId}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workspaceAccessQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceAccessProjectsQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access',
        }),
      ])
    },
  })
}

export function useSetWorkspaceVisibilityMutation(workspaceId: string, orgSlug: string, workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<SetWorkspaceVisibilityInput, 'workspaceId'>) =>
      accessRepository.setWorkspaceVisibility({...input, workspaceId}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: workspaceAccessQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({
          queryKey: workspaceAccessRouteContextQueryOptions(orgSlug, workspaceSlug).queryKey,
        }),
        queryClient.invalidateQueries({queryKey: workspaceAccessProjectsQueryOptions(workspaceId).queryKey}),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access',
        }),
      ])
    },
  })
}

export function useSetProjectVisibilityMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<SetProjectVisibilityInput, 'projectId'>) =>
      accessRepository.setProjectVisibility({...input, projectId}),
    onSuccess: async () => {
      await Promise.all([
        invalidateAllProjectData(queryClient, projectId),
        queryClient.invalidateQueries({queryKey: projectAccessQueryOptions(projectId).queryKey}),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'project-access-route-context',
        }),
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'workspace-access-projects',
        }),
        queryClient.invalidateQueries({queryKey: workspaceSummariesQueryOptions().queryKey}),
      ])
    },
  })
}
