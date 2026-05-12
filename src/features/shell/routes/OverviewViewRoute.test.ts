import {describe, expect, it} from 'vitest'

import {getOverviewTaskScopeLabel} from './OverviewViewRoute'

describe('getOverviewTaskScopeLabel', () => {
  it('keeps a sprint selection visible when sprint history is temporarily unavailable', () => {
    expect(getOverviewTaskScopeLabel({
      overviewGroupId: null,
      overviewSprintId: 'sprint-1',
      projectGroups: [],
      projectSprints: [],
      projectSprintsUnavailable: true,
    })).toBe('Selected sprint')
  })

  it('uses the sprint name when sprint history is loaded', () => {
    expect(getOverviewTaskScopeLabel({
      overviewGroupId: null,
      overviewSprintId: 'sprint-1',
      projectGroups: [],
      projectSprints: [{id: 'sprint-1', name: 'Sprint 9'}],
      projectSprintsUnavailable: false,
    })).toBe('Sprint 9')
  })
})
