import {
  compareCardsByCreatedAt,
  compareCardsByGroupPosition,
  makeCompareCardsByStatusDisplayOrder,
} from './card-display-order'
import {compareEffortValues} from './effort'
import type {CardRecord, ProjectPriorityOption, ProjectStatusOption} from './card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import {
  type ProjectTableFilters,
  type ProjectTableViewDraft,
} from '../projects/project-view.types'

function compareTableDates(left: string | null, right: string | null) {
  if (left === right) {
    return 0
  }

  if (!left) {
    return 1
  }

  if (!right) {
    return -1
  }

  return left.localeCompare(right)
}

export function compareTextValues(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: 'asc' | 'desc',
) {
  const normalizedLeft = left?.trim() ?? ''
  const normalizedRight = right?.trim() ?? ''

  if (!normalizedLeft && !normalizedRight) {
    return 0
  }

  if (!normalizedLeft) {
    return 1
  }

  if (!normalizedRight) {
    return -1
  }

  const comparison = normalizedLeft.localeCompare(normalizedRight)
  return direction === 'desc' ? comparison * -1 : comparison
}

export function compareDateValues(
  left: string | null,
  right: string | null,
  direction: 'asc' | 'desc',
) {
  const comparison = compareTableDates(left, right)

  if (comparison === 0) {
    return 0
  }

  if (!left || !right) {
    return comparison
  }

  return direction === 'desc' ? comparison * -1 : comparison
}

function compareDueDateValues(
  left: string | null,
  right: string | null,
  direction: 'asc' | 'desc',
) {
  if (left === right) {
    return 0
  }

  if (direction === 'asc') {
    if (!left) {
      return 1
    }

    if (!right) {
      return -1
    }

    return left.localeCompare(right)
  }

  if (!left) {
    return -1
  }

  if (!right) {
    return 1
  }

  return right.localeCompare(left)
}

export function compareNumberValues(
  left: number | null,
  right: number | null,
  direction: 'asc' | 'desc',
) {
  const comparison = compareEffortValues(left, right)

  if (comparison === 0) {
    return 0
  }

  if (left == null || right == null) {
    return comparison
  }

  return direction === 'desc' ? comparison * -1 : comparison
}

export function compareRankValues(left: number, right: number, direction: 'asc' | 'desc') {
  const comparison = left - right
  return direction === 'desc' ? comparison * -1 : comparison
}

export function compareSingleSelectValues(
  field: CustomFieldDefinition,
  leftOptionId: string | null | undefined,
  rightOptionId: string | null | undefined,
  direction: 'asc' | 'desc',
) {
  const optionLabelById = new Map(field.options.map((option) => [option.id, option.label]))
  const optionRankById = new Map(field.options.map((option, index) => [option.id, index]))
  const leftRank = leftOptionId ? optionRankById.get(leftOptionId) ?? null : null
  const rightRank = rightOptionId ? optionRankById.get(rightOptionId) ?? null : null

  if (leftRank != null || rightRank != null) {
    return compareNumberValues(leftRank, rightRank, direction)
  }

  return compareTextValues(
    leftOptionId ? optionLabelById.get(leftOptionId) ?? leftOptionId : null,
    rightOptionId ? optionLabelById.get(rightOptionId) ?? rightOptionId : null,
    direction,
  )
}

function compareGroupValues(
  projectGroups: ProjectGroupRecord[],
  leftGroupId: string | null,
  rightGroupId: string | null,
  direction: 'asc' | 'desc',
) {
  const rankById = new Map(projectGroups.map((group) => [group.id, group.position]))
  const leftRank = leftGroupId ? rankById.get(leftGroupId) ?? null : null
  const rightRank = rightGroupId ? rankById.get(rightGroupId) ?? null : null

  if (leftRank != null || rightRank != null) {
    return compareNumberValues(leftRank, rightRank, direction)
  }

  return compareTextValues(leftGroupId, rightGroupId, direction)
}

function compareCustomFieldValues(
  left: CardRecord,
  right: CardRecord,
  field: CustomFieldDefinition,
  direction: 'asc' | 'desc',
) {
  const leftValue = left.customFieldValues[field.key]
  const rightValue = right.customFieldValues[field.key]

  switch (field.fieldType) {
    case 'date':
      return compareDateValues(leftValue?.dateValue ?? null, rightValue?.dateValue ?? null, direction)
    case 'number':
      return compareNumberValues(leftValue?.numberValue ?? null, rightValue?.numberValue ?? null, direction)
    case 'single_select':
      return compareSingleSelectValues(field, leftValue?.optionId, rightValue?.optionId, direction)
    case 'text':
      return compareTextValues(leftValue?.textValue ?? null, rightValue?.textValue ?? null, direction)
    default:
      return 0
  }
}

function buildStatusSortRank(statusOptions: ProjectStatusOption[]): Map<string | null, number> {
  const categoryOrder: Record<string, number> = {not_started: 0, started: 1, completed: 2}
  const rankMap = new Map<string | null, number>()
  rankMap.set(null, -1)

  for (const option of statusOptions) {
    rankMap.set(option.id, (categoryOrder[option.category] ?? 0) * 100 + option.position)
  }

  return rankMap
}

function buildPrioritySortRank(priorityOptions: ProjectPriorityOption[]): Map<string, number> {
  const rankMap = new Map<string, number>()

  for (const option of priorityOptions) {
    rankMap.set(option.id, option.sortOrder)
  }

  return rankMap
}

function comparePriorityValues(
  leftPriorityOptionId: string | null,
  rightPriorityOptionId: string | null,
  priorityOptions: ProjectPriorityOption[],
  direction: 'asc' | 'desc',
) {
  const priorityRank = buildPrioritySortRank(priorityOptions)
  const leftRank = leftPriorityOptionId ? priorityRank.get(leftPriorityOptionId) ?? null : null
  const rightRank = rightPriorityOptionId ? priorityRank.get(rightPriorityOptionId) ?? null : null

  if (leftRank == null || rightRank == null) {
    if (leftRank == null && rightRank == null) return 0
    return leftRank == null ? 1 : -1
  }

  return compareRankValues(leftRank, rightRank, direction)
}

function compareByField(
  left: CardRecord,
  right: CardRecord,
  fieldKey: string,
  direction: 'asc' | 'desc',
  customFieldByKey: Map<string, CustomFieldDefinition>,
  projectGroups: ProjectGroupRecord[],
  statusOptions: ProjectStatusOption[],
  priorityOptions: ProjectPriorityOption[],
): number {
  switch (fieldKey) {
    case 'assignee':
      return compareTextValues(left.assigneeUserId ? left.assigneeName : null, right.assigneeUserId ? right.assigneeName : null, direction)
    case 'due_date':
      return compareDueDateValues(left.dueAt, right.dueAt, direction)
    case 'effort':
      return compareNumberValues(left.effort, right.effort, direction)
    case 'group':
      return compareGroupValues(projectGroups, left.groupId, right.groupId, direction)
    case 'priority':
      return comparePriorityValues(left.priorityOptionId, right.priorityOptionId, priorityOptions, direction)
    case 'start_date':
      return compareDateValues(left.startAt, right.startAt, direction)
    case 'status': {
      const statusRank = buildStatusSortRank(statusOptions)
      return compareRankValues(statusRank.get(left.statusOptionId) ?? -1, statusRank.get(right.statusOptionId) ?? -1, direction)
    }
    case 'tags':
      return compareTextValues(left.tags.length > 0 ? left.tags.join(', ') : null, right.tags.length > 0 ? right.tags.join(', ') : null, direction)
    case 'title':
      return compareTextValues(left.title, right.title, direction)
    default:
      return customFieldByKey.has(fieldKey)
        ? compareCustomFieldValues(left, right, customFieldByKey.get(fieldKey)!, direction)
        : 0
  }
}

export function sortCards(
  cards: CardRecord[],
  sorts: ProjectTableViewDraft['sort'],
  customFields: CustomFieldDefinition[],
  options: {
    fallbackOrder?: 'createdAt' | 'group' | 'status'
    groupBy?: ProjectTableViewDraft['groupBy']
    priorityOptions?: ProjectPriorityOption[]
    projectGroups?: ProjectGroupRecord[]
    statusOptions?: ProjectStatusOption[]
  } = {},
): CardRecord[] {
  if (sorts.length === 0) return cards

  const customFieldByKey = new Map(customFields.map((field) => [field.key, field]))
  const groupBy = options.groupBy ?? 'status'
  const fallbackOrder = options.fallbackOrder
    ?? (groupBy === 'group' ? 'group' : groupBy === 'status' ? 'status' : 'createdAt')
  const priorityOptions = options.priorityOptions ?? []
  const projectGroups = options.projectGroups ?? []
  const statusOptions = options.statusOptions ?? []
  const compareByStatus = makeCompareCardsByStatusDisplayOrder(statusOptions)

  return [...cards].sort((left, right) => {
    for (const sort of sorts) {
      const comparison = compareByField(left, right, sort.fieldKey, sort.direction, customFieldByKey, projectGroups, statusOptions, priorityOptions)
      if (comparison !== 0) return comparison
    }

    if (fallbackOrder === 'group') {
      const groupComparison = compareCardsByGroupPosition(left, right)
      return groupComparison !== 0 ? groupComparison : compareCardsByCreatedAt(left, right)
    }

    if (fallbackOrder === 'createdAt') {
      return compareCardsByCreatedAt(left, right)
    }

    return compareByStatus(left, right)
  })
}

export function applyTableViewDraftToCards(
  cards: CardRecord[],
  draft: {filters: ProjectTableFilters},
) {
  return cards.filter((card) => {
    const statusMatch =
      draft.filters.status.length === 0 || (card.statusOptionId !== null && draft.filters.status.includes(card.statusOptionId))
    const priorityMatch =
      draft.filters.priority.length === 0 || (card.priorityOptionId !== null && draft.filters.priority.includes(card.priorityOptionId))

    return statusMatch && priorityMatch
  })
}
