import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {orgSettingsRepository} from './org-settings.repository'
import type {
  ApproveOrgInviteRequestInput,
  CreateOrgInviteRequestInput,
  DeclineOrgInviteRequestInput,
} from './org-settings.types'

export function orgMembersQueryOptions(orgId: string) {
  return {
    queryFn: () => orgSettingsRepository.getOrganizationMembers(orgId),
    queryKey: ['org-members', orgId] as const,
  }
}

export function useOrgMembersQuery(orgId: string | null) {
  return useQuery({
    ...orgMembersQueryOptions(orgId ?? ''),
    enabled: Boolean(orgId),
  })
}

export function useCreateOrgInviteMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {email: string; inviterName: string; message?: string; organizationName: string; role: string}) =>
      orgSettingsRepository.createOrganizationInvite({
        email: input.email,
        inviterName: input.inviterName,
        message: input.message,
        orgId,
        organizationName: input.organizationName,
        role: input.role,
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function useRevokeOrgInviteMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => orgSettingsRepository.revokeInvitation(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function useRemoveOrgMemberMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => orgSettingsRepository.removeOrganizationMember(orgId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function useSetOrgMemberRoleMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {role: string; userId: string}) =>
      orgSettingsRepository.setOrganizationMemberRole(orgId, input.userId, input.role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function useSetAllowedDomainsMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (domains: string[]) => orgSettingsRepository.setAllowedDomains(orgId, domains),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function useSetOrgTimezoneMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (timezone: string) => orgSettingsRepository.setOrganizationTimezone(orgId, timezone),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function useSetOrgAiSettingsMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {driftWatcherEnabled: boolean; workspaceGuidance: string | null}) =>
      orgSettingsRepository.setOrganizationAiSettings({
        driftWatcherEnabled: input.driftWatcherEnabled,
        orgId,
        workspaceGuidance: input.workspaceGuidance,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey})
    },
  })
}

export function inviteRequestsQueryOptions(orgId: string) {
  return {
    queryFn: () => orgSettingsRepository.listInviteRequests(orgId),
    queryKey: ['invite-requests', orgId] as const,
  }
}

export function useInviteRequestsQuery(orgId: string | null, options: {enabled?: boolean} = {}) {
  return useQuery({
    ...inviteRequestsQueryOptions(orgId ?? ''),
    enabled: Boolean(orgId) && (options.enabled ?? true),
  })
}

export function useCreateOrgInviteRequestMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateOrgInviteRequestInput) => orgSettingsRepository.createInviteRequest(input),
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey: inviteRequestsQueryOptions(orgId).queryKey})
    },
  })
}

export function useApproveOrgInviteRequestMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ApproveOrgInviteRequestInput) => orgSettingsRepository.approveInviteRequest(input),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: inviteRequestsQueryOptions(orgId).queryKey}),
        queryClient.invalidateQueries({queryKey: orgMembersQueryOptions(orgId).queryKey}),
      ])
    },
  })
}

export function useDeclineOrgInviteRequestMutation(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeclineOrgInviteRequestInput) => orgSettingsRepository.declineInviteRequest(input),
    onSettled: async () => {
      await queryClient.invalidateQueries({queryKey: inviteRequestsQueryOptions(orgId).queryKey})
    },
  })
}
