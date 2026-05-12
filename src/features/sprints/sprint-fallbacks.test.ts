import {describe, expect, it} from 'vitest'

import {buildUnavailableProjectSprints, isInferredProjectSprint, resolveDisplayProjectSprints} from './sprint-fallbacks'
import type {ProjectSprintRecord} from './sprint.types'

function makeSprint(overrides: Partial<ProjectSprintRecord> = {}): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    endDate: null,
    goal: null,
    id: 'sprint-1',
    name: 'Sprint 1',
    position: 0,
    projectId: 'project-1',
    startDate: null,
    status: 'planned',
    updatedAt: '2026-04-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('buildUnavailableProjectSprints', () => {
  it('builds a stable synthetic sprint list from distinct sprint ids', () => {
    const sprints = buildUnavailableProjectSprints('project-1', [
      'sprint-2',
      null,
      'sprint-1',
      'sprint-2',
      'sprint-3',
    ])

    expect(sprints).toEqual([
      expect.objectContaining({id: 'sprint-2', name: 'Sprint unavailable 1', projectId: 'project-1'}),
      expect.objectContaining({id: 'sprint-1', name: 'Sprint unavailable 2', projectId: 'project-1'}),
      expect.objectContaining({id: 'sprint-3', name: 'Sprint unavailable 3', projectId: 'project-1'}),
    ])
    expect(sprints.every((sprint) => isInferredProjectSprint(sprint))).toBe(true)
  })

  it('uses a singular label when only one sprint id is present', () => {
    expect(buildUnavailableProjectSprints('project-1', ['sprint-1'])).toEqual([
      expect.objectContaining({id: 'sprint-1', name: 'Sprint unavailable', projectId: 'project-1'}),
    ])
  })
})

describe('resolveDisplayProjectSprints', () => {
  it('returns authoritative sprint metadata when it is loaded', () => {
    const sprint = makeSprint({id: 'sprint-real', name: 'Sprint Real'})

    expect(resolveDisplayProjectSprints({
      cards: [{sprintId: 'sprint-real'}],
      projectId: 'project-1',
      projectSprints: [sprint],
      projectSprintsUnavailable: false,
      taskMode: 'sprint',
    })).toEqual({
      displayProjectSprints: [sprint],
      displayProjectSprintsInferred: false,
    })
  })

  it('recovers sprint partitions from the full card set when sprint history is unavailable', () => {
    const result = resolveDisplayProjectSprints({
      cards: [
        {sprintId: 'sprint-hidden-by-filter'},
        {sprintId: null},
        {sprintId: 'sprint-still-visible'},
      ],
      projectId: 'project-1',
      projectSprints: [],
      projectSprintsUnavailable: true,
      taskMode: 'sprint',
    })

    expect(result.displayProjectSprintsInferred).toBe(true)
    expect(result.displayProjectSprints.map((sprint) => sprint.id)).toEqual([
      'sprint-hidden-by-filter',
      'sprint-still-visible',
    ])
  })

  it('does not synthesize sprint metadata outside sprint mode', () => {
    expect(resolveDisplayProjectSprints({
      cards: [{sprintId: 'sprint-1'}],
      projectId: 'project-1',
      projectSprints: [],
      projectSprintsUnavailable: true,
      taskMode: 'standard',
    })).toEqual({
      displayProjectSprints: [],
      displayProjectSprintsInferred: false,
    })
  })
})
