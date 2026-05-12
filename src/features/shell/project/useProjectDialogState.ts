import {useNavigate} from '@tanstack/react-router'
import {useCallback, useEffect, useState} from 'react'

import {useToast} from '../../../components/ui/toast'
import type {WorkspaceProjectSummary} from '../../projects/project-shell.types'
import {
  buildOrgSettingsHref,
  buildProjectBaseHref,
  buildWorkspaceAccessHref,
} from '../route-helpers'
import {useSidebarShellState} from '../SidebarShellStateContext'
import type {CompleteSprintDialogState} from './ProjectDialogContext'

export type ProjectDialogFlagsState = {
  // Raw booleans
  aiChatOpen: boolean
  isAccountSettingsOpen: boolean
  isAutomationManagerOpen: boolean
  isFieldManagerOpen: boolean
  createWorkspaceOpen: boolean
  createProjectOpen: boolean
  createPlanOpen: boolean
  createInitiativeOpen: boolean
  createSprintDialogOpen: boolean
  editingSprintId: string | null
  completeSprintState: CompleteSprintDialogState | null
  surfaceActionError: string | null

  // Setters (exposed for the layout to wire into dialog close/submit paths)
  setAiChatOpen: (open: boolean) => void
  setIsAccountSettingsOpen: (open: boolean) => void
  setIsAutomationManagerOpen: (open: boolean) => void
  setIsFieldManagerOpen: (open: boolean) => void
  setCreateWorkspaceOpen: (open: boolean) => void
  setCreateProjectOpen: (open: boolean) => void
  setCreatePlanOpen: (open: boolean) => void
  setCreateInitiativeOpen: (open: boolean) => void
  setCreateSprintDialogOpen: (open: boolean) => void
  setEditingSprintId: (id: string | null) => void
  setCompleteSprintState: (state: CompleteSprintDialogState | null) => void
  setSurfaceActionError: (error: string | null) => void

  // Close-navigation-layers helper (kept public so the layout can call it
  // alongside the command palette opener that sits outside this hook).
  closeNavigationLayers: () => void

  // High-level dialog openers — shaped for the dialog context surface.
  openFieldManager: () => void
  openAutomationManager: () => void
  openCreateSprintDialog: () => void
  openEditSprintDialog: (sprintId: string) => void
  closeCreateSprintDialog: () => void
  openCompleteSprintDialog: (state: CompleteSprintDialogState) => void
  openOrganizationAccess: () => boolean
  openWorkspaceAccess: () => boolean
  openProjectAccess: () => boolean

  // Composer openers — gated by the card-sheet unsaved-changes guard.
  openWorkspaceComposer: () => Promise<boolean>
  openProjectComposer: () => Promise<boolean>
}

/**
 * Owns pure dialog open flags + composer/access openers + the project-change
 * reset effect. Stateless relative to data and card-sheet.
 */
export function useProjectDialogState({
  canCreateWorkspace,
  orgSlug,
  workspaceSlug,
  projectSlug,
  workspaceOrganizationSlug,
  resolvedProject,
  confirmDiscardNavigationChanges,
}: {
  canCreateWorkspace: boolean
  orgSlug: string
  workspaceSlug: string
  projectSlug: string
  workspaceOrganizationSlug: string | undefined
  resolvedProject: WorkspaceProjectSummary | null
  confirmDiscardNavigationChanges: () => Promise<boolean>
}): ProjectDialogFlagsState {
  const navigate = useNavigate()
  const {toast} = useToast()
  const shellState = useSidebarShellState()

  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false)
  const [isAutomationManagerOpen, setIsAutomationManagerOpen] = useState(false)
  const [isFieldManagerOpen, setIsFieldManagerOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createPlanOpen, setCreatePlanOpen] = useState(false)
  const [createInitiativeOpen, setCreateInitiativeOpen] = useState(false)
  const [createSprintDialogOpen, setCreateSprintDialogOpen] = useState(false)
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null)
  const [completeSprintState, setCompleteSprintState] =
    useState<CompleteSprintDialogState | null>(null)
  const [surfaceActionError, setSurfaceActionError] = useState<string | null>(null)

  const closeNavigationLayers = useCallback(() => {
    shellState.closeMobileSidebar()
    setCreatePlanOpen(false)
    setCreateInitiativeOpen(false)
  }, [shellState])

  const openFieldManager = useCallback(() => setIsFieldManagerOpen(true), [])
  const openAutomationManager = useCallback(
    () => setIsAutomationManagerOpen(true),
    [],
  )
  const openCreateSprintDialog = useCallback(() => {
    setEditingSprintId(null)
    setCreateSprintDialogOpen(true)
  }, [])
  const openEditSprintDialog = useCallback((sprintId: string) => {
    setEditingSprintId(sprintId)
    setCreateSprintDialogOpen(true)
  }, [])
  const closeCreateSprintDialog = useCallback(() => {
    setCreateSprintDialogOpen(false)
    setEditingSprintId(null)
  }, [])
  const openCompleteSprintDialog = useCallback((state: CompleteSprintDialogState) => {
    setCompleteSprintState(state)
  }, [])

  const openWorkspaceComposer = useCallback(async () => {
    if (!canCreateWorkspace) {
      toast({
        title: 'Only organization admins can create workspaces',
        description:
          'Ask an organization admin to create the workspace or upgrade your organization role.',
        variant: 'error',
      })
      return false
    }

    if (!(await confirmDiscardNavigationChanges())) return false
    closeNavigationLayers()
    setCreateWorkspaceOpen(true)
    return true
  }, [canCreateWorkspace, closeNavigationLayers, confirmDiscardNavigationChanges, toast])

  const openProjectComposer = useCallback(async () => {
    if (!(await confirmDiscardNavigationChanges())) return false
    closeNavigationLayers()
    setCreateProjectOpen(true)
    return true
  }, [closeNavigationLayers, confirmDiscardNavigationChanges])

  const openOrganizationAccess = useCallback(() => {
    closeNavigationLayers()
    const targetOrgSlug = workspaceOrganizationSlug ?? orgSlug
    void navigate({href: `${buildOrgSettingsHref(targetOrgSlug)}?tab=members`})
    return true
  }, [closeNavigationLayers, navigate, orgSlug, workspaceOrganizationSlug])

  const openWorkspaceAccess = useCallback(() => {
    closeNavigationLayers()
    void navigate({href: buildWorkspaceAccessHref(orgSlug, workspaceSlug)})
    return true
  }, [closeNavigationLayers, navigate, orgSlug, workspaceSlug])

  const openProjectAccess = useCallback(() => {
    closeNavigationLayers()

    const overviewView =
      resolvedProject?.projectViews.find((view) => view.viewType === 'overview') ??
      null

    if (!overviewView) {
      toast({
        title: 'Project access lives on the Overview board',
        description: 'Restore or create an Overview board to manage project access.',
        variant: 'error',
      })
      return false
    }

    void navigate({
      href: `${buildProjectBaseHref(orgSlug, workspaceSlug, projectSlug)}/overview/${overviewView.id}?panel=access`,
    })
    return true
  }, [closeNavigationLayers, navigate, orgSlug, projectSlug, resolvedProject, toast, workspaceSlug])

  // Reset dialog state when the active project changes.
  //
  // Depend on the stable `closeMobileSidebar` callback, not the whole
  // `shellState` object. `useSharedShellState()` returns a fresh object
  // every render — using `shellState` as the dep made this effect re-fire
  // each render and immediately reset `mobileSidebarOpen` back to false
  // after any open call. End result: the mobile hamburger appeared not to
  // do anything (state flipped true, then this effect flipped it back).
  useEffect(() => {
    setIsFieldManagerOpen(false)
    setIsAutomationManagerOpen(false)
    setIsAccountSettingsOpen(false)
    setAiChatOpen(false)
    setCreateWorkspaceOpen(false)
    setCreateProjectOpen(false)
    setCreatePlanOpen(false)
    setCreateInitiativeOpen(false)
    setCreateSprintDialogOpen(false)
    setEditingSprintId(null)
    setCompleteSprintState(null)
    setSurfaceActionError(null)
    shellState.closeMobileSidebar()
  }, [projectSlug, shellState.closeMobileSidebar])

  return {
    aiChatOpen,
    isAccountSettingsOpen,
    isAutomationManagerOpen,
    isFieldManagerOpen,
    createWorkspaceOpen,
    createProjectOpen,
    createPlanOpen,
    createInitiativeOpen,
    createSprintDialogOpen,
    editingSprintId,
    completeSprintState,
    surfaceActionError,
    setAiChatOpen,
    setIsAccountSettingsOpen,
    setIsAutomationManagerOpen,
    setIsFieldManagerOpen,
    setCreateWorkspaceOpen,
    setCreateProjectOpen,
    setCreatePlanOpen,
    setCreateInitiativeOpen,
    setCreateSprintDialogOpen,
    setEditingSprintId,
    setCompleteSprintState,
    setSurfaceActionError,
    closeNavigationLayers,
    openFieldManager,
    openAutomationManager,
    openCreateSprintDialog,
    openEditSprintDialog,
    closeCreateSprintDialog,
    openCompleteSprintDialog,
    openOrganizationAccess,
    openWorkspaceAccess,
    openProjectAccess,
    openWorkspaceComposer,
    openProjectComposer,
  }
}
