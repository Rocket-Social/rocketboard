import {createContext, useContext, type ReactNode} from 'react'

import type {CreateCardInput} from '../../cards/card.types'

export type CompleteSprintDialogState = {
  incompleteCount: number
  sprintId: string
  sprintName: string
}

export type ProjectDialogContextValue = {
  isCardSheetOpen: boolean
  selectedCardId: string | null
  cardDefaults: Partial<CreateCardInput> | null
  openCard: (cardId: string) => Promise<boolean>
  openCardComposer: (defaults?: Partial<CreateCardInput>) => Promise<boolean>
  requestCloseCardSheet: () => Promise<boolean>
  setCardHasUnsavedChanges: (dirty: boolean) => void

  openFieldManager: () => void
  openAutomationManager: () => void
  openOrganizationAccess: () => void
  openProjectAccess: () => void
  openWorkspaceAccess: () => void

  openCreateSprintDialog: () => void
  openEditSprintDialog: (sprintId: string) => void
  openCompleteSprintDialog: (state: CompleteSprintDialogState) => void

  renameSprint: (sprintId: string, name: string) => void
  startSprint: (sprintId: string) => void

  surfaceActionError: string | null
  setSurfaceActionError: (error: string | null) => void
}

const ProjectDialogContext = createContext<ProjectDialogContextValue | null>(null)

export function ProjectDialogProvider({
  children,
  value,
}: {
  children: ReactNode
  value: ProjectDialogContextValue
}) {
  return <ProjectDialogContext.Provider value={value}>{children}</ProjectDialogContext.Provider>
}

export function useProjectDialogs(): ProjectDialogContextValue {
  const ctx = useContext(ProjectDialogContext)
  if (!ctx) throw new Error('useProjectDialogs must be used within ProjectDialogProvider')
  return ctx
}
