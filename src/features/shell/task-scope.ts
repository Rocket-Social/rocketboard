import {normalizeCardDateString} from '../cards/card-date'
import type {CardRecord, TaskBoardMode} from '../cards/card.types'
import {
  normalizeProjectViewDateRange,
  type OverviewDateRange,
} from '../projects/project-view.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'

export const maxTaskScopeSprintSelection = 3

export type TaskScopeDateWindow = {
  endDate: string
  startDate: string
}

export type TaskScopeFilter = {
  dateRange: OverviewDateRange
  includeBacklogInSprintScope?: boolean
  sprintIds: string[]
  taskMode: TaskBoardMode
}

function getSprintChronologyKey(sprint: ProjectSprintRecord) {
  return sprint.startDate
    ?? sprint.endDate
    ?? sprint.completedAt
    ?? normalizeCardDateString(sprint.createdAt)
    ?? '9999-12-31'
}

export function sortTaskScopeSprintsByChronology(sprints: ProjectSprintRecord[]) {
  return [...sprints].sort((left, right) => {
    const keyComparison = getSprintChronologyKey(left).localeCompare(getSprintChronologyKey(right))
    if (keyComparison !== 0) {
      return keyComparison
    }

    if (left.position !== right.position) {
      return left.position - right.position
    }

    return left.name.localeCompare(right.name)
  })
}

export function sortTaskScopeSprintsByRecency(sprints: ProjectSprintRecord[]) {
  return sortTaskScopeSprintsByChronology(sprints).reverse()
}

export function resolveCurrentTaskScopeSprint(sprints: ProjectSprintRecord[]) {
  const chronological = sortTaskScopeSprintsByChronology(sprints)
  const active = chronological.filter((sprint) => sprint.status === 'active')
  if (active.length > 0) {
    return active[active.length - 1] ?? null
  }

  const planned = chronological.filter((sprint) => sprint.status === 'planned')
  if (planned.length > 0) {
    return planned[0] ?? null
  }

  const completed = chronological.filter((sprint) => sprint.status === 'completed')
  return completed[completed.length - 1] ?? null
}

export function resolveDefaultTaskScopeSprintIds(sprints: ProjectSprintRecord[]) {
  const currentSprint = resolveCurrentTaskScopeSprint(sprints)
  return currentSprint ? [currentSprint.id] : []
}

export function resolveTaskScopeQuickSprints(sprints: ProjectSprintRecord[]) {
  const chronological = sortTaskScopeSprintsByChronology(sprints)
  const currentSprint = resolveCurrentTaskScopeSprint(chronological)
  if (!currentSprint) {
    return []
  }

  const currentIndex = chronological.findIndex((sprint) => sprint.id === currentSprint.id)
  const previousSprints = chronological
    .slice(0, currentIndex)
    .reverse()
    .slice(0, 2)

  return [
    {label: 'Current sprint', sprint: currentSprint},
    ...previousSprints.map((sprint, index) => ({
      label: index === 0 ? 'Previous sprint' : 'Two sprints ago',
      sprint,
    })),
  ]
}

export function normalizeTaskScopeSprintIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.flatMap((entry: unknown) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  ))).slice(0, maxTaskScopeSprintSelection)
}

export function hasTaskScopeDateWindow(range: OverviewDateRange) {
  const normalized = normalizeProjectViewDateRange(range)
  return Boolean(normalized.startDate && normalized.endDate)
}

export function filterCardsByTaskScope(cards: CardRecord[], filter: TaskScopeFilter) {
  if (filter.taskMode === 'sprint') {
    if (filter.sprintIds.length === 0) {
      return cards
    }

    const selectedSprintIds = new Set(filter.sprintIds)
    return cards.filter((card) => {
      if (filter.includeBacklogInSprintScope && card.sprintId === null) {
        return true
      }

      return card.sprintId !== null && selectedSprintIds.has(card.sprintId)
    })
  }

  const normalizedDateRange = normalizeProjectViewDateRange(filter.dateRange)
  if (!normalizedDateRange.startDate || !normalizedDateRange.endDate) {
    return cards
  }

  return cards.filter((card) => {
    if (!card.startAt && !card.dueAt) {
      return false
    }

    const cardStart = normalizeCardDateString(card.startAt ?? card.createdAt)
    if (!cardStart) {
      return false
    }

    const cardEnd = normalizeCardDateString(card.dueAt ?? card.startAt) ?? '9999-12-31'
    return cardStart <= normalizedDateRange.endDate! && cardEnd >= normalizedDateRange.startDate!
  })
}

export function resolveTaskScopeDateWindow(
  sprintIds: string[],
  sprints: ProjectSprintRecord[],
): TaskScopeDateWindow | null {
  if (sprintIds.length === 0) {
    return null
  }

  const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]))
  const datedSprints = sprintIds
    .map((sprintId) => sprintById.get(sprintId) ?? null)
    .filter((sprint): sprint is ProjectSprintRecord =>
      Boolean(sprint?.startDate && sprint.endDate),
    )

  if (datedSprints.length === 0) {
    return null
  }

  const startDate = datedSprints.reduce(
    (earliest, sprint) => earliest < sprint.startDate! ? earliest : sprint.startDate!,
    datedSprints[0]!.startDate!,
  )
  const endDate = datedSprints.reduce(
    (latest, sprint) => latest > sprint.endDate! ? latest : sprint.endDate!,
    datedSprints[0]!.endDate!,
  )

  return {endDate, startDate}
}
