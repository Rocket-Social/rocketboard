import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Link2,
  RefreshCcw,
  Unlink,
  X,
} from 'lucide-react'

import type { CardRecord, ProjectStatusOption } from '../cards/card.types'
import type { ProjectMember } from '../access/access.types'
import type { ProjectSprintRecord } from '../sprints/sprint.types'
import { getErrorMessage } from '../../platform/data/rpc-adapter'
import { useToast } from '../../components/ui/toast'
import {
  organizationJiraStatusQueryOptions,
  projectJiraContributorStatsQueryOptions,
  projectJiraSettingsQueryOptions,
  useSetProjectJiraSource,
  useSyncProjectJiraStats,
} from '../jira/jira.queries'
import {
  buildGitHubHealthSnapshot,
  buildHistoricalTeamSnapshot,
  deriveSprintWindows,
  resolveAnalyticsSettings,
} from './github.analytics'
import {
  buildGitHubBoardSummary,
  getGitHubBoardRepositories,
  resolveGitHubBoardConfig,
} from './github.board-config'
import { githubRepository } from './github.repository'
import {
  gitHubBoardConfigQueryOptions,
  projectCommitRollupsQueryOptions,
  projectGitHubAnalyticsPullRequestsQueryOptions,
  projectGitHubCardsQueryOptions,
  projectGitHubReposQueryOptions,
  projectGitHubReviewEventsQueryOptions,
  projectGitHubSettingsQueryOptions,
  projectPullRequestsQueryOptions,
  useLinkCardToPR,
  useUnlinkCardFromPR,
  useUpdateAnalyticsSettings,
  useUpdateGitHubBoardConfig,
} from './github.queries'
import type {
  GitHubAnalyticsSettings,
  GitHubBoardConfig,
  GitHubBoardTab,
  GitHubPRFilters,
  GitHubPullRequest,
} from './github.types'
import {
  derivePRLifecycleState,
  emptyGitHubPRFilters,
  prLifecycleToKanbanColumn,
  PR_KANBAN_COLUMNS,
} from './github.types'
import { useGitHubRealtime } from './github.realtime'
import { GitHubEmptyState } from './components/GitHubEmptyState'
import { GitHubSummaryBar } from './components/GitHubSummaryBar'
import { PRCard } from './components/PRCard'
import { ProjectIntegrationsSettings } from './components/ProjectIntegrationsSettings'
import { ActivityFeedView } from './views/ActivityFeedView'
import { AnalyticsSettingsView } from './views/AnalyticsSettingsView'
import { HealthView } from './views/HealthView'
import {
  StatsView,
  type StatsSprintRangeOption,
  type StatsSprintRangeValue,
} from './views/StatsView'
import { TeamView } from './views/TeamView'

const STATS_SPRINT_RANGE_OPTIONS: StatsSprintRangeOption[] = [
  {label: 'Current', value: 'current'},
  {label: 'Last Sprint', value: 'last'},
  {label: 'Past 3', value: '3'},
  {label: 'Past 6', value: '6'},
  {label: 'Past 9', value: '9'},
  {label: 'Past 12', value: '12'},
]

type GitHubBoardPageProps = {
  canEditProject: boolean
  canManageProject: boolean
  cards: CardRecord[]
  currentUserId: string
  organizationId: string
  organizationSlug: string
  onCreateSprintClick?: () => void
  onStartSprint?: (sprintId: string) => void
  projectId: string
  projectViewId: string
  projectMembers: ProjectMember[]
  projectSprints: ProjectSprintRecord[]
  statusOptions: ProjectStatusOption[]
}

export function GitHubBoardPage({
  canEditProject,
  canManageProject,
  cards: _cards,
  currentUserId,
  organizationId,
  organizationSlug,
  onCreateSprintClick: _onCreateSprintClick,
  onStartSprint: _onStartSprint,
  projectId,
  projectViewId,
  projectMembers,
  projectSprints,
  statusOptions: _statusOptions,
}: GitHubBoardPageProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<GitHubBoardTab>('prs')
  const [filters, setFilters] = useState<GitHubPRFilters>(emptyGitHubPRFilters)
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [manageOpen, setManageOpen] = useState(false)
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null)
  const [activityRepoId, setActivityRepoId] = useState<string>('')
  const [activityEventType, setActivityEventType] = useState<string>('')
  const [cardSearch, setCardSearch] = useState('')
  const [selectedCardId, setSelectedCardId] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [sprintCount, setSprintCount] = useState(3)
  const [statsSprintRangeValue, setStatsSprintRangeValue] =
    useState<StatsSprintRangeValue>('current')
  const syncInFlightRef = useRef(false)
  const activeSprint = useMemo(
    () =>
      [...projectSprints]
        .filter((sprint) => sprint.status === 'active')
        .sort((left, right) => left.position - right.position)[0] ?? null,
    [projectSprints],
  )
  const analyticsRange = useMemo(() => {
    const now = new Date()
    const defaultFrom = addDays(now, -84)

    if (!activeSprint?.startDate) {
      return {
        from: defaultFrom.toISOString(),
        to: now.toISOString(),
      }
    }

    const sprintStart = new Date(`${activeSprint.startDate}T00:00:00`)
    const from =
      sprintStart.getTime() < defaultFrom.getTime()
        ? addDays(sprintStart, -42)
        : defaultFrom
    return {
      from: from.toISOString(),
      to: now.toISOString(),
    }
  }, [activeSprint])

  useGitHubRealtime({ projectId })

  const settingsQuery = useQuery(projectGitHubSettingsQueryOptions(projectId))
  const boardConfigQuery = useQuery(
    gitHubBoardConfigQueryOptions(projectViewId),
  )
  const reposQuery = useQuery(projectGitHubReposQueryOptions(projectId))
  const jiraStatusQuery = useQuery(organizationJiraStatusQueryOptions(organizationId))
  const jiraProjectSettingsQuery = useQuery(projectJiraSettingsQueryOptions(projectId))

  const projectSettings = settingsQuery.data
  const currentSource = projectSettings?.connectionSource ?? null
  const projectRepos = reposQuery.data ?? []
  const boardConfig = boardConfigQuery.data ?? resolveGitHubBoardConfig(null)
  const repos = useMemo(
    () =>
      getGitHubBoardRepositories({
        config: boardConfig,
        repositories: projectRepos,
      }),
    [boardConfig, projectRepos],
  )
  const boardRepoIds = useMemo(
    () => new Set(repos.map((repo) => repo.id)),
    [repos],
  )
  const hasSource = currentSource !== null
  const hasProjectRepos = projectRepos.length > 0
  const hasRepos = repos.length > 0
  const hasSelectedRepoMissing =
    boardConfig.repoMode === 'selected' &&
    boardConfig.selectedRepoId !== null &&
    repos.length === 0
  const requiresBoardRepoSelection =
    hasSource &&
    hasProjectRepos &&
    (boardConfig.repoMode === 'unconfigured' || hasSelectedRepoMissing)
  const canLoadBoardData =
    hasSource && hasProjectRepos && !requiresBoardRepoSelection

  const prsQuery = useQuery({
    ...projectPullRequestsQueryOptions(projectId),
    enabled: canLoadBoardData,
  })
  const analyticsPrsQuery = useQuery({
    ...projectGitHubAnalyticsPullRequestsQueryOptions(
      projectId,
      analyticsRange.from,
      analyticsRange.to,
    ),
    enabled: canLoadBoardData,
  })
  const cardsQuery = useQuery({
    ...projectGitHubCardsQueryOptions(projectId),
    enabled: canLoadBoardData && selectedPrId !== null,
  })
  const allPRs = useMemo(
    () =>
      (prsQuery.data ?? []).filter((pullRequest) =>
        boardRepoIds.has(pullRequest.repoId),
      ),
    [boardRepoIds, prsQuery.data],
  )
  const analyticsPRs = useMemo(
    () =>
      (analyticsPrsQuery.data ?? []).filter((pullRequest) =>
        boardRepoIds.has(pullRequest.repoId),
      ),
    [analyticsPrsQuery.data, boardRepoIds],
  )
  const allCards = cardsQuery.data ?? []
  const jiraSources = jiraStatusQuery.data?.sources ?? []
  const activeJiraSources = jiraSources.filter((source) => source.status === 'active')
  const hasJiraConnection = activeJiraSources.length > 0
  const projectJiraSettings = jiraProjectSettingsQuery.data ?? null
  const selectedJiraSourceId =
    projectJiraSettings?.connectionSourceId &&
    activeJiraSources.some((source) => source.id === projectJiraSettings.connectionSourceId)
      ? projectJiraSettings.connectionSourceId
      : (activeJiraSources[0]?.id ?? null)
  const configuredJiraProjectKey = projectJiraSettings?.jiraProjectKey ?? ''

  // Historical Team tab: analytics settings, sprint windows, and commit rollups
  const analyticsSettings = useMemo(
    () => resolveAnalyticsSettings(settingsQuery.data ?? null),
    [settingsQuery.data],
  )
  const historicalSprintWindows = useMemo(
    () => deriveSprintWindows(analyticsSettings, sprintCount),
    [analyticsSettings, sprintCount],
  )
  const historicalDateRange = useMemo(() => {
    if (historicalSprintWindows.length === 0) return { from: null, to: null }
    const oldest = historicalSprintWindows[historicalSprintWindows.length - 1]!
    const newest = historicalSprintWindows[0]!
    return { from: oldest.startDate, to: newest.endDate }
  }, [historicalSprintWindows])
  const statsSprintRange = useMemo(
    () =>
      resolveStatsSprintRange({
        activeSprint,
        selection: statsSprintRangeValue,
        settings: analyticsSettings,
      }),
    [activeSprint, analyticsSettings, statsSprintRangeValue],
  )
  const statsPullRequests = useMemo(
    () => filterPullRequestsForDateRange(allPRs, statsSprintRange.from, statsSprintRange.to),
    [allPRs, statsSprintRange.from, statsSprintRange.to],
  )
  const jiraStatsQuery = useQuery({
    ...projectJiraContributorStatsQueryOptions(
      projectId,
      statsSprintRange.from,
      statsSprintRange.to,
      selectedJiraSourceId,
    ),
    enabled: selectedJiraSourceId !== null,
  })
  const commitRollupsQuery = useQuery({
    ...projectCommitRollupsQueryOptions(
      projectId,
      historicalDateRange.from,
      historicalDateRange.to,
    ),
    enabled: canLoadBoardData,
  })
  const historicalAnalyticsPrsQuery = useQuery({
    ...projectGitHubAnalyticsPullRequestsQueryOptions(
      projectId,
      historicalDateRange.from ? `${historicalDateRange.from}T00:00:00Z` : null,
      historicalDateRange.to ? `${historicalDateRange.to}T23:59:59Z` : null,
    ),
    enabled: canLoadBoardData,
  })
  const historicalReviewEventsQuery = useQuery({
    ...projectGitHubReviewEventsQueryOptions(
      projectId,
      historicalDateRange.from ? `${historicalDateRange.from}T00:00:00Z` : null,
      historicalDateRange.to ? `${historicalDateRange.to}T23:59:59Z` : null,
    ),
    enabled: canLoadBoardData,
  })

  const updateAnalyticsSettingsMutation = useUpdateAnalyticsSettings()
  const updateBoardConfigMutation = useUpdateGitHubBoardConfig()
  const linkCardMutation = useLinkCardToPR()
  const unlinkCardMutation = useUnlinkCardFromPR()
  const syncJiraStatsMutation = useSyncProjectJiraStats()
  const setProjectJiraSourceMutation = useSetProjectJiraSource()

  const selectedPr = useMemo(
    () =>
      selectedPrId
        ? (allPRs.find((pr) => pr.id === selectedPrId) ?? null)
        : null,
    [allPRs, selectedPrId],
  )

  const filteredPRs = useMemo(() => {
    let result = allPRs

    if (filters.repoIds.length > 0) {
      result = result.filter((pr) => filters.repoIds.includes(pr.repoId))
    }

    if (filters.authorLogins.length > 0) {
      result = result.filter(
        (pr) => pr.authorLogin && filters.authorLogins.includes(pr.authorLogin),
      )
    }

    if (filters.search.trim()) {
      const searchLower = filters.search.toLowerCase()
      result = result.filter(
        (pr) =>
          pr.title.toLowerCase().includes(searchLower) ||
          pr.authorLogin?.toLowerCase().includes(searchLower) ||
          `#${pr.number}`.includes(searchLower) ||
          pr.linkedCards.some(
            (card) =>
              card.title.toLowerCase().includes(searchLower) ||
              `${card.projectCardNumber ?? ''}`.includes(searchLower),
          ),
      )
    }

    return result
  }, [allPRs, filters])

  const prsByColumn = useMemo(() => {
    const columns: Record<string, GitHubPullRequest[]> = {}

    for (const column of PR_KANBAN_COLUMNS) {
      columns[column.key] = []
    }

    for (const pr of filteredPRs) {
      const state = derivePRLifecycleState(pr)
      const column = prLifecycleToKanbanColumn(state)
      columns[column]?.push(pr)
    }

    return columns
  }, [filteredPRs])

  const repoMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; fullName: string; colorIndex: number }
    >()
    for (const repo of repos) {
      map.set(repo.id, {
        name: repo.name,
        fullName: repo.fullName,
        colorIndex: repo.colorIndex,
      })
    }
    return map
  }, [repos])

  const authorOptions = useMemo(() => {
    return [
      ...new Set(
        allPRs
          .map((pr) => pr.authorLogin)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort((left, right) => left.localeCompare(right))
  }, [allPRs])

  const lastSyncedAt = useMemo(() => {
    return (
      repos
        .map((repo) => repo.lastSyncedAt)
        .filter((value): value is string => Boolean(value))
        .sort(
          (left, right) => new Date(right).getTime() - new Date(left).getTime(),
        )[0] ?? null
    )
  }, [repos])

  const oldestSyncedAt = useMemo(() => {
    return (
      repos
        .map((repo) => repo.lastSyncedAt)
        .filter((value): value is string => Boolean(value))
        .sort(
          (left, right) => new Date(left).getTime() - new Date(right).getTime(),
        )[0] ?? null
    )
  }, [repos])

  const hasNeverSyncedRepo = useMemo(
    () => repos.some((repo) => repo.lastSyncedAt === null),
    [repos],
  )

  const staleData = useMemo(() => {
    if (hasNeverSyncedRepo) return true
    if (!oldestSyncedAt) return hasRepos
    return Date.now() - new Date(oldestSyncedAt).getTime() > 15 * 60 * 1000
  }, [hasNeverSyncedRepo, hasRepos, oldestSyncedAt])

  const historicalTeamSnapshot = useMemo(() => {
    const historicalPRs = (historicalAnalyticsPrsQuery.data ?? []).filter(
      (pullRequest) => boardRepoIds.has(pullRequest.repoId),
    )
    const historicalReviews = (historicalReviewEventsQuery.data ?? []).filter(
      (event) => boardRepoIds.has(event.repoId),
    )
    const rollups = (commitRollupsQuery.data ?? []).filter((rollup) =>
      boardRepoIds.has(rollup.repoId),
    )

    if (historicalPRs.length === 0 && rollups.length === 0) return null

    return buildHistoricalTeamSnapshot({
      analyticsPullRequests: historicalPRs,
      commitRollups: rollups,
      projectMembers: projectMembers.map((m) => ({
        userId: m.id,
        displayName: m.name ?? m.email ?? 'Unknown',
        githubLogin: m.githubLogin ?? null,
      })),
      repositories: repos,
      reviewEvents: historicalReviews,
      settings: analyticsSettings,
      sprintCount,
    })
  }, [
    historicalAnalyticsPrsQuery.data,
    historicalReviewEventsQuery.data,
    commitRollupsQuery.data,
    projectMembers,
    repos,
    analyticsSettings,
    sprintCount,
    boardRepoIds,
  ])

  const isHistoricalTeamLoading =
    historicalAnalyticsPrsQuery.isLoading ||
    commitRollupsQuery.isLoading ||
    historicalReviewEventsQuery.isLoading

  const handleSaveAnalyticsSettings = useCallback(
    async (settings: GitHubAnalyticsSettings) => {
      await updateAnalyticsSettingsMutation.mutateAsync({
        projectId,
        settings,
      })
    },
    [projectId, updateAnalyticsSettingsMutation],
  )

  const handleSaveBoardConfig = useCallback(
    async (config: GitHubBoardConfig) => {
      const savedConfig = await updateBoardConfigMutation.mutateAsync({
        config,
        projectViewId,
      })

      if (requiresBoardRepoSelection && savedConfig.repoMode !== 'unconfigured') {
        setActiveTab('prs')
        setManageOpen(false)
      }
    },
    [projectViewId, requiresBoardRepoSelection, updateBoardConfigMutation],
  )

  const healthSnapshot = useMemo(
    () =>
      buildGitHubHealthSnapshot({
        allPullRequests: allPRs,
        analyticsPullRequests: analyticsPRs,
        projectMembers,
        repositories: repos,
      }),
    [allPRs, analyticsPRs, projectMembers, repos],
  )
  const summary = useMemo(
    () => buildGitHubBoardSummary({ pullRequests: allPRs }),
    [allPRs],
  )

  useEffect(() => {
    if (activeTab !== 'prs' && selectedPrId !== null) {
      setSelectedPrId(null)
    }
  }, [activeTab, selectedPrId])

  useEffect(() => {
    if (!activityRepoId) return
    if (repos.some((repo) => repo.id === activityRepoId)) return
    setActivityRepoId('')
  }, [activityRepoId, repos])

  useEffect(() => {
    setFilters((current) => {
      if (current.repoIds.length === 0) {
        return current
      }

      const nextRepoIds = current.repoIds.filter((repoId) =>
        repos.some((repo) => repo.id === repoId),
      )
      if (nextRepoIds.length === current.repoIds.length) {
        return current
      }

      return {
        ...current,
        repoIds: nextRepoIds,
      }
    })
  }, [repos])

  const availableCardsForLinking = useMemo(() => {
    if (!selectedPr) return []

    const normalizedSearch = cardSearch.trim().toLowerCase()
    const linkedCardIds = new Set(selectedPr.linkedCards.map((card) => card.id))
    const candidates = allCards.filter((card) => !linkedCardIds.has(card.id))

    if (!normalizedSearch) {
      return candidates
    }

    return candidates.filter(
      (card) =>
        card.title.toLowerCase().includes(normalizedSearch) ||
        `${card.projectCardNumber ?? ''}`.includes(normalizedSearch),
    )
  }, [allCards, cardSearch, selectedPr])

  const invalidateBoardQueries = useEffectEvent(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['github-repos', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['github-prs', projectId] }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'github-analytics-prs' &&
          query.queryKey[1] === projectId,
      }),
      queryClient.invalidateQueries({ queryKey: ['github-events', projectId] }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'github-review-events' &&
          query.queryKey[1] === projectId,
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'github-commit-rollups' &&
          query.queryKey[1] === projectId,
      }),
    ])
  })

  const syncRepos = useEffectEvent(
    async (options?: { showToast?: boolean }) => {
      const showToast = options?.showToast ?? false
      if (repos.length === 0 || syncInFlightRef.current) return

      syncInFlightRef.current = true
      if (showToast) {
        setIsSyncing(true)
      }

      try {
        const results = await Promise.allSettled(
          repos.map((repo) => githubRepository.syncRepo(repo.id)),
        )
        const failed = results.filter((result) => result.status === 'rejected')
        await invalidateBoardQueries()

        if (failed.length === 0) {
          if (showToast) {
            toast({ title: 'GitHub sync complete' })
          }
          return
        }

        const message =
          failed[0]?.status === 'rejected'
            ? getErrorMessage(
                failed[0].reason,
                `${failed.length} repo sync${failed.length === 1 ? '' : 's'} failed.`,
              )
            : `${failed.length} repo sync${failed.length === 1 ? '' : 's'} failed.`

        if (showToast) {
          toast({
            description: message,
            title: 'GitHub sync partially failed',
          })
        } else {
          console.error('[github] background sync failed:', message)
        }
      } catch (error) {
        if (showToast) {
          toast({
            description: getErrorMessage(error),
            title: 'GitHub sync failed',
          })
        } else {
          console.error('[github] background sync failed:', error)
        }
      } finally {
        if (showToast) {
          setIsSyncing(false)
        }
        syncInFlightRef.current = false
      }
    },
  )

  useEffect(() => {
    if (!currentSource || repos.length === 0) return

    if (
      hasNeverSyncedRepo ||
      !lastSyncedAt ||
      Date.now() - new Date(lastSyncedAt).getTime() > 5 * 60 * 1000
    ) {
      void syncRepos()
    }

    const intervalId = window.setInterval(
      () => {
        void syncRepos()
      },
      5 * 60 * 1000,
    )

    return () => {
      window.clearInterval(intervalId)
    }
  }, [currentSource, hasNeverSyncedRepo, lastSyncedAt, repos.length, syncRepos])

  async function handleSyncAll() {
    if (repos.length === 0 || isSyncing) return
    await syncRepos({ showToast: true })
  }

  async function handleSyncJiraStats() {
    if (syncJiraStatsMutation.isPending) return
    if (!canManageProject) {
      toast({
        description: 'Only project admins can sync Jira stats.',
        title: 'Jira sync not allowed',
        variant: 'error',
      })
      return
    }
    if (!selectedJiraSourceId || !configuredJiraProjectKey) {
      toast({
        description: 'Choose a Jira site and project key before syncing Jira stats.',
        title: 'Jira project not configured',
        variant: 'error',
      })
      return
    }

    try {
      const result = await syncJiraStatsMutation.mutateAsync({
        connectionSourceId: selectedJiraSourceId,
        from: statsSprintRange.from,
        projectId,
        to: statsSprintRange.to,
      })
      toast({
        title: 'Jira sync complete',
        description: `${result.contributors} contributor${result.contributors === 1 ? '' : 's'} updated.`,
      })
    } catch (error) {
      toast({
        description: getErrorMessage(error, 'Could not sync Jira stats.'),
        title: 'Jira sync failed',
        variant: 'error',
      })
    }
  }

  async function handleSaveJiraSettings(input: {
    connectionSourceId: string
    jiraProjectKey: string
  }) {
    try {
      await setProjectJiraSourceMutation.mutateAsync({
        connectionSourceId: input.connectionSourceId,
        jiraProjectKey: input.jiraProjectKey,
        projectId,
      })
      toast({title: 'Jira project saved'})
    } catch (error) {
      toast({
        description: getErrorMessage(error, 'Could not save Jira project settings.'),
        title: 'Could not save Jira project',
        variant: 'error',
      })
    }
  }

  function handleAddJiraConnection() {
    window.location.href = `/org/${encodeURIComponent(organizationSlug)}/settings?tab=jira`
  }

  async function handleLinkCard() {
    if (!selectedPr || !selectedCardId) return

    try {
      await linkCardMutation.mutateAsync({
        cardId: selectedCardId,
        prId: selectedPr.id,
      })
      setSelectedCardId('')
      setCardSearch('')
      toast({ title: 'Task linked to PR' })
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not link task',
      })
    }
  }

  async function handleUnlinkCard(cardId: string) {
    if (!selectedPr) return

    try {
      await unlinkCardMutation.mutateAsync({ cardId, prId: selectedPr.id })
      toast({ title: 'Task unlinked from PR' })
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not unlink task',
      })
    }
  }

  if (
    (!hasSource || !hasProjectRepos) &&
    !settingsQuery.isLoading &&
    !reposQuery.isLoading
  ) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {!hasSource ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-base p-6">
              <h2
                className="text-xl font-semibold text-text-strong"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Connect this GitHub board
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Choose one GitHub source for this board, then add the
                repositories this project should watch.
              </p>
            </div>
          ) : null}
          <ProjectIntegrationsSettings
            canEditProject={canEditProject}
            currentUserId={currentUserId}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            projectId={projectId}
          />
        </div>
      </div>
    )
  }

  if (hasSource && hasProjectRepos && boardConfigQuery.isLoading) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-border-subtle bg-surface-base p-6 text-sm text-text-muted">
            Loading GitHub board settings…
          </div>
        </div>
      </div>
    )
  }

  if (requiresBoardRepoSelection) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div
            className="rounded-2xl border border-[#a13d34]/30 bg-[#a13d34]/5 p-6"
            role="alert"
          >
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#a13d34]" />
              <div>
                <h2
                  className="text-xl font-semibold text-[#7f2f28]"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  GitHub board is blocked
                </h2>
                <p className="mt-2 text-sm text-[#8f3a31]">
                  {hasSelectedRepoMissing
                    ? 'The repo selected for this board is no longer attached to the project.'
                    : 'This board has attached project repos, but it still needs a repo scope before PRs, activity, team, and health data can load.'}
                </p>
                <div className="mt-4 rounded-xl border border-[#a13d34]/20 bg-surface-base px-4 py-3 text-sm text-text-strong">
                  Missing: choose{' '}
                  <span className="font-semibold">All project repos</span> or{' '}
                  <span className="font-semibold">
                    One repo for this board,
                  </span>{' '}
                  then save the repo scope.
                </div>
              </div>
            </div>
          </div>

          <AnalyticsSettingsView
            boardConfig={boardConfig}
            canEditProject={canEditProject}
            onOpenProjectRepoManager={() =>
              setManageOpen((current) => !current)
            }
            onSave={handleSaveAnalyticsSettings}
            onSaveBoardConfig={handleSaveBoardConfig}
            projectRepositories={projectRepos}
            projectSettings={projectSettings ?? null}
          />

          {manageOpen ? (
            <ProjectIntegrationsSettings
              canEditProject={canEditProject}
              currentUserId={currentUserId}
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              projectId={projectId}
            />
          ) : null}
        </div>
      </div>
    )
  }

  const tabs: {
    disabled?: boolean
    key: GitHubBoardTab
    label: string
    title?: string
  }[] = [
    { key: 'prs', label: 'PRs' },
    { key: 'activity', label: 'Activity' },
    { key: 'team', label: 'Team' },
    { key: 'health', label: 'Health' },
    { key: 'stats', label: 'Stats' },
    { key: 'settings', label: 'Settings' },
  ]

  const boardScopeLabel =
    boardConfig.repoMode === 'all'
      ? 'All project repos'
      : (repos[0]?.fullName ?? '1 selected repo')
  const jiraStatsRows = jiraStatsQuery.data ?? []
  const effectiveActivityRepoId =
    activityRepoId ||
    (boardConfig.repoMode === 'selected' ? (repos[0]?.id ?? '') : '')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-base px-4 py-2">
        <div className="flex items-center gap-0.5 rounded-sm bg-canvas-accent p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`px-3 py-1 text-sm rounded-sm transition-colors ${
                tab.disabled ? 'cursor-not-allowed text-text-muted/60' : ''
              } ${
                activeTab === tab.key
                  ? 'bg-surface-elevated text-text-strong font-medium shadow-sm'
                  : 'text-text-medium hover:text-text-strong'
              }`}
              disabled={tab.disabled}
              onClick={() => setActiveTab(tab.key)}
              title={tab.title}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs text-text-muted lg:inline-flex">
            Repo scope: {boardScopeLabel}
          </span>
          {activeTab === 'prs' ? (
            <div className="flex items-center gap-0.5 rounded-sm bg-canvas-accent p-0.5">
              <button
                className={`px-2 py-1 text-xs rounded-sm ${viewMode === 'board' ? 'bg-surface-elevated text-text-strong shadow-sm' : 'text-text-medium'}`}
                onClick={() => setViewMode('board')}
                type="button"
              >
                Board
              </button>
              <button
                className={`px-2 py-1 text-xs rounded-sm ${viewMode === 'list' ? 'bg-surface-elevated text-text-strong shadow-sm' : 'text-text-medium'}`}
                onClick={() => setViewMode('list')}
                type="button"
              >
                List
              </button>
            </div>
          ) : null}

          <button
            className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs text-text-medium transition-colors hover:text-text-strong"
            onClick={() => void handleSyncAll()}
            type="button"
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            Sync Now
          </button>

          {canEditProject ? (
            <button
              className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs text-text-medium transition-colors hover:text-text-strong"
              onClick={() => setManageOpen((current) => !current)}
              type="button"
            >
              {manageOpen ? 'Hide Settings' : 'Manage Board'}
            </button>
          ) : null}
        </div>
      </div>

      {manageOpen ? (
        <div className="border-b border-border-subtle bg-canvas px-4 py-4">
          <ProjectIntegrationsSettings
            canEditProject={canEditProject}
            currentUserId={currentUserId}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            projectId={projectId}
          />
        </div>
      ) : null}

      {activeTab === 'prs' ? (
        <GitHubSummaryBar
          isLoading={prsQuery.isLoading}
          lastSyncedAt={lastSyncedAt}
          summary={summary}
        />
      ) : null}

      {staleData ? (
        <div className="border-b border-[#a86c0f]/20 bg-[#a86c0f]/5 px-4 py-2 text-sm text-[#8a5b10]">
          GitHub data may be stale.{' '}
          {hasNeverSyncedRepo
            ? 'One or more repos have never synced.'
            : oldestSyncedAt
              ? `Oldest repo sync: ${formatRelativeTime(oldestSyncedAt)}.`
              : 'Some repos have never synced.'}
        </div>
      ) : null}

      {activeTab === 'prs' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
          <input
            className="w-48 rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-secondary-accent"
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
            placeholder="Search PRs or linked tasks..."
            type="text"
            value={filters.search}
          />
          {repos.length > 1 ? (
            <select
              className="rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  repoIds: event.target.value ? [event.target.value] : [],
                }))
              }
              value={filters.repoIds.length === 1 ? filters.repoIds[0] : ''}
            >
              <option value="">All repos</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </select>
          ) : null}
          {authorOptions.length > 1 ? (
            <select
              className="rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  authorLogins: event.target.value ? [event.target.value] : [],
                }))
              }
              value={
                filters.authorLogins.length === 1 ? filters.authorLogins[0] : ''
              }
            >
              <option value="">All authors</option>
              {authorOptions.map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'activity' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
          {repos.length > 1 ? (
            <select
              className="rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm"
              onChange={(event) => setActivityRepoId(event.target.value)}
              value={activityRepoId}
            >
              <option value="">All repos</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className="rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm"
            onChange={(event) => setActivityEventType(event.target.value)}
            value={activityEventType}
          >
            <option value="">All activity</option>
            <option value="pr_opened">PR opened</option>
            <option value="pr_merged">PR merged</option>
            <option value="pr_closed">PR closed</option>
            <option value="review_submitted">Reviews</option>
            <option value="push">Pushes</option>
          </select>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto">
          {activeTab === 'prs' && viewMode === 'board' ? (
            <div className="flex h-full gap-4 overflow-x-auto p-4">
              {PR_KANBAN_COLUMNS.map((column) => {
                const columnPRs = prsByColumn[column.key] ?? []
                const isMergedColumn = column.key === 'merged'

                return (
                  <div key={column.key} className="w-72 flex-shrink-0">
                    <div className="mb-3 flex items-center gap-2 px-1">
                      <h3 className="text-sm font-medium text-text-medium">
                        {column.label}
                      </h3>
                      <span className="rounded-full bg-canvas-accent px-1.5 py-0.5 text-xs text-text-muted">
                        {columnPRs.length}
                      </span>
                    </div>
                    <div
                      className={`flex flex-col gap-2 ${isMergedColumn ? 'opacity-70' : ''}`}
                    >
                      {(isMergedColumn ? columnPRs.slice(0, 5) : columnPRs).map(
                        (pr) => (
                          <PRCard
                            key={pr.id}
                            onOpen={() => setSelectedPrId(pr.id)}
                            pr={pr}
                            repo={repoMap.get(pr.repoId)}
                          />
                        ),
                      )}
                      {isMergedColumn && columnPRs.length > 5 ? (
                        <p className="px-2 text-xs text-text-muted">
                          +{columnPRs.length - 5} more merged
                        </p>
                      ) : null}
                      {columnPRs.length === 0 ? (
                        <p className="px-2 py-4 text-xs text-text-muted">
                          No PRs
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {activeTab === 'prs' && viewMode === 'list' ? (
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-text-muted">
                    <th className="pb-2 font-medium">Title</th>
                    <th className="pb-2 font-medium">Repo</th>
                    <th className="pb-2 font-medium">Author</th>
                    <th className="pb-2 font-medium">Linked Tasks</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPRs
                    .slice()
                    .sort(
                      (left, right) =>
                        new Date(right.createdAt).getTime() -
                        new Date(left.createdAt).getTime(),
                    )
                    .map((pr) => {
                      const repo = repoMap.get(pr.repoId)
                      const state = derivePRLifecycleState(pr)
                      const ageLabel = formatAge(pr.createdAt)
                      return (
                        <tr
                          key={pr.id}
                          className="border-b border-border-subtle hover:bg-canvas-accent"
                        >
                          <td className="py-2 pr-4">
                            <button
                              className="text-left text-text-strong hover:underline"
                              onClick={() => setSelectedPrId(pr.id)}
                              type="button"
                            >
                              {pr.title}
                            </button>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-text-muted">
                            {repo?.name ?? '—'}
                          </td>
                          <td className="py-2 pr-4 text-text-medium">
                            {pr.authorLogin ?? '—'}
                          </td>
                          <td className="py-2 pr-4 text-text-medium">
                            {pr.linkedCards.length > 0
                              ? pr.linkedCards
                                  .map((card) =>
                                    card.projectCardNumber !== null
                                      ? `#${card.projectCardNumber}`
                                      : card.title,
                                  )
                                  .join(', ')
                              : '—'}
                          </td>
                          <td className="py-2 pr-4 capitalize text-text-medium">
                            {state.replace('_', ' ')}
                          </td>
                          <td className="py-2 font-mono text-xs text-text-muted">
                            {ageLabel}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>

              {filteredPRs.length === 0 ? (
                <GitHubEmptyState variant="no-prs" />
              ) : null}
            </div>
          ) : null}

          {activeTab === 'activity' ? (
            <ActivityFeedView
              eventType={activityEventType || null}
              projectId={projectId}
              repoId={effectiveActivityRepoId || null}
            />
          ) : null}

          {activeTab === 'team' ? (
            <TeamView
              isLoading={isHistoricalTeamLoading}
              organizationId={organizationId}
              snapshot={historicalTeamSnapshot}
              sprintCount={sprintCount}
              onSprintCountChange={setSprintCount}
            />
          ) : null}

          {activeTab === 'health' ? (
            <HealthView
              canEditProject={canEditProject}
              isLoading={analyticsPrsQuery.isLoading}
              isSyncing={isSyncing}
              onOpenBoardSettings={() => setActiveTab('settings')}
              onSyncNow={() => void handleSyncAll()}
              organizationId={organizationId}
              repositories={repos}
              snapshot={healthSnapshot}
            />
          ) : null}

          {activeTab === 'stats' ? (
            <StatsView
              canManageJira={canManageProject}
              hasJiraConnection={hasJiraConnection}
              isLoading={prsQuery.isLoading}
              isJiraLoading={
                jiraStatusQuery.isLoading ||
                jiraProjectSettingsQuery.isLoading ||
                jiraStatsQuery.isLoading
              }
              isSavingJiraSettings={setProjectJiraSourceMutation.isPending}
              isSyncingJira={syncJiraStatsMutation.isPending}
              jiraProjectKey={configuredJiraProjectKey}
              jiraSources={activeJiraSources}
              jiraStatsRows={jiraStatsRows}
              onAddJiraConnection={handleAddJiraConnection}
              onSaveJiraSettings={(input) => void handleSaveJiraSettings(input)}
              onSyncJira={() => void handleSyncJiraStats()}
              projectMembers={projectMembers}
              pullRequests={statsPullRequests}
              selectedJiraSourceId={selectedJiraSourceId}
              selectedSprintRange={statsSprintRangeValue}
              sprintRangeLabel={statsSprintRange.label}
              sprintRangeOptions={STATS_SPRINT_RANGE_OPTIONS}
              onSprintRangeChange={setStatsSprintRangeValue}
            />
          ) : null}

          {activeTab === 'settings' ? (
            <AnalyticsSettingsView
              boardConfig={boardConfig}
              canEditProject={canEditProject}
              onOpenProjectRepoManager={() =>
                setManageOpen((current) => !current)
              }
              projectSettings={projectSettings ?? null}
              onSave={handleSaveAnalyticsSettings}
              onSaveBoardConfig={handleSaveBoardConfig}
              projectRepositories={projectRepos}
            />
          ) : null}
        </div>

        {activeTab === 'prs' && selectedPr ? (
          <aside className="w-[360px] flex-shrink-0 border-l border-border-subtle bg-surface-base">
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-text-muted">
                  PR #{selectedPr.number}
                </div>
                <h3 className="mt-1 text-base font-semibold text-text-strong">
                  {selectedPr.title}
                </h3>
              </div>
              <button
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong"
                onClick={() => setSelectedPrId(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto p-4">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span>
                  {repoMap.get(selectedPr.repoId)?.fullName ?? 'Unknown repo'}
                </span>
                <a
                  className="inline-flex items-center gap-1 text-text-medium hover:text-text-strong"
                  href={selectedPr.htmlUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open on GitHub <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {selectedPr.body ? (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                    Description
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-text-medium">
                    {selectedPr.body}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                  Linked Tasks
                </div>
                <div className="space-y-2">
                  {selectedPr.linkedCards.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border-subtle px-3 py-3 text-sm text-text-muted">
                      No linked tasks yet.
                    </div>
                  ) : (
                    selectedPr.linkedCards.map((card) => (
                      <div
                        key={card.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle px-3 py-2"
                      >
                        <div className="min-w-0">
                          {card.projectCardNumber !== null ? (
                            <div className="text-sm font-medium text-text-strong">
                              #{card.projectCardNumber}
                            </div>
                          ) : null}
                          <div className="truncate text-xs text-text-muted">
                            {card.title}
                          </div>
                        </div>
                        <button
                          className="rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-[#a13d34]"
                          onClick={() => void handleUnlinkCard(card.id)}
                          type="button"
                        >
                          <Unlink className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                  Link Another Task
                </div>
                <input
                  className="w-full rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-secondary-accent"
                  onChange={(event) => setCardSearch(event.target.value)}
                  placeholder="Search tasks..."
                  type="text"
                  value={cardSearch}
                />
                <select
                  className="mt-2 w-full rounded-sm border border-border-subtle bg-surface-base px-2 py-1 text-sm"
                  onChange={(event) => setSelectedCardId(event.target.value)}
                  value={selectedCardId}
                >
                  <option value="">Select a task</option>
                  {availableCardsForLinking.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.projectCardNumber !== null
                        ? `#${card.projectCardNumber} `
                        : ''}
                      {card.title}
                    </option>
                  ))}
                </select>
                <button
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  disabled={!selectedCardId || linkCardMutation.isPending}
                  onClick={() => void handleLinkCard()}
                  type="button"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Link Task
                </button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function resolveStatsSprintRange(input: {
  activeSprint: ProjectSprintRecord | null
  selection: StatsSprintRangeValue
  settings: GitHubAnalyticsSettings
}) {
  if (input.selection === 'current') {
    const activeWindow = getActiveSprintWindow(input.activeSprint)
    if (activeWindow) {
      return {
        ...activeWindow,
        label: `${input.activeSprint?.name ?? 'Current sprint'} · ${formatDateRange(activeWindow.from, activeWindow.to)}`,
      }
    }
  }

  const count = input.selection === 'current' || input.selection === 'last'
    ? 1
    : Number(input.selection)
  const windows = deriveSprintWindows(input.settings, count)
  const newest = windows[0]
  const oldest = windows[windows.length - 1]

  if (!newest || !oldest) {
    const today = dateOnly(new Date())
    return {from: today, label: 'Today', to: today}
  }

  const labelPrefix =
    input.selection === 'current'
      ? 'Current sprint'
      : input.selection === 'last'
        ? 'Last sprint'
        : `Past ${count} sprints`

  return {
    from: oldest.startDate,
    label: `${labelPrefix} · ${formatDateRange(oldest.startDate, newest.endDate)}`,
    to: newest.endDate,
  }
}

function getActiveSprintWindow(activeSprint: ProjectSprintRecord | null) {
  if (!activeSprint?.startDate) return null
  return {
    from: activeSprint.startDate,
    to: activeSprint.endDate ?? dateOnly(new Date()),
  }
}

function filterPullRequestsForDateRange(
  pullRequests: GitHubPullRequest[],
  from: string,
  to: string,
) {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime()
  const toMs = new Date(`${to}T23:59:59.999Z`).getTime()
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return pullRequests

  return pullRequests.filter((pullRequest) => {
    const createdAt = new Date(pullRequest.createdAt).getTime()
    return Number.isFinite(createdAt) && createdAt >= fromMs && createdAt <= toMs
  })
}

function formatDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  return `${formatter.format(new Date(`${from}T12:00:00Z`))} - ${formatter.format(new Date(`${to}T12:00:00Z`))}`
}

function dateOnly(value: Date) {
  return value.toISOString().split('T')[0]!
}

function formatAge(createdAt: string) {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  if (ageDays === 0) return '<1d'
  return `${ageDays}d`
}

function formatRelativeTime(value: string) {
  const ageMs = Date.now() - new Date(value).getTime()
  const ageMinutes = Math.floor(ageMs / (1000 * 60))
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${ageMinutes}m ago`
  const ageHours = Math.floor(ageMinutes / 60)
  if (ageHours < 24) return `${ageHours}h ago`
  return `${Math.floor(ageHours / 24)}d ago`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}
