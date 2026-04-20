import {createContext, useContext, type ReactNode} from 'react'

import type {CardRecord, TaskBoardMode} from '../../cards/card.types'
import type {CustomFieldDefinition} from '../../fields/field.types'
import type {ProjectGroupRecord} from '../../projects/project-group.types'
import type {ProjectTableViewState} from '../../projects/project-view.types'
import type {DisplayProjectSprint} from '../../sprints/sprint-fallbacks'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'

export type ProjectDataContextValue = {
  cards: CardRecord[]
  customFields: CustomFieldDefinition[]
  projectGroups: ProjectGroupRecord[]
  displayProjectSprints: DisplayProjectSprint[]
  displayProjectSprintsInferred: boolean
  projectSprints: ProjectSprintRecord[]
  projectSprintsUnavailable: boolean
  projectTaskMode: TaskBoardMode
  projectTaskModeReady: boolean
  tableViewStates: Record<string, ProjectTableViewState>
  projectViewBackendUnavailable: boolean

  handleMoveCardToGroup: (
    cardId: string,
    targetGroupId: string | null,
    targetPosition?: number | null,
  ) => Promise<void>
  handleMoveCardToSprint: (cardId: string, targetSprintId: string | null) => Promise<boolean>
}

const ProjectDataContext = createContext<ProjectDataContextValue | null>(null)

export function ProjectDataProvider({
  children,
  value,
}: {
  children: ReactNode
  value: ProjectDataContextValue
}) {
  return <ProjectDataContext.Provider value={value}>{children}</ProjectDataContext.Provider>
}

export function useProjectData(): ProjectDataContextValue {
  const ctx = useContext(ProjectDataContext)
  if (!ctx) throw new Error('useProjectData must be used within ProjectDataProvider')
  return ctx
}
