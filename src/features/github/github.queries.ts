import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { getGitHubAppSetupStatus } from './github.connect'
import type { GitHubAnalyticsSettings, GitHubBoardConfig } from './github.types'
import { githubRepository } from './github.repository'

export function organizationGitHubSourcesQueryOptions(organizationId: string) {
  return queryOptions({
    queryFn: () => githubRepository.listOrganizationSources(organizationId),
    queryKey: ['github-org-sources', organizationId],
    staleTime: 30_000,
  })
}

export function personalGitHubSourcesQueryOptions() {
  return queryOptions({
    queryFn: () => githubRepository.listPersonalSources(),
    queryKey: ['github-personal-sources'],
    staleTime: 30_000,
  })
}

export function projectGitHubSettingsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getProjectGitHubSettings(projectId),
    queryKey: ['github-project-settings', projectId],
    staleTime: 15_000,
  })
}

export function gitHubBoardConfigQueryOptions(projectViewId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getGitHubBoardConfig(projectViewId),
    queryKey: ['github-board-config', projectViewId] as const,
    staleTime: 15_000,
  })
}

export function sourceAllowedRepositoriesQueryOptions(
  connectionSourceId: string | null,
) {
  return queryOptions({
    queryFn: () =>
      connectionSourceId
        ? githubRepository.getAllowedRepositoriesForSource(connectionSourceId)
        : Promise.resolve([]),
    queryKey: ['github-source-allowed-repos', connectionSourceId],
    staleTime: 15_000,
  })
}

export function projectGitHubReposQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getRepositoriesForProject(projectId),
    queryKey: ['github-repos', projectId],
    staleTime: 15_000,
  })
}

export function projectPullRequestsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getPullRequestsForProject(projectId),
    queryKey: ['github-prs', projectId],
    staleTime: 15_000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function projectGitHubAnalyticsPullRequestsQueryOptions(
  projectId: string,
  from: string | null,
  to: string | null,
) {
  return queryOptions({
    queryFn: () =>
      githubRepository.getProjectGitHubAnalyticsPullRequests(
        projectId,
        from,
        to,
      ),
    queryKey: ['github-analytics-prs', projectId, from, to] as const,
    staleTime: 15_000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function projectGitHubSummaryQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getProjectGitHubSummary(projectId),
    queryKey: ['github-summary', projectId],
    staleTime: 15_000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function projectGitHubEventsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getEventsForProject(projectId),
    queryKey: ['github-events', projectId],
    staleTime: 15_000,
  })
}

export function projectGitHubReviewEventsQueryOptions(
  projectId: string,
  from: string | null,
  to: string | null,
) {
  return queryOptions({
    queryFn: () =>
      githubRepository.getProjectGitHubReviewEvents(projectId, from, to),
    queryKey: ['github-review-events', projectId, from, to] as const,
    staleTime: 15_000,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function projectGitHubCardsQueryOptions(projectId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getProjectCards(projectId),
    queryKey: ['github-project-cards', projectId],
    staleTime: 30_000,
  })
}

export function organizationGitHubIdentityCandidatesQueryOptions(
  organizationId: string,
) {
  return queryOptions({
    queryFn: () =>
      githubRepository.getOrganizationGitHubIdentityCandidates(organizationId),
    queryKey: ['github-identity-candidates', organizationId] as const,
    staleTime: 30_000,
  })
}

export function organizationGitHubAppSetupStatusQueryOptions(
  organizationId: string,
) {
  return queryOptions({
    queryFn: () => getGitHubAppSetupStatus(organizationId),
    queryKey: ['github-app-setup-status', organizationId] as const,
    staleTime: 0,
  })
}

export function cardGitHubLinksQueryOptions(cardId: string) {
  return queryOptions({
    queryFn: () => githubRepository.getLinkedPRsForCard(cardId),
    queryKey: ['card-github-links', cardId],
    staleTime: 30_000,
  })
}

export function useSetProjectGitHubSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      projectId: string
      connectionSourceId: string
    }) => {
      await githubRepository.setProjectGitHubSource(
        params.projectId,
        params.connectionSourceId,
      )
    },
    onSuccess: async (_data, params) => {
      await invalidateProjectGitHub(queryClient, params.projectId)
    },
  })
}

export function useClearProjectGitHubSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await githubRepository.clearProjectGitHubSource(projectId)
    },
    onSuccess: async (_data, projectId) => {
      await invalidateProjectGitHub(queryClient, projectId)
    },
  })
}

export function useSetProjectAutoTransitions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { enabled: boolean; projectId: string }) => {
      await githubRepository.setProjectAutoTransitions(
        params.projectId,
        params.enabled,
      )
    },
    onSuccess: async (_data, params) => {
      await invalidateProjectGitHub(queryClient, params.projectId)
    },
  })
}

export function useAllowRepositoryForSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      connectionSourceId: string
      repo: {
        githubRepoId: number
        fullName: string
        name: string
        defaultBranch: string
        isPrivate: boolean
      }
    }) =>
      githubRepository.allowRepositoryForSource(
        params.connectionSourceId,
        params.repo,
      ),
    onSuccess: async (_data, params) => {
      await queryClient.invalidateQueries({
        queryKey: ['github-source-allowed-repos', params.connectionSourceId],
      })
    },
  })
}

export function useRemoveAllowedRepositoryFromSource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      connectionSourceId: string
      githubRepoId: number
    }) =>
      githubRepository.removeAllowedRepositoryFromSource(
        params.connectionSourceId,
        params.githubRepoId,
      ),
    onSuccess: async (_data, params) => {
      await queryClient.invalidateQueries({
        queryKey: ['github-source-allowed-repos', params.connectionSourceId],
      })
    },
  })
}

export function useConnectRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      projectId: string
      connectionSourceId: string
      repo: {
        githubRepoId: number
        fullName: string
        name: string
        defaultBranch: string
        isPrivate: boolean
      }
      colorIndex: number
    }) => {
      const connected = await githubRepository.connectRepoToProject(
        params.projectId,
        params.connectionSourceId,
        params.repo,
        params.colorIndex,
      )
      githubRepository
        .syncRepo(connected.id)
        .catch((err) => console.error('[github] sync failed:', err))
      return connected
    },
    onSuccess: async (_data, params) => {
      await invalidateProjectGitHub(queryClient, params.projectId)
    },
  })
}

export function useDisconnectRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { repoId: string; projectId: string }) =>
      githubRepository.disconnectRepo(params.repoId),
    onSuccess: async (_data, params) => {
      await invalidateProjectGitHub(queryClient, params.projectId)
    },
  })
}

export function useSetProfileGitHubLoginMutation(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { githubLogin: string | null; userId: string }) =>
      githubRepository.setProfileGitHubLogin(
        organizationId,
        params.userId,
        params.githubLogin,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['github-identity-candidates', organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['org-members', organizationId],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'project-access',
        }),
        invalidateAllGitHubQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ])
    },
  })
}

export function useLinkCardToPR() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { cardId: string; prId: string }) =>
      githubRepository.linkCardToPR(params.cardId, params.prId),
    onSuccess: async (_data, params) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['card-github-links', params.cardId],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) && query.queryKey[0] === 'github-prs',
        }),
      ])
    },
  })
}

export function useUnlinkCardFromPR() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { cardId: string; prId: string }) =>
      githubRepository.unlinkCardFromPR(params.cardId, params.prId),
    onSuccess: async (_data, params) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['card-github-links', params.cardId],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) && query.queryKey[0] === 'github-prs',
        }),
      ])
    },
  })
}

export function projectCommitRollupsQueryOptions(
  projectId: string,
  from: string | null,
  to: string | null,
) {
  return queryOptions({
    queryFn: () =>
      from && to
        ? githubRepository.getCommitRollups(projectId, from, to)
        : Promise.resolve([]),
    queryKey: ['github-commit-rollups', projectId, from, to] as const,
    staleTime: 60_000,
  })
}

export function useUpdateAnalyticsSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      projectId: string
      settings: GitHubAnalyticsSettings
    }) => {
      await githubRepository.updateAnalyticsSettings(
        params.projectId,
        params.settings,
      )
    },
    onSuccess: async (_data, params) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['github-project-settings', params.projectId],
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'github-commit-rollups' &&
            query.queryKey[1] === params.projectId,
        }),
      ])
    },
  })
}

export function useUpdateGitHubBoardConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      projectViewId: string
      config: GitHubBoardConfig
    }) => {
      return githubRepository.setGitHubBoardConfig(
        params.projectViewId,
        params.config,
      )
    },
    onSuccess: async (_data, params) => {
      await queryClient.invalidateQueries({
        queryKey: ['github-board-config', params.projectViewId],
      })
    },
  })
}

async function invalidateProjectGitHub(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ['github-project-settings', projectId],
    }),
    queryClient.invalidateQueries({ queryKey: ['github-repos', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['github-prs', projectId] }),
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'github-analytics-prs' &&
        query.queryKey[1] === projectId,
    }),
    queryClient.invalidateQueries({ queryKey: ['github-summary', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['github-events', projectId] }),
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'github-review-events' &&
        query.queryKey[1] === projectId,
    }),
    queryClient.invalidateQueries({
      queryKey: ['github-project-cards', projectId],
    }),
  ])
}

export function invalidateAllGitHubQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      typeof query.queryKey[0] === 'string' &&
      query.queryKey[0].startsWith('github-'),
  })
}
