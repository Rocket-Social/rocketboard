import {getCreateSprintDateDefaults} from './sprint-date'
import type {CompleteSprintMoveTarget, ProjectSprintRecord} from './sprint.types'

function compareSprintOrder(left: ProjectSprintRecord, right: ProjectSprintRecord) {
  return left.position - right.position || left.createdAt.localeCompare(right.createdAt)
}

export function resolveCompleteSprintMoveTarget(
  projectSprints: ProjectSprintRecord[],
  sprintId: string,
): CompleteSprintMoveTarget {
  const orderedSprints = [...projectSprints].sort(compareSprintOrder)
  const currentSprintIndex = orderedSprints.findIndex((sprint) => sprint.id === sprintId)
  const plannedSprints = orderedSprints.filter(
    (sprint) => sprint.status === 'planned' && sprint.id !== sprintId,
  )
  const nextPlannedSprint = currentSprintIndex === -1
    ? null
    : orderedSprints
      .slice(currentSprintIndex + 1)
      .find((sprint) => sprint.status === 'planned' && sprint.id !== sprintId) ?? null

  if (nextPlannedSprint) {
    return {
      kind: 'existing',
      sprintId: nextPlannedSprint.id,
      sprintName: nextPlannedSprint.name,
    }
  }

  if (plannedSprints[0]) {
    return {
      kind: 'existing',
      sprintId: plannedSprints[0].id,
      sprintName: plannedSprints[0].name,
    }
  }

  const defaults = getCreateSprintDateDefaults(projectSprints)
  return {
    endDate: defaults.endDate,
    goal: null,
    kind: 'create',
    sprintName: `Sprint ${projectSprints.length + 1}`,
    startDate: defaults.startDate,
  }
}

export function formatCompleteSprintMoveTargetLabel(target: CompleteSprintMoveTarget): string {
  if (target.kind === 'existing') {
    return `Move incomplete tasks to ${target.sprintName}`
  }

  return `Create ${target.sprintName} and move incomplete tasks`
}
