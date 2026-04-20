import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useParams, useRouterState} from '@tanstack/react-router'
import {useCallback, useMemo} from 'react'

import {useMode, type Mode} from '../../../app/mode'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useProjectAccessQuery} from '../../access/access.queries'
import type {OrganizationRole, ProjectAccessSnapshot, ProjectMember} from '../../access/access.types'
import type {SessionUser} from '../../auth/data'
import {useProjectAutomationsQuery} from '../../automations/automation.queries'
import type {CardRecord, TaskBoardMode} from '../../cards/card.types'
import {runMoveCardToGroupMutation} from '../../cards/card.queries'
import type {CustomFieldDefinition} from '../../fields/field.types'
import {patchProjectCards} from '../../projects/project-data.cache'
import type {ProjectGroupRecord} from '../../projects/project-group.types'
import {
  invalidateAllProjectData,
  useProjectCardsQuery,
  useProjectFieldsQuery,
  projectGroupsQueryOptions,
  projectSprintsQueryOptions,
  projectStatusOptionsQueryOptions,
  projectPriorityOptionsQueryOptions,
  projectTableViewStatesQueryOptions,
} from '../../projects/project-shell.queries'
import {useProjectRealtime} from '../../projects/project-shell.realtime'
import type {WorkspaceProjectSummary, WorkspaceSummary} from '../../projects/project-shell.types'
import {useProjectTaskModeQuery} from '../../projects/project-task-mode.queries'
import type {ProjectTableViewState} from '../../projects/project-view.types'
import {
  shouldBlockProjectShell,
  shouldShowProjectShellSurfaceSkeleton,
} from '../project-layout-loading'
import {useSignedInAppFrame} from '../SignedInAppFrame'
import {sprintRepository} from '../../sprints/sprint.repository'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {resolveDisplayProjectSprints, type DisplayProjectSprint} from '../../sprints/sprint-fallbacks'
import {
  isSprintMembershipMutationBlocked,
  sprintReassignmentUnavailableMessage,
} from '../../sprints/sprint-mutation-guard'

export type ResolvedProject = WorkspaceProjectSummary

export type ProjectControllerState = {
  // Route params
  orgSlug: string
  workspaceSlug: string
  projectSlug: string
  activeViewId: string
  activeViewTypeSegment: string | undefined

  // Frame
  currentUser: SessionUser
  workspaces: WorkspaceSummary[]
  mode: Mode

  // Project identity (may be undefined when deep-linking into a missing project)
  workspace: WorkspaceSummary | undefined
  project: WorkspaceProjectSummary | undefined
  resolvedProject: ResolvedProject | null
  projectId: string

  // Data
  cards: CardRecord[]
  customFields: CustomFieldDefinition[]
  projectGroups: ProjectGroupRecord[]
  displayProjectSprints: DisplayProjectSprint[]
  displayProjectSprintsInferred: boolean
  projectSprints: ProjectSprintRecord[]
  projectSprintsErrorMessage: string | null
  projectSprintsUnavailable: boolean
  projectTaskMode: TaskBoardMode
  projectTaskModeReady: boolean
  projectTaskModeErrorMessage: string | null
  refetchProjectTaskMode: () => void
  tableViewStates: Record<string, ProjectTableViewState>
  projectViewBackendUnavailable: boolean
  projectViewBackendMessage: string | null

  // Access / automations
  projectAccessSnapshot: ProjectAccessSnapshot | null
  projectMembers: ProjectMember[]
  canEditProject: boolean
  canManageProject: boolean
  currentOrgRole: OrganizationRole | null
  activeAutomationCount: number

  // Loading gate
  isShellBlocked: boolean
  isSurfacePending: boolean

  // Cross-surface handlers
  invalidateProjectData: () => Promise<void>
  handleMoveCardToGroup: (
    cardId: string,
    targetGroupId: string | null,
    targetPosition?: number | null,
  ) => Promise<void>
  handleMoveCardToSprint: (cardId: string, targetSprintId: string | null) => Promise<boolean>
}

export function useProjectController(): ProjectControllerState {
  const queryClient = useQueryClient()
  const {toast} = useToast()
  const {mode} = useMode()
  const {currentUser, workspaces} = useSignedInAppFrame()

  const allParams = useParams({strict: false}) as {
    orgSlug: string
    projectSlug: string
    viewId?: string
    workspaceSlug: string
  }
  const {orgSlug, workspaceSlug, projectSlug} = allParams
  const activeViewId = allParams.viewId ?? ''

  const activeViewTypeSegment = useRouterState({
    select: (s) => {
      const segments = s.location.pathname.split('/')
      const projectsIdx = segments.indexOf('projects')
      return projectsIdx >= 0 && segments.length > projectsIdx + 2
        ? segments[projectsIdx + 2]
        : undefined
    },
  })

  const workspace = workspaces?.find(
    (w) => w.organizationSlug === orgSlug && w.slug === workspaceSlug,
  )
  const project = workspace?.projects.find((p) => p.slug === projectSlug)
  const projectId = project?.id ?? ''
  const enabled = Boolean(projectId)

  const cardsQuery = useProjectCardsQuery(projectId, {enabled})
  const fieldsQuery = useProjectFieldsQuery(projectId, {enabled})
  const statusQuery = useQuery({...projectStatusOptionsQueryOptions(projectId), enabled})
  const priorityQuery = useQuery({...projectPriorityOptionsQueryOptions(projectId), enabled})
  const groupsQuery = useQuery({...projectGroupsQueryOptions(projectId), enabled})
  const projectTaskModeQuery = useProjectTaskModeQuery(projectId, {enabled})
  const sprintsQuery = useQuery({...projectSprintsQueryOptions(projectId), enabled})
  const tableViewStatesQuery = useQuery({
    ...projectTableViewStatesQueryOptions(projectId),
    enabled,
  })

  const cards = cardsQuery.data ?? []
  const customFields = fieldsQuery.data ?? []
  const projectGroups = groupsQuery.data ?? []
  const projectTaskMode = projectTaskModeQuery.taskMode ?? 'standard'
  const projectTaskModeReady = projectTaskModeQuery.isReady
  const projectTaskModeErrorMessage = projectTaskModeQuery.isError
    ? getErrorMessage(projectTaskModeQuery.error, 'Try again.')
    : null
  const refetchProjectTaskMode = useCallback(() => {
    void projectTaskModeQuery.refetch()
  }, [projectTaskModeQuery])
  const projectSprints = sprintsQuery.data ?? []
  const projectSprintsUnavailable = sprintsQuery.isError
  const projectSprintsErrorMessage = sprintsQuery.isError
    ? `Project sprint history is temporarily unavailable. ${getErrorMessage(sprintsQuery.error, 'Try again.')}`
    : null
  const {
    displayProjectSprints,
    displayProjectSprintsInferred,
  } = useMemo(() => resolveDisplayProjectSprints({
    cards,
    projectId,
    projectSprints,
    projectSprintsUnavailable,
    taskMode: projectTaskMode,
  }), [cards, projectId, projectSprints, projectSprintsUnavailable, projectTaskMode])
  const tableViewStatesResult = tableViewStatesQuery.data
  const tableViewStates = tableViewStatesResult?.tableViewStates ?? {}
  const projectViewBackendUnavailable =
    tableViewStatesResult?.projectViewBackend?.status === 'unavailable'
  const projectViewBackendMessage =
    tableViewStatesResult?.projectViewBackend?.message ?? null

  const projectAccessQuery = useProjectAccessQuery(projectId)
  const automationsQuery = useProjectAutomationsQuery(projectId)
  const projectAccessSnapshot = projectAccessQuery.data ?? null
  const projectMembers = projectAccessSnapshot?.collaborators ?? []
  const canEditProject = projectAccessSnapshot?.canEditProject ?? false
  const canManageProject = projectAccessSnapshot?.canManageProject ?? false
  const currentOrgRole = projectAccessSnapshot?.currentOrgRole ?? null
  const activeAutomationCount =
    automationsQuery.data?.filter((rule) => rule.status === 'active').length ?? 0

  const resolvedProject = useMemo<ResolvedProject | null>(() => {
    if (!project) return null
    return {
      ...project,
      statusOptions: statusQuery.data ?? project.statusOptions ?? [],
      priorityOptions: priorityQuery.data ?? project.priorityOptions ?? [],
    }
  }, [project, statusQuery.data, priorityQuery.data])

  useProjectRealtime({projectId})

  const invalidateProjectData = useCallback(async () => {
    await invalidateAllProjectData(queryClient, projectId)
  }, [projectId, queryClient])

  const handleMoveCardToGroup = useCallback(
    async (
      cardId: string,
      targetGroupId: string | null,
      targetPosition?: number | null,
    ) => {
      await runMoveCardToGroupMutation(queryClient, {
        cardId,
        projectId,
        targetGroupId,
        targetPosition,
      })
    },
    [queryClient, projectId],
  )

  const handleMoveCardToSprint = useCallback(
    async (cardId: string, targetSprintId: string | null) => {
      const card = cards.find((entry) => entry.id === cardId)
      const previousSprintId = card?.sprintId ?? null

      if (previousSprintId === targetSprintId) return true

      if (isSprintMembershipMutationBlocked({
        displayProjectSprintsInferred,
        previousSprintId,
        targetSprintId,
      })) {
        toast({title: sprintReassignmentUnavailableMessage, variant: 'error'})
        return false
      }

      patchProjectCards(queryClient, projectId, (cs) =>
        cs.map((e) => (e.id === cardId ? {...e, sprintId: targetSprintId} : e)),
      )

      try {
        await sprintRepository.setCardSprint(cardId, targetSprintId)
        return true
      } catch (error) {
        patchProjectCards(queryClient, projectId, (cs) =>
          cs.map((e) => (e.id === cardId ? {...e, sprintId: previousSprintId} : e)),
        )
        console.error('[move-card-to-sprint] Failed:', error)
        toast({title: 'Could not move task to sprint', variant: 'error'})
        return false
      }
    },
    [cards, displayProjectSprintsInferred, queryClient, projectId, toast],
  )

  const isShellBlocked = shouldBlockProjectShell({
    fieldsPending: false,
    hasResolvedProject: Boolean(resolvedProject),
    hasWorkspace: Boolean(workspace),
    isAuthenticated: true,
    priorityPending: false,
    sessionPending: false,
    statusPending: false,
    workspacesPending: false,
  })
  const isSurfacePending = shouldShowProjectShellSurfaceSkeleton({
    cardsPending:
      cardsQuery.isPending ||
      fieldsQuery.isPending ||
      statusQuery.isPending ||
      priorityQuery.isPending,
    groupsPending: groupsQuery.isPending,
    sprintsPending: sprintsQuery.isPending,
    tableViewStatesPending: tableViewStatesQuery.isPending,
  })

  return {
    orgSlug,
    workspaceSlug,
    projectSlug,
    activeViewId,
    activeViewTypeSegment,
    currentUser,
    workspaces: workspaces ?? [],
    mode,
    workspace,
    project,
    resolvedProject,
    projectId,
    cards,
    customFields,
    projectGroups,
    displayProjectSprints,
    displayProjectSprintsInferred,
    projectSprints,
    projectSprintsErrorMessage,
    projectSprintsUnavailable,
    projectTaskMode,
    projectTaskModeReady,
    projectTaskModeErrorMessage,
    refetchProjectTaskMode,
    tableViewStates,
    projectViewBackendUnavailable,
    projectViewBackendMessage,
    projectAccessSnapshot,
    projectMembers,
    canEditProject,
    canManageProject,
    currentOrgRole,
    activeAutomationCount,
    isShellBlocked,
    isSurfacePending,
    invalidateProjectData,
    handleMoveCardToGroup,
    handleMoveCardToSprint,
  }
}
