import {useNavigate, useRouter, Outlet} from '@tanstack/react-router'
import {Suspense, useEffect, useMemo} from 'react'

import {ConfirmDialog, PromptDialog} from '../../components/ui/confirm-dialog'
import {ErrorBoundary} from '../../components/ErrorBoundary'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {usePromptDialog} from '../../hooks/usePromptDialog'
import {useToast} from '../../components/ui/toast'
import {useCreateInitiativeMutation} from '../initiatives/initiative.queries'
import {useCreatePlanMutation} from '../plans/plan.queries'
import type {PlanViewType} from '../plans/plan.types'
import {WorkspaceCommandPalette} from '../search/WorkspaceCommandPalette'
import {useWorkspaceCommandPaletteController} from '../search/useWorkspaceCommandPaletteController'
import {createWorkspacePaletteNavigator} from '../search/workspace-palette-navigation'
import {AiChatDrawer} from '../ai/components/AiChatDrawer'
import {ProjectShellDialogs} from './ProjectShellDialogs'
import {ProjectShellHeader} from './ProjectShellHeader'
import {
  ToolbarPortalProvider,
  ToolbarArea as ToolbarAreaSlot,
} from './ToolbarSlot'
import {useSidebarShellState} from './SidebarShellStateContext'
import {useRegisterNavigationGuard} from './NavigationGuardContext'
import {runProjectSidebarNavigationGuard} from './project-sidebar-navigation'
import {
  buildWorkspaceInitiativesHref,
  buildWorkspacePlanHref,
} from './route-helpers'
import {buildWikiLocation, navigateWhenWarm} from './signed-in-navigation'
import {ViewSkeleton} from './views/ViewSkeletons'
import {
  ProjectChromeProvider,
  type ProjectChromeContextValue,
} from './project/ProjectChromeContext'
import {
  ProjectDataProvider,
  type ProjectDataContextValue,
} from './project/ProjectDataContext'
import {
  ProjectDialogProvider,
  type ProjectDialogContextValue,
} from './project/ProjectDialogContext'
import {useProjectCardSheet} from './project/useProjectCardSheet'
import {useProjectController} from './project/useProjectController'
import {useProjectDialogState} from './project/useProjectDialogState'
import {useProjectPaletteCommands} from './project/useProjectPaletteCommands'
import {useProjectSprintHandlers} from './project/useProjectSprintHandlers'
import {useProjectViewActions} from './project/useProjectViewActions'

function ShellLoadingState() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-sm text-text-medium">
      Loading...
    </div>
  )
}

function TaskModeUnavailableState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="grid flex-1 place-items-center p-6 text-center text-sm">
      <div>
        <p className="text-text-medium">Task mode unavailable. {message}</p>
        <button className="mt-3 underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  )
}

export function ProjectShellLayout() {
  const navigate = useNavigate()
  const router = useRouter()
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const {promptDialogProps} = usePromptDialog()
  const shellState = useSidebarShellState()

  const controller = useProjectController()
  const {
    orgSlug,
    workspaceSlug,
    projectSlug,
    activeViewId,
    activeViewTypeSegment,
    currentUser,
    workspaces,
    mode,
    workspace,
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
    currentOrgRole,
    activeAutomationCount,
    isShellBlocked,
    isSurfacePending,
    invalidateProjectData,
    handleMoveCardToGroup,
    handleMoveCardToSprint,
  } = controller

  const cardSheet = useProjectCardSheet({
    confirm,
    orgSlug,
    projectSlug,
    workspaceSlug,
    isResolvedProjectReady: Boolean(resolvedProject),
  })

  const dialogState = useProjectDialogState({
    orgSlug,
    workspaceSlug,
    projectSlug,
    workspaceOrganizationSlug: workspace?.organizationSlug,
    resolvedProject,
    confirmDiscardNavigationChanges: cardSheet.confirmDiscardNavigationChanges,
  })

  const viewActions = useProjectViewActions({
    orgSlug,
    workspaceSlug,
    projectSlug,
    projectId,
    canEditProject,
    projectViewBackendUnavailable,
    resolvedProject,
    activeViewId,
    workspaces,
    closeNavigationLayers: dialogState.closeNavigationLayers,
    confirmDiscardNavigationChanges: cardSheet.confirmDiscardNavigationChanges,
  })

  const sprintHandlers = useProjectSprintHandlers({
    projectId,
    projectSprints,
    editingSprintId: dialogState.editingSprintId,
    completeSprintState: dialogState.completeSprintState,
    setCompleteSprintState: dialogState.setCompleteSprintState,
  })

  const createPlanMutation = useCreatePlanMutation()
  const createInitiativeMutation = useCreateInitiativeMutation()

  const commandPaletteDisabled =
    dialogState.isAccountSettingsOpen ||
    dialogState.isAutomationManagerOpen ||
    cardSheet.isCardSheetOpen ||
    dialogState.createSprintDialogOpen ||
    dialogState.createPlanOpen ||
    dialogState.createInitiativeOpen ||
    dialogState.createProjectOpen ||
    dialogState.createWorkspaceOpen ||
    dialogState.completeSprintState !== null ||
    dialogState.isFieldManagerOpen

  const {
    closePalette,
    isOpen: isCommandPaletteOpen,
    openPalette,
  } = useWorkspaceCommandPaletteController({disabled: commandPaletteDisabled})

  const openCommandPalette = () => {
    dialogState.closeNavigationLayers()
    return openPalette()
  }

  // Close the workspace command palette when the active project changes.
  // The palette controller lives in the layout (not in a project/* hook), so
  // its reset has to live here too. Without this, switching projects while the
  // palette is open leaves a stale modal targeting the previous project.
  useEffect(() => {
    closePalette()
  }, [projectSlug, closePalette])

  useRegisterNavigationGuard(
    'project-unsaved-changes',
    cardSheet.confirmDiscardNavigationChanges,
  )

  const paletteNavigator = useMemo(
    () =>
      createWorkspacePaletteNavigator({
        currentOrgSlug: orgSlug,
        currentProjectSlug: projectSlug,
        currentWorkspaceSlug: workspaceSlug,
        navigateToRoute: viewActions.navigateToRoute,
        openCurrentCard: cardSheet.openCard,
        workspaces,
      }),
    [
      cardSheet.openCard,
      orgSlug,
      projectSlug,
      viewActions.navigateToRoute,
      workspaceSlug,
      workspaces,
    ],
  )

  const paletteCommands = useProjectPaletteCommands({
    canEditProject,
    currentOrgRole,
    resolvedProject,
    workspace,
    toast,
    openCardComposer: cardSheet.openCardComposer,
    openProjectAccess: dialogState.openProjectAccess,
    openProjectComposer: dialogState.openProjectComposer,
    openWorkspaceComposer: dialogState.openWorkspaceComposer,
    setIsFieldManagerOpen: dialogState.setIsFieldManagerOpen,
  })

  const handleCreatePlan = async (input: {
    planName: string
    viewTypes: PlanViewType[]
  }) => {
    if (!workspace) return
    try {
      const plan = await createPlanMutation.mutateAsync({
        name: input.planName,
        viewTypes: input.viewTypes,
        workspaceId: workspace.id,
      })
      dialogState.setCreatePlanOpen(false)
      void navigate({href: buildWorkspacePlanHref(orgSlug, workspaceSlug, plan.id)})
    } catch {
      toast({title: 'Could not create plan', variant: 'error'})
    }
  }

  const handleCreateInitiative = async (input: {initiativeName: string}) => {
    if (!workspace) return
    try {
      await createInitiativeMutation.mutateAsync({
        name: input.initiativeName,
        workspaceId: workspace.id,
      })
      dialogState.setCreateInitiativeOpen(false)
      void navigate({href: buildWorkspaceInitiativesHref(orgSlug, workspaceSlug)})
    } catch {
      toast({title: 'Could not create initiative', variant: 'error'})
    }
  }

  if (isShellBlocked || !workspace || !resolvedProject) {
    return <ShellLoadingState />
  }
  const currentWorkspace = workspace
  const currentProject = resolvedProject

  const beforeSidebarNavigate = async () =>
    runProjectSidebarNavigationGuard({
      closeNavigationLayers: dialogState.closeNavigationLayers,
      confirmDiscardNavigationChanges: cardSheet.confirmDiscardNavigationChanges,
    })

  const chromeValue: ProjectChromeContextValue = {
    workspace: currentWorkspace,
    workspaces,
    project: currentProject,
    projectId,
    currentUser,
    mode,
    canEditProject,
    currentOrgRole,
    projectAccessSnapshot,
    projectMembers,
    invalidateProjectData,
  }

  const dataValue: ProjectDataContextValue = {
    cards,
    customFields,
    projectGroups,
    displayProjectSprints,
    displayProjectSprintsInferred,
    projectSprints,
    projectSprintsUnavailable,
    projectTaskMode,
    projectTaskModeReady,
    tableViewStates,
    projectViewBackendUnavailable,
    handleMoveCardToGroup,
    handleMoveCardToSprint,
  }

  const dialogValue: ProjectDialogContextValue = {
    isCardSheetOpen: cardSheet.isCardSheetOpen,
    selectedCardId: cardSheet.selectedCardId,
    cardDefaults: cardSheet.cardDefaults,
    openCard: cardSheet.openCard,
    openCardComposer: cardSheet.openCardComposer,
    requestCloseCardSheet: cardSheet.requestCloseCardSheet,
    setCardHasUnsavedChanges: cardSheet.setCardHasUnsavedChanges,
    openFieldManager: dialogState.openFieldManager,
    openAutomationManager: dialogState.openAutomationManager,
    openOrganizationAccess: dialogState.openOrganizationAccess,
    openProjectAccess: dialogState.openProjectAccess,
    openWorkspaceAccess: dialogState.openWorkspaceAccess,
    openCreateSprintDialog: dialogState.openCreateSprintDialog,
    openEditSprintDialog: dialogState.openEditSprintDialog,
    openCompleteSprintDialog: dialogState.openCompleteSprintDialog,
    renameSprint: sprintHandlers.renameSprint,
    startSprint: sprintHandlers.startSprint,
    surfaceActionError: dialogState.surfaceActionError,
    setSurfaceActionError: dialogState.setSurfaceActionError,
  }

  const header = (
    <>
      <ProjectShellHeader
        activeAutomationCount={activeAutomationCount}
        activeViewId={activeViewId}
        onAddView={viewActions.handleAddProjectView}
        onAutomationManagerOpen={dialogState.openAutomationManager}
        onHideView={viewActions.handleHideProjectView}
        onMobileSidebarOpen={shellState.openMobileSidebar}
        onOpenAiChat={() => dialogState.setAiChatOpen(true)}
        onOpenCommandPalette={openCommandPalette}
        onRenameProject={viewActions.handleRenameProjectHeader}
        onRenameView={viewActions.handleRenameView}
        onReorderViews={viewActions.handleReorderViews}
        onRestoreView={viewActions.handleRestoreProjectView}
        onSelectView={viewActions.handleViewChange}
        onSetDefaultView={viewActions.handleSetDefaultView}
      />

      {projectSprintsUnavailable ? (
        <div className="border-b border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning sm:px-6">
          {projectSprintsErrorMessage ??
            'Project sprint history is temporarily unavailable. Your prior sprint was not deleted; Rocketboard could not refresh sprint data.'}
        </div>
      ) : null}
      {projectViewBackendUnavailable ? (
        <div className="border-b border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning sm:px-6">
          {projectViewBackendMessage ??
            'Project board settings are temporarily unavailable. Rocketboard loaded this project in read-only board mode for board configuration.'}
        </div>
      ) : null}
      {currentOrgRole === 'guest' ? (
        <div className="border-b border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning sm:px-6">
          You have guest access. View only. Ask an organization admin to upgrade your organization role if you need to create or edit tasks.
        </div>
      ) : null}
      {viewActions.projectViewActionError ? (
        <div className="border-b border-error/20 bg-error/10 px-4 py-3 text-sm text-error sm:px-6">
          {viewActions.projectViewActionError}
        </div>
      ) : null}

      <ToolbarAreaSlot />
    </>
  )

  const dialogs = (
    <>
      <WorkspaceCommandPalette
        activeViewId={activeViewId}
        commands={paletteCommands}
        currentProject={currentProject}
        currentWorkspace={currentWorkspace}
        isOpen={isCommandPaletteOpen}
        onClose={closePalette}
        onOpenProject={paletteNavigator.openProject}
        onOpenSearchCard={paletteNavigator.openSearchCard}
        onOpenSearchDocument={paletteNavigator.openSearchDocument}
        onOpenWikiPage={async (hit) => {
          if (!(await beforeSidebarNavigate())) {
            return false
          }
          void navigateWhenWarm({
            location: buildWikiLocation(currentWorkspace.organizationSlug, hit.fullPath),
            navigate,
            router,
          })
          return true
        }}
        onOpenWorkspace={paletteNavigator.openWorkspace}
        organizationId={currentWorkspace.organizationId}
        workspaces={workspaces}
      />

      <ProjectShellDialogs
        cardDefaults={cardSheet.cardDefaults}
        completeSprintState={dialogState.completeSprintState}
        createInitiativeOpen={dialogState.createInitiativeOpen}
        createPlanOpen={dialogState.createPlanOpen}
        createProjectOpen={dialogState.createProjectOpen}
        createSprintDateDefaults={sprintHandlers.createSprintDateDefaults}
        createSprintDialogOpen={dialogState.createSprintDialogOpen}
        createWorkspaceOpen={dialogState.createWorkspaceOpen}
        editingSprint={sprintHandlers.editingSprint}
        isAccountSettingsOpen={dialogState.isAccountSettingsOpen}
        isAutomationManagerOpen={dialogState.isAutomationManagerOpen}
        isCardSheetOpen={cardSheet.isCardSheetOpen}
        isFieldManagerOpen={dialogState.isFieldManagerOpen}
        onAccountSettingsClose={() => dialogState.setIsAccountSettingsOpen(false)}
        onAutomationManagerClose={() => dialogState.setIsAutomationManagerOpen(false)}
        onCardCreated={(cardId) => {
          cardSheet.setCardDefaults(null)
          cardSheet.setCardHasUnsavedChanges(false)
          cardSheet.setSelectedCardId(cardId)
        }}
        onCardDirtyStateChange={cardSheet.setCardHasUnsavedChanges}
        onCardSheetClose={cardSheet.closeCardSheet}
        onCompleteSprintAction={sprintHandlers.handleCompleteSprintAction}
        onCompleteSprintClose={() => dialogState.setCompleteSprintState(null)}
        onCreateInitiativeClose={() => dialogState.setCreateInitiativeOpen(false)}
        onCreatePlanClose={() => dialogState.setCreatePlanOpen(false)}
        onCreateProjectClose={() => dialogState.setCreateProjectOpen(false)}
        onCreateSprintClose={dialogState.closeCreateSprintDialog}
        onCreateWorkspaceClose={() => dialogState.setCreateWorkspaceOpen(false)}
        onFieldManagerClose={() => dialogState.setIsFieldManagerOpen(false)}
        onInitiativeCreate={handleCreateInitiative}
        onPlanCreate={handleCreatePlan}
        onProjectCreated={(route) => {
          dialogState.setCreateProjectOpen(false)
          void viewActions.navigateToRoute(route)
        }}
        onSubmitSprint={sprintHandlers.handleSubmitSprint}
        onWorkspaceCreated={(route) => {
          dialogState.setCreateWorkspaceOpen(false)
          void viewActions.navigateToRoute(route)
        }}
        selectedCardId={cardSheet.selectedCardId}
        workspaceId={currentWorkspace.id}
      />

      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps} /> : null}
      {promptDialogProps ? <PromptDialog {...promptDialogProps} /> : null}

      <AiChatDrawer
        isOpen={dialogState.aiChatOpen}
        onClose={() => dialogState.setAiChatOpen(false)}
        organizationId={currentWorkspace.organizationId}
        surface="project"
        surfaceContext={{
          cards: cards.slice(0, 50).map((c) => ({title: c.title})),
          projectName: currentProject.name,
          sprintName: projectSprints.find((s) => s.status === 'active')?.name ?? undefined,
        }}
        userId={currentUser.id}
      />
    </>
  )

  return (
    <ProjectChromeProvider value={chromeValue}>
      <ProjectDataProvider value={dataValue}>
        <ProjectDialogProvider value={dialogValue}>
          <ToolbarPortalProvider>
            <div className="flex min-h-0 flex-1 flex-col bg-canvas">
              {header}
              <ErrorBoundary label="View">
                {projectTaskModeErrorMessage ? (
                  <TaskModeUnavailableState
                    message={projectTaskModeErrorMessage}
                    onRetry={refetchProjectTaskMode}
                  />
                ) : isSurfacePending ? (
                  <ViewSkeleton viewType={activeViewTypeSegment} />
                ) : (
                  <Suspense fallback={<ViewSkeleton viewType={activeViewTypeSegment} />}>
                    <Outlet />
                  </Suspense>
                )}
              </ErrorBoundary>
            </div>
            {dialogs}
          </ToolbarPortalProvider>
        </ProjectDialogProvider>
      </ProjectDataProvider>
    </ProjectChromeProvider>
  )
}
