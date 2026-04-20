import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {invalidateAllProjectDataGlobal, workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {setupRepository} from './setup.repository'
import type {BootstrapWorkspaceInput, CreateProjectInput, CreateWorkspaceInput} from './setup.types'

function refreshWorkspaceSummaries(queryClient: ReturnType<typeof useQueryClient>) {
  const query = workspaceSummariesQueryOptions()

  return queryClient.fetchQuery({
    ...query,
    staleTime: 0,
  })
}

function invalidateShellQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void Promise.all([
    invalidateAllProjectDataGlobal(queryClient),
    queryClient.invalidateQueries({queryKey: ['project-access']}),
  ])
}

export function inviteSnapshotQueryOptions(inviteToken: string) {
  return {
    queryFn: () => setupRepository.getInviteSnapshot(inviteToken),
    queryKey: ['invite-snapshot', inviteToken] as const,
  }
}

export function useInviteSnapshotQuery(inviteToken: string | null) {
  return useQuery({
    ...inviteSnapshotQueryOptions(inviteToken ?? 'missing-invite'),
    enabled: Boolean(inviteToken),
  })
}

export function useBootstrapWorkspaceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BootstrapWorkspaceInput) => setupRepository.bootstrapWorkspace(input),
    onSuccess: async () => {
      await refreshWorkspaceSummaries(queryClient)
      invalidateShellQueries(queryClient)
    },
  })
}

export function useCreateWorkspaceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => setupRepository.createWorkspace(input),
    onSuccess: async () => {
      await refreshWorkspaceSummaries(queryClient)
      invalidateShellQueries(queryClient)
    },
  })
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateProjectInput) => setupRepository.createProject(input),
    onSuccess: async () => {
      await refreshWorkspaceSummaries(queryClient)
      invalidateShellQueries(queryClient)
    },
  })
}

export function useAcceptInviteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteToken: string) => setupRepository.acceptInvite(inviteToken),
    onSuccess: async (_, inviteToken) => {
      await refreshWorkspaceSummaries(queryClient)
      await queryClient.invalidateQueries({queryKey: inviteSnapshotQueryOptions(inviteToken).queryKey})
      invalidateShellQueries(queryClient)
    },
  })
}
