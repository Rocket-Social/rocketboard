import type {CardRecord, ProjectStatusOption, StatusCategory} from './card.types'

const categoryOrder: Record<StatusCategory, number> = {
  not_started: 0,
  started: 1,
  completed: 2,
}

type CardCreatedAtOrderRecord = Pick<CardRecord, 'createdAt' | 'id'>
type CardGroupDisplayOrderRecord = Pick<CardRecord, 'groupPosition' | 'id'>
type CardStatusDisplayOrderRecord = Pick<CardRecord, 'createdAt' | 'id' | 'statusOptionId' | 'statusPosition'>

export function compareCardsByCreatedAt(left: CardCreatedAtOrderRecord, right: CardCreatedAtOrderRecord) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt.localeCompare(right.createdAt)
  }

  return left.id.localeCompare(right.id)
}

export function compareCardsByGroupPosition(left: CardGroupDisplayOrderRecord, right: CardGroupDisplayOrderRecord) {
  if (left.groupPosition !== right.groupPosition) {
    return left.groupPosition - right.groupPosition
  }

  return left.id.localeCompare(right.id)
}

function getOptionOrder(optionId: string | null, statusOptions: ProjectStatusOption[]): number {
  if (!optionId) return -1

  const option = statusOptions.find((o) => o.id === optionId)
  if (!option) return 999

  return categoryOrder[option.category] * 100 + option.position
}

export function makeCompareCardsByStatusDisplayOrder(statusOptions: ProjectStatusOption[]) {
  return function compareCardsByStatusDisplayOrder(
    left: CardStatusDisplayOrderRecord,
    right: CardStatusDisplayOrderRecord,
  ) {
    if (left.statusOptionId === right.statusOptionId && left.statusPosition !== right.statusPosition) {
      return left.statusPosition - right.statusPosition
    }

    const leftOrder = getOptionOrder(left.statusOptionId, statusOptions)
    const rightOrder = getOptionOrder(right.statusOptionId, statusOptions)
    const statusComparison = leftOrder - rightOrder

    if (statusComparison !== 0) {
      return statusComparison
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt)
    }

    if (left.statusPosition !== right.statusPosition) {
      return left.statusPosition - right.statusPosition
    }

    return left.id.localeCompare(right.id)
  }
}
