import type {ProjectTableGroup} from '../../cards/card-view-mappers'
import type {TaskBoardMode} from '../../cards/card.types'

export function getVisibleTableTaskIds(
  tableGroups: ProjectTableGroup[],
  expandedGroups: string[],
  taskMode: TaskBoardMode,
): string[] {
  const visibleTaskIds: string[] = []
  const expandedGroupIdSet = new Set(expandedGroups)

  for (const group of tableGroups) {
    const isFlat = group.kind === 'flat'
    const isRootSprintGroup = taskMode === 'sprint' && (group.kind === 'sprint' || group.kind === 'backlog')
    const parentExpanded = !group.parentGroupId || expandedGroupIdSet.has(group.parentGroupId)

    if (!parentExpanded) {
      continue
    }

    const expanded = expandedGroupIdSet.has(group.id)

    if ((expanded || isFlat) && !isRootSprintGroup) {
      visibleTaskIds.push(...group.tasks.map((task) => task.id))
    }
  }

  return visibleTaskIds
}

export function toggleTableTaskSelection(
  selectedTaskIds: string[],
  taskId: string,
  visibleTaskIds: string[],
  shiftKey?: boolean,
): string[] {
  if (shiftKey && selectedTaskIds.length > 0) {
    const lastSelectedId = selectedTaskIds[selectedTaskIds.length - 1]
    const sourceIndex = visibleTaskIds.indexOf(lastSelectedId)
    const destinationIndex = visibleTaskIds.indexOf(taskId)

    if (sourceIndex !== -1 && destinationIndex !== -1) {
      const [start, end] = sourceIndex < destinationIndex
        ? [sourceIndex, destinationIndex]
        : [destinationIndex, sourceIndex]
      const rangeIds = visibleTaskIds.slice(start, end + 1)
      return Array.from(new Set([...selectedTaskIds, ...rangeIds]))
    }
  }

  return selectedTaskIds.includes(taskId)
    ? selectedTaskIds.filter((id) => id !== taskId)
    : [...selectedTaskIds, taskId]
}
