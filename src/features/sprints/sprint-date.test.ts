import {describe, expect, it} from 'vitest'

import {getCreateSprintDateDefaults} from './sprint-date'
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
    status: 'planned',
    updatedAt: '2026-03-25T10:00:00.000Z',
    ...overrides,
  }
}

describe('getCreateSprintDateDefaults', () => {
  it('preserves a Sunday biweekly cadence', () => {
    const defaults = getCreateSprintDateDefaults([
      makeSprint({
        endDate: '2026-04-19',
        startDate: '2026-04-05',
      }),
    ], new Date('2026-03-31T12:00:00'))

    expect(defaults).toEqual({
      endDate: '2026-05-03',
      startDate: '2026-04-19',
    })
  })

  it('preserves a Monday to Friday weekly cadence', () => {
    const defaults = getCreateSprintDateDefaults([
      makeSprint({
        endDate: '2026-04-10',
        startDate: '2026-04-06',
      }),
    ], new Date('2026-03-31T12:00:00'))

    expect(defaults).toEqual({
      endDate: '2026-04-17',
      startDate: '2026-04-13',
    })
  })

  it('uses the latest scheduled sprint with dates, including planned sprints', () => {
    const defaults = getCreateSprintDateDefaults([
      makeSprint({
        createdAt: '2026-03-20T10:00:00.000Z',
        endDate: '2026-04-05',
        id: 'active-sprint',
        startDate: '2026-03-22',
        status: 'active',
      }),
      makeSprint({
        createdAt: '2026-03-26T10:00:00.000Z',
        endDate: '2026-04-19',
        id: 'planned-sprint',
        startDate: '2026-04-05',
        status: 'planned',
      }),
      makeSprint({
        completedAt: '2026-03-15T09:00:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
        endDate: '2026-03-15',
        id: 'completed-sprint',
        startDate: '2026-03-01',
        status: 'completed',
      }),
    ], new Date('2026-03-31T12:00:00'))

    expect(defaults).toEqual({
      endDate: '2026-05-03',
      startDate: '2026-04-19',
    })
  })

  it('falls back to end plus one day when only an end date exists', () => {
    const defaults = getCreateSprintDateDefaults([
      makeSprint({
        endDate: '2026-04-19',
        startDate: null,
      }),
    ], new Date('2026-03-31T12:00:00'))

    expect(defaults).toEqual({
      endDate: '2026-05-04',
      startDate: '2026-04-20',
    })
  })

  it('defaults to today plus fourteen days when no sprint dates exist', () => {
    const defaults = getCreateSprintDateDefaults([
      makeSprint(),
    ], new Date('2026-03-31T12:00:00'))

    expect(defaults).toEqual({
      endDate: '2026-04-14',
      startDate: '2026-03-31',
    })
  })

  it('keeps date math stable across daylight savings transitions', () => {
    const defaults = getCreateSprintDateDefaults([
      makeSprint({
        endDate: '2026-03-06',
        startDate: '2026-03-02',
      }),
    ], new Date('2026-03-01T12:00:00'))

    expect(defaults).toEqual({
      endDate: '2026-03-13',
      startDate: '2026-03-09',
    })
  })
})
