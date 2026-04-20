/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {SprintGroupHeader} from './SprintGroupHeader'

afterEach(() => {
  cleanup()
})

function makeSprint(overrides: Partial<ProjectSprintRecord> = {}): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    endDate: '2026-04-12',
    goal: null,
    id: 'sprint-1',
    name: 'Sprint 1',
    position: 0,
    projectId: 'project-1',
    startDate: '2026-04-05',
    status: 'planned',
    updatedAt: '2026-04-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('SprintGroupHeader', () => {
  it('opens the sprint actions menu and dispatches edit', async () => {
    const user = userEvent.setup()
    const onEditSprint = vi.fn()

    render(
      <SprintGroupHeader
        expanded
        onCompleteSprint={vi.fn()}
        onEditSprint={onEditSprint}
        onRenameSprint={vi.fn()}
        onStartSprint={vi.fn()}
        onToggle={vi.fn()}
        sprint={makeSprint()}
        statusOptions={[]}
        taskCount={0}
        tasks={[]}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Open sprint actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Edit sprint'}))

    expect(onEditSprint).toHaveBeenCalledTimes(1)
  })

  it('hides the sprint actions menu for completed sprints', () => {
    render(
      <SprintGroupHeader
        expanded
        onCompleteSprint={vi.fn()}
        onEditSprint={vi.fn()}
        onRenameSprint={vi.fn()}
        onStartSprint={vi.fn()}
        onToggle={vi.fn()}
        sprint={makeSprint({status: 'completed'})}
        statusOptions={[]}
        taskCount={0}
        tasks={[]}
      />,
    )

    expect(screen.queryByRole('button', {name: 'Open sprint actions'})).not.toBeInTheDocument()
  })
})
