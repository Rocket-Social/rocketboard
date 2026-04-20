import {useNavigate, useRouter} from '@tanstack/react-router'
import {useCallback, useEffect, useState} from 'react'

import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useRenameProjectMutation} from '../../projects/project-metadata.queries'
import type {WorkspaceProjectSummary, WorkspaceSummary} from '../../projects/project-shell.types'
import {
  emptyShellRoutePath,
  getDefaultProjectRoute,
  resolveProjectRouteTarget,
} from '../../projects/project-shell.routes'
import type {ProjectViewType} from '../../projects/project-view.model'
import {
  useCreateProjectViewMutation,
  useRenameProjectViewMutation,
  useReorderProjectViewsMutation,
  useSetDefaultProjectViewMutation,
  useSetProjectViewHiddenMutation,
} from '../../projects/project-view-nav.queries'
import {
  buildProjectRouteHref,
} from '../../search/workspace-palette-navigation'
import {buildWorkspaceBaseHref, viewTypeToSegment} from '../route-helpers'
import {navigateWhenWarm} from '../signed-in-navigation'

type ProjectRoute = {
  orgSlug: string
  projectSlug: string
  viewId: string
  viewType?: string
  workspaceSlug: string
}

export type ProjectViewActions = {
  projectViewActionError: string | null
  setProjectViewActionError: (error: string | null) => void

  navigateToView: (viewId: string, viewType: string) => void
  handleViewChange: (viewId: string) => void
  navigateToRoute: (route: ProjectRoute) => Promise<boolean>

  handleAddProjectView: (viewType: ProjectViewType) => void
  handleHideProjectView: (projectViewId: string) => void
  handleRestoreProjectView: (projectViewId: string) => void
  handleRenameView: (projectViewId: string, name: string) => void
  handleReorderViews: (orderedVisibleViewIds: string[]) => void
  handleSetDefaultView: (projectViewId: string) => void

  handleRenameProjectHeader: (name: string) => void
}

export function useProjectViewActions({
  orgSlug,
  workspaceSlug,
  projectSlug,
  projectId,
  canEditProject,
  projectViewBackendUnavailable,
  resolvedProject,
  activeViewId,
  workspaces,
  closeNavigationLayers,
  confirmDiscardNavigationChanges,
}: {
  orgSlug: string
  workspaceSlug: string
  projectSlug: string
  projectId: string
  canEditProject: boolean
  projectViewBackendUnavailable: boolean
  resolvedProject: WorkspaceProjectSummary | null
  activeViewId: string
  workspaces: WorkspaceSummary[]
  closeNavigationLayers: () => void
  confirmDiscardNavigationChanges: () => Promise<boolean>
}): ProjectViewActions {
  const navigate = useNavigate()
  const router = useRouter()
  const [projectViewActionError, setProjectViewActionError] = useState<string | null>(null)

  const createProjectViewMutation = useCreateProjectViewMutation(
    workspaceSlug,
    projectSlug,
    projectId,
  )
  const renameProjectViewMutation = useRenameProjectViewMutation(
    workspaceSlug,
    projectSlug,
    projectId,
  )
  const reorderProjectViewsMutation = useReorderProjectViewsMutation(
    workspaceSlug,
    projectSlug,
    projectId,
  )
  const setDefaultProjectViewMutation = useSetDefaultProjectViewMutation(
    workspaceSlug,
    projectSlug,
    projectId,
  )
  const setProjectViewHiddenMutation = useSetProjectViewHiddenMutation(
    workspaceSlug,
    projectSlug,
    projectId,
  )
  const renameProjectMutation = useRenameProjectMutation()

  const reportProjectViewMutationError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      setProjectViewActionError(getErrorMessage(error, fallbackMessage))
    },
    [],
  )

  const navigateToView = useCallback(
    (viewId: string, viewType: string) => {
      const segment = viewTypeToSegment(viewType as ProjectViewType)
      void navigate({
        href: `${buildWorkspaceBaseHref(orgSlug, workspaceSlug)}/projects/${projectSlug}/${segment}/${viewId}`,
      })
    },
    [navigate, orgSlug, workspaceSlug, projectSlug],
  )

  const handleViewChange = useCallback(
    (viewId: string) => {
      if (!resolvedProject) return
      const view = resolvedProject.projectViews.find((v) => v.id === viewId)
      if (!view) return
      navigateToView(viewId, view.viewType)
    },
    [resolvedProject, navigateToView],
  )

  const navigateToResolvedRoute = useCallback(
    async (route: ProjectRoute) => {
      const resolvedRoute =
        resolveProjectRouteTarget(workspaces, route) ??
        getDefaultProjectRoute(workspaces)

      if (resolvedRoute) {
        const href = buildProjectRouteHref(resolvedRoute)
        await navigateWhenWarm({
          label: href,
          location: {href},
          navigate,
          router,
        })
      } else {
        void navigate({to: emptyShellRoutePath})
      }
      return true
    },
    [navigate, router, workspaces],
  )

  const navigateToRoute = useCallback(
    async (route: ProjectRoute) => {
      if (!(await confirmDiscardNavigationChanges())) return false
      closeNavigationLayers()
      return navigateToResolvedRoute(route)
    },
    [closeNavigationLayers, confirmDiscardNavigationChanges, navigateToResolvedRoute],
  )

  const visibleProjectViews =
    resolvedProject?.projectViews.filter((view) => !view.isHidden) ?? []

  const handleAddProjectView = useCallback(
    (viewType: ProjectViewType) => {
      if (projectViewBackendUnavailable) return
      if (!canEditProject) {
        setProjectViewActionError('Project write access is required to add boards.')
        return
      }
      setProjectViewActionError(null)
      void createProjectViewMutation
        .mutateAsync(viewType)
        .then((view) => {
          if (view?.id) {
            navigateToView(view.id, viewType)
          }
        })
        .catch((error) => {
          reportProjectViewMutationError(error, 'The board could not be created.')
        })
    },
    [
      canEditProject,
      createProjectViewMutation,
      navigateToView,
      projectViewBackendUnavailable,
      reportProjectViewMutationError,
    ],
  )

  const handleHideProjectView = useCallback(
    (projectViewId: string) => {
      if (projectViewBackendUnavailable) return
      if (!canEditProject) {
        setProjectViewActionError('Project write access is required to hide boards.')
        return
      }
      const targetView =
        resolvedProject?.projectViews.find((view) => view.id === projectViewId) ??
        null
      const fallbackView = visibleProjectViews.find(
        (view) => view.id !== projectViewId,
      )
      const shouldNavigateImmediately =
        activeViewId === projectViewId && fallbackView
      setProjectViewActionError(null)

      if (shouldNavigateImmediately) {
        navigateToView(fallbackView.id, fallbackView.viewType)
      }

      void setProjectViewHiddenMutation
        .mutateAsync({hidden: true, projectViewId})
        .catch((error) => {
          if (shouldNavigateImmediately && targetView) {
            navigateToView(targetView.id, targetView.viewType)
          }
          reportProjectViewMutationError(error, 'The board could not be hidden.')
        })
    },
    [
      activeViewId,
      canEditProject,
      navigateToView,
      projectViewBackendUnavailable,
      reportProjectViewMutationError,
      resolvedProject,
      setProjectViewHiddenMutation,
      visibleProjectViews,
    ],
  )

  const handleRestoreProjectView = useCallback(
    (projectViewId: string) => {
      if (projectViewBackendUnavailable) return
      if (!canEditProject) {
        setProjectViewActionError(
          'Project write access is required to restore boards.',
        )
        return
      }
      const targetView =
        resolvedProject?.projectViews.find((view) => view.id === projectViewId) ??
        null
      const previousActiveView =
        resolvedProject?.projectViews.find((view) => view.id === activeViewId) ??
        null
      setProjectViewActionError(null)
      if (targetView) {
        navigateToView(targetView.id, targetView.viewType)
      }

      void setProjectViewHiddenMutation
        .mutateAsync({hidden: false, projectViewId})
        .catch((error) => {
          if (previousActiveView) {
            navigateToView(previousActiveView.id, previousActiveView.viewType)
          }
          reportProjectViewMutationError(error, 'The board could not be restored.')
        })
    },
    [
      activeViewId,
      canEditProject,
      navigateToView,
      projectViewBackendUnavailable,
      reportProjectViewMutationError,
      resolvedProject,
      setProjectViewHiddenMutation,
    ],
  )

  const handleRenameView = useCallback(
    (projectViewId: string, name: string) => {
      if (projectViewBackendUnavailable || !canEditProject) return
      setProjectViewActionError(null)
      void renameProjectViewMutation
        .mutateAsync({name, projectViewId})
        .catch((error) => {
          reportProjectViewMutationError(error, 'The view name could not be updated.')
        })
    },
    [
      canEditProject,
      projectViewBackendUnavailable,
      renameProjectViewMutation,
      reportProjectViewMutationError,
    ],
  )

  const handleReorderViews = useCallback(
    (orderedVisibleViewIds: string[]) => {
      if (projectViewBackendUnavailable || !canEditProject) return
      setProjectViewActionError(null)
      void reorderProjectViewsMutation
        .mutateAsync(orderedVisibleViewIds)
        .catch((error) => {
          reportProjectViewMutationError(error, 'The view order could not be updated.')
        })
    },
    [
      canEditProject,
      projectViewBackendUnavailable,
      reorderProjectViewsMutation,
      reportProjectViewMutationError,
    ],
  )

  const handleSetDefaultView = useCallback(
    (projectViewId: string) => {
      if (projectViewBackendUnavailable || !canEditProject) return
      setProjectViewActionError(null)
      void setDefaultProjectViewMutation
        .mutateAsync(projectViewId)
        .catch((error) => {
          reportProjectViewMutationError(error, 'The default board could not be updated.')
        })
    },
    [
      canEditProject,
      projectViewBackendUnavailable,
      reportProjectViewMutationError,
      setDefaultProjectViewMutation,
    ],
  )

  const handleRenameProjectHeader = useCallback(
    (name: string) => {
      if (!canEditProject) return
      renameProjectMutation.mutate({name, projectId})
    },
    [canEditProject, projectId, renameProjectMutation],
  )

  // Clear the view-mutation error banner when the active project changes.
  useEffect(() => {
    setProjectViewActionError(null)
  }, [projectSlug])

  return {
    projectViewActionError,
    setProjectViewActionError,
    navigateToView,
    handleViewChange,
    navigateToRoute,
    handleAddProjectView,
    handleHideProjectView,
    handleRestoreProjectView,
    handleRenameView,
    handleReorderViews,
    handleSetDefaultView,
    handleRenameProjectHeader,
  }
}
