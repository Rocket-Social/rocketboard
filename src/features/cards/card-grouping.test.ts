import {describe, expect, it} from 'vitest'
import type {ProjectGroupRecord} from '../projects/project-group.types'

import {
  canMoveTasksWithinGroupView,
  getGroupByMenuLabel,
  getProjectGroupsForTaskMode,
  ignoresProjectGroups,
  shouldHideProjectGroupField,
  usesFlatSprintGrouping,
  usesProjectGroupBuckets,
} from './card-grouping'

function createGroupRecord(id: string, label: string): ProjectGroupRecord {
  return {
    createdAt: '2025-01-01T00:00:00.000Z',
    id,
    label,
    position: 0,
    projectId: 'project-1',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

describe('card-grouping helpers', () => {
  it('treats sprint mode as ignoring project groups', () => {
    expect(ignoresProjectGroups('sprint')).toBe(true)
    expect(ignoresProjectGroups('standard')).toBe(false)
  })

  it('distinguishes between true project-group buckets and flat sprint grouping', () => {
    expect(usesProjectGroupBuckets('group', 'standard')).toBe(true)
    expect(usesProjectGroupBuckets('group', 'sprint')).toBe(false)
    expect(usesProjectGroupBuckets('status', 'standard')).toBe(false)

    expect(usesFlatSprintGrouping('group', 'sprint')).toBe(true)
    expect(usesFlatSprintGrouping('group', 'standard')).toBe(false)
    expect(usesFlatSprintGrouping('status', 'sprint')).toBe(false)
  })

  it('drops project groups in sprint mode only', () => {
    const projectGroups = [createGroupRecord('group-1', 'Alpha')]

    expect(getProjectGroupsForTaskMode(projectGroups, 'standard')).toBe(projectGroups)
    expect(getProjectGroupsForTaskMode(projectGroups, 'sprint')).toEqual([])
  })

  it('labels the default grouping as none in sprint mode', () => {
    expect(getGroupByMenuLabel('standard')).toBeUndefined()
    expect(getGroupByMenuLabel('sprint')).toBe('None')
  })

  it('hides the group field when grouping by group or when sprint mode ignores groups', () => {
    expect(shouldHideProjectGroupField('group', 'standard')).toBe(true)
    expect(shouldHideProjectGroupField('status', 'sprint')).toBe(true)
    expect(shouldHideProjectGroupField('status', 'standard')).toBe(false)
  })

  it('allows task moves only in draggable grouped views', () => {
    expect(canMoveTasksWithinGroupView('status', 'standard')).toBe(true)
    expect(canMoveTasksWithinGroupView('group', 'standard')).toBe(true)
    expect(canMoveTasksWithinGroupView('group', 'sprint')).toBe(false)
    expect(canMoveTasksWithinGroupView('assignee', 'standard')).toBe(false)
  })
})
