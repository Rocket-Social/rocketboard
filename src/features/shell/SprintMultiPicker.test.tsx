// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {SprintMultiPicker} from './SprintMultiPicker'

afterEach(() => {
  cleanup()
})

function createSprint(overrides: Partial<ProjectSprintRecord>): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    endDate: '2026-03-14',
    goal: null,
    id: 'sprint-id',
    name: 'Sprint',
    position: 0,
    projectId: 'project-1',
    startDate: '2026-03-01',
    status: 'planned',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

const sprints = [
  createSprint({endDate: '2026-03-14', id: 'sprint-1', name: 'Sprint 1', startDate: '2026-03-01', status: 'completed'}),
  createSprint({endDate: '2026-03-28', id: 'sprint-2', name: 'Sprint 2', startDate: '2026-03-15', status: 'completed'}),
  createSprint({endDate: '2026-04-11', id: 'sprint-3', name: 'Sprint 3', startDate: '2026-03-29', status: 'active'}),
  createSprint({endDate: '2026-04-25', id: 'sprint-4', name: 'Sprint 4', startDate: '2026-04-12', status: 'planned'}),
]

describe('SprintMultiPicker', () => {
  it('shows the capped quick picks and search results', () => {
    render(
      <SprintMultiPicker
        onChange={vi.fn()}
        selectedSprintIds={['sprint-3']}
        sprints={sprints}
      />,
    )

    fireEvent.click(screen.getByRole('button', {name: /current sprint/i}))

    expect(screen.getByText('Quick picks')).toBeInTheDocument()
    expect(screen.getAllByText('Current sprint').length).toBeGreaterThan(0)
    expect(screen.getByText('Previous sprint')).toBeInTheDocument()
    expect(screen.getByText('Two sprints ago')).toBeInTheDocument()
    expect(screen.getByText('Sprint 4')).toBeInTheDocument()
  })

  it('blocks selecting more than three sprints', () => {
    const onChange = vi.fn()
    render(
      <SprintMultiPicker
        onChange={onChange}
        selectedSprintIds={['sprint-1', 'sprint-2', 'sprint-3']}
        sprints={sprints}
      />,
    )

    fireEvent.click(screen.getByRole('button', {name: /3 sprints/i}))
    fireEvent.click(screen.getByText('Sprint 4'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
