import {describe, expect, it} from 'vitest'

import {
  formatCompleteSprintMoveTargetLabel,
  resolveCompleteSprintMoveTarget,
} from './complete-sprint-target'
import type {ProjectSprintRecord} from './sprint.types'

function makeSprint(overrides: Partial<ProjectSprintRecord> = {}): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-03-25T10:00:00.000Z',
    endDate: null,
    goal: null,
    id: 'sprint-1',
    name: 'Sprint 1',
    position: 0,
    projectId: 'project-1',
    startDate: null,
    status: 'active',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  }
}

describe('resolveCompleteSprintMoveTarget', () => {
  it('chooses the next planned sprint after the current sprint by position', () => {
    const target = resolveCompleteSprintMoveTarget([
      makeSprint({id: 'sprint-2', name: 'Sprint 2', position: 1, status: 'planned'}),
      makeSprint({id: 'sprint-1', name: 'Sprint 1', position: 0, status: 'active'}),
      makeSprint({id: 'sprint-3', name: 'Sprint 3', position: 2, status: 'planned'}),
    ], 'sprint-1')

    expect(target).toEqual({
      kind: 'existing',
      sprintId: 'sprint-2',
      sprintName: 'Sprint 2',
    })
    expect(formatCompleteSprintMoveTargetLabel(target)).toBe('Move incomplete tasks to Sprint 2')
  })

  it('falls back to creating the next sprint when there is no planned sprint', () => {
    const target = resolveCompleteSprintMoveTarget([
      makeSprint({
        endDate: '2026-04-19',
        startDate: '2026-04-05',
        status: 'active',
      }),
    ], 'sprint-1')

    expect(target).toEqual({
      endDate: '2026-05-03',
      goal: null,
      kind: 'create',
      sprintName: 'Sprint 2',
      startDate: '2026-04-19',
    })
    expect(formatCompleteSprintMoveTargetLabel(target)).toBe('Create Sprint 2 and move incomplete tasks')
  })
})
