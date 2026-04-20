import type {TaskBoardMode} from '../cards/card.types'
import type {ProjectSprintRecord} from './sprint.types'

const unavailableSprintTimestamp = '1970-01-01T00:00:00.000Z'

export type DisplayProjectSprint = ProjectSprintRecord & {
  displaySource?: 'inferred'
}

export function buildUnavailableProjectSprints(
  projectId: string,
  sprintIds: Array<string | null>,
): DisplayProjectSprint[] {
  const uniqueSprintIds = [...new Set(sprintIds.filter((sprintId): sprintId is string => sprintId !== null))]

  return uniqueSprintIds.map((id, index) => ({
    completedAt: null,
    createdAt: unavailableSprintTimestamp,
    displaySource: 'inferred',
    endDate: null,
    goal: null,
    id,
    name: uniqueSprintIds.length === 1 ? 'Sprint unavailable' : `Sprint unavailable ${index + 1}`,
    position: index,
    projectId,
    startDate: null,
    status: 'planned',
    updatedAt: unavailableSprintTimestamp,
  }))
}

export function resolveDisplayProjectSprints({
  cards,
  projectId,
  projectSprints,
  projectSprintsUnavailable,
  taskMode,
}: {
  cards: Array<{sprintId: string | null}>
  projectId: string
  projectSprints: ProjectSprintRecord[]
  projectSprintsUnavailable: boolean
  taskMode: TaskBoardMode
}) {
  const displayProjectSprints =
    taskMode === 'sprint' && projectSprintsUnavailable && projectSprints.length === 0
      ? buildUnavailableProjectSprints(projectId, cards.map((card) => card.sprintId))
      : projectSprints

  return {
    displayProjectSprints,
    displayProjectSprintsInferred: displayProjectSprints.some((sprint) => isInferredProjectSprint(sprint)),
  }
}

export function isInferredProjectSprint(
  sprint: ProjectSprintRecord | null | undefined,
): sprint is DisplayProjectSprint {
  return Boolean(sprint && 'displaySource' in sprint && sprint.displaySource === 'inferred')
}
