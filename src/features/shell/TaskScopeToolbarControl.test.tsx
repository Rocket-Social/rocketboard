// @vitest-environment jsdom
import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {TaskScopeToolbarControl} from './TaskScopeToolbarControl'

vi.mock('../auth/session.queries', () => ({
  useSessionQuery: () => ({data: null}),
}))

afterEach(() => {
  cleanup()
})

const sprints: ProjectSprintRecord[] = [
  {
    completedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    endDate: '2026-04-11',
    goal: null,
    id: 'sprint-3',
    name: 'Sprint 3',
    position: 3,
    projectId: 'project-1',
    startDate: '2026-03-29',
    status: 'active',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
]

describe('TaskScopeToolbarControl', () => {
  it('renders the date picker in standard mode', () => {
    render(
      <TaskScopeToolbarControl
        dateRange={{endDate: null, preset: 'all_time', startDate: null}}
        onDateRangeChange={vi.fn()}
        onSprintIdsChange={vi.fn()}
        sprintIds={[]}
        sprints={sprints}
        taskMode='standard'
      />,
    )

    expect(screen.getByRole('button', {name: /all time/i})).toBeInTheDocument()
  })

  it('renders the single sprint picker in sprint mode when requested', () => {
    render(
      <TaskScopeToolbarControl
        dateRange={{endDate: null, preset: 'all_time', startDate: null}}
        onDateRangeChange={vi.fn()}
        onSprintIdsChange={vi.fn()}
        sprintIds={['sprint-3']}
        sprintPickerMode='single'
        sprints={sprints}
        taskMode='sprint'
      />,
    )

    expect(screen.getByRole('button', {name: /sprint 3/i})).toBeInTheDocument()
  })
})
