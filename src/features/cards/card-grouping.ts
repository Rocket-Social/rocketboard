import type {ProjectGroupRecord} from '../projects/project-group.types'

import type {TableGroupBy, TaskBoardMode} from './card.types'

export function ignoresProjectGroups(taskMode: TaskBoardMode) {
  return taskMode === 'sprint'
}

export function usesProjectGroupBuckets(groupBy: TableGroupBy, taskMode: TaskBoardMode) {
  return groupBy === 'group' && !ignoresProjectGroups(taskMode)
}

export function usesFlatSprintGrouping(groupBy: TableGroupBy, taskMode: TaskBoardMode) {
  return groupBy === 'group' && ignoresProjectGroups(taskMode)
}

export function getProjectGroupsForTaskMode(projectGroups: ProjectGroupRecord[], taskMode: TaskBoardMode) {
  return ignoresProjectGroups(taskMode) ? [] : projectGroups
}

export function getGroupByMenuLabel(taskMode: TaskBoardMode) {
  return ignoresProjectGroups(taskMode) ? 'None' : undefined
}

export function shouldHideProjectGroupField(groupBy: TableGroupBy, taskMode: TaskBoardMode) {
  return groupBy === 'group' || ignoresProjectGroups(taskMode)
}

export function canMoveTasksWithinGroupView(groupBy: TableGroupBy, taskMode: TaskBoardMode) {
  return groupBy === 'status' || usesProjectGroupBuckets(groupBy, taskMode)
}
