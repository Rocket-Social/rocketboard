import type {TaskBoardMode} from '../cards/card.types'
import type {OverviewDateRange} from '../projects/project-view.types'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {OverviewDateRangePicker} from './OverviewDateRangePicker'
import {SprintMultiPicker} from './SprintMultiPicker'
import {SprintPicker} from './SprintPicker'

type TaskScopeToolbarControlProps = {
  dateRange: OverviewDateRange
  isSprintHistoryUnavailable?: boolean
  onDateRangeChange: (dateRange: OverviewDateRange) => void
  onSprintIdsChange: (sprintIds: string[]) => void
  sprintIds: string[]
  sprintPickerMode?: 'multi' | 'single'
  sprints: ProjectSprintRecord[]
  taskMode: TaskBoardMode
}

export function TaskScopeToolbarControl({
  dateRange,
  isSprintHistoryUnavailable = false,
  onDateRangeChange,
  onSprintIdsChange,
  sprintIds,
  sprintPickerMode = 'multi',
  sprints,
  taskMode,
}: TaskScopeToolbarControlProps) {
  if (taskMode === 'standard') {
    return <OverviewDateRangePicker onChange={onDateRangeChange} value={dateRange}/>
  }

  if (sprintPickerMode === 'single') {
    return (
      <SprintPicker
        isUnavailable={isSprintHistoryUnavailable}
        onSelect={(sprintId) => onSprintIdsChange([sprintId])}
        selectedSprintId={sprintIds[0] ?? null}
        sprints={sprints}
        unavailableLabel={isSprintHistoryUnavailable && sprintIds.length > 0 ? 'Selected sprint' : undefined}
      />
    )
  }

  return (
    <SprintMultiPicker
      isUnavailable={isSprintHistoryUnavailable}
      onChange={onSprintIdsChange}
      selectedSprintIds={sprintIds}
      sprints={sprints}
    />
  )
}
