/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CompleteSprintDialog} from './CompleteSprintPopover'

describe('CompleteSprintDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the real existing target sprint in the move option', () => {
    render(
      <CompleteSprintDialog
        incompleteCount={3}
        moveTarget={{kind: 'existing', sprintId: 'sprint-2', sprintName: 'Sprint 2'}}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        sprintName='Sprint 1'
      />,
    )

    expect(screen.getByText('Move incomplete tasks to Sprint 2')).toBeInTheDocument()
    expect(screen.getByText('Return incomplete tasks to Backlog')).toBeInTheDocument()
    expect(screen.getByText('Leave incomplete tasks in this completed sprint')).toBeInTheDocument()
  })

  it('shows create-and-move copy when no next sprint exists yet', () => {
    render(
      <CompleteSprintDialog
        incompleteCount={3}
        moveTarget={{
          endDate: '2026-05-03',
          goal: null,
          kind: 'create',
          sprintName: 'Sprint 2',
          startDate: '2026-04-19',
        }}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        sprintName='Sprint 1'
      />,
    )

    expect(screen.getByText('Create Sprint 2 and move incomplete tasks')).toBeInTheDocument()
  })

  it('skips move options entirely when the sprint has no incomplete tasks', () => {
    render(
      <CompleteSprintDialog
        incompleteCount={0}
        moveTarget={{kind: 'existing', sprintId: 'sprint-2', sprintName: 'Sprint 2'}}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        sprintName='Sprint 1'
      />,
    )

    expect(screen.getByText('All tasks in this sprint are complete.')).toBeInTheDocument()
    expect(screen.queryByText('Move incomplete tasks to Sprint 2')).not.toBeInTheDocument()
  })
})
