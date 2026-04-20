// @vitest-environment jsdom

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {ProjectGanttTask} from '../../cards/card-view-mappers'
import {buildGanttGroups, GanttView} from './GanttView'

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

function createTask(
  id: string,
  title: string,
  overrides: Partial<ProjectGanttTask['card']> = {},
): ProjectGanttTask {
  return {
    assignee: 'JK',
    card: {
      assigneeName: 'Test User',
      assigneeUserId: 'user-1',
      bodyJson: {content: [{type: 'paragraph'}], type: 'doc'},
      bodyMd: '',
      completedAt: null,
      createdAt: '2026-03-24T12:00:00.000Z',
      customFieldValues: {},
      dueAt: '2026-03-26',
      effort: null,
      groupId: null,
      groupPosition: 0,
      id,
      initiativeId: null,
      priorityOptionId: null,
      projectId: 'project-1',
      sprintId: null,
      startAt: '2026-03-25',
      statusOptionId: null,
      statusPosition: 1,
      tags: [],
      title,
      ...overrides,
    },
    completed: false,
    endWeek: 1,
    id,
    startWeek: 0,
    status: 'To Do',
    title,
  }
}

function renderGanttView({
  activeTaskId = null,
  isTaskDetailOpen = false,
  onOpenTask = vi.fn(),
  tasks = [createTask('task-1', 'Task One'), createTask('task-2', 'Task Two')],
}: {
  activeTaskId?: string | null
  isTaskDetailOpen?: boolean
  onOpenTask?: ReturnType<typeof vi.fn>
  tasks?: ProjectGanttTask[]
} = {}) {
  render(
    <GanttView
      activeTaskId={activeTaskId}
      isTaskDetailOpen={isTaskDetailOpen}
      mode='light'
      onOpenTask={onOpenTask}
      onScheduleTask={vi.fn(async () => true)}
      tasks={tasks}
    />,
  )

  return {onOpenTask}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GanttView task detail interactions', () => {
  it('opens a task on double click when the detail pane is closed', async () => {
    const user = userEvent.setup()
    const {onOpenTask} = renderGanttView()

    await user.click(screen.getByRole('button', {name: 'Task One'}))
    expect(onOpenTask).not.toHaveBeenCalled()

    await user.dblClick(screen.getByRole('button', {name: 'Task One'}))
    expect(onOpenTask).toHaveBeenCalledTimes(1)
    expect(onOpenTask).toHaveBeenCalledWith('task-1')
  })

  it('switches the detail pane on single click when another task is already open', async () => {
    const user = userEvent.setup()
    const {onOpenTask} = renderGanttView({
      activeTaskId: 'task-1',
      isTaskDetailOpen: true,
    })

    await user.click(screen.getByRole('button', {name: 'Task Two'}))
    expect(onOpenTask).toHaveBeenCalledTimes(1)
    expect(onOpenTask).toHaveBeenCalledWith('task-2')
  })

  it('does not reopen the currently active task on single click', async () => {
    const user = userEvent.setup()
    const {onOpenTask} = renderGanttView({
      activeTaskId: 'task-1',
      isTaskDetailOpen: true,
    })

    await user.click(screen.getByRole('button', {name: 'Task One'}))
    expect(onOpenTask).not.toHaveBeenCalled()
  })
})

describe('GanttView geometry', () => {
  it('uses createdAt as the left edge when startAt is missing', () => {
    renderGanttView({
      tasks: [createTask('task-1', 'Task One', {
        createdAt: '2026-03-24T12:00:00.000Z',
        dueAt: '2026-03-26',
        startAt: null,
      })],
    })

    const bar = screen.getByTestId('gantt-bar-task-1')

    expect(bar.style.left).toBe('340px')
    expect(bar.style.width).toBe('51px')
  })

  it('uses startAt as the left edge when it is present', () => {
    renderGanttView({
      tasks: [createTask('task-1', 'Task One', {
        dueAt: '2026-03-26',
        startAt: '2026-03-25',
      })],
    })

    const bar = screen.getByTestId('gantt-bar-task-1')

    expect(bar.style.left).toBe('357px')
    expect(bar.style.width).toBe('34px')
  })

  it('spans exactly one day cell for single-day tasks', () => {
    renderGanttView({
      tasks: [createTask('task-1', 'Task One', {
        dueAt: '2026-03-25',
        startAt: '2026-03-25',
      })],
    })

    const bar = screen.getByTestId('gantt-bar-task-1')

    expect(bar.style.left).toBe('357px')
    expect(bar.style.width).toBe('17px')
  })

  it('anchors the done marker to completedAt while keeping the bar end on dueAt', () => {
    renderGanttView({
      tasks: [createTask('task-1', 'Task One', {
        completedAt: '2026-03-26T09:15:00.000Z',
        dueAt: '2026-03-28',
        startAt: '2026-03-25',
      })],
    })

    const bar = screen.getByTestId('gantt-bar-task-1')
    const marker = screen.getByTestId('gantt-done-marker-task-1')

    expect(bar.style.left).toBe('357px')
    expect(bar.style.width).toBe('68px')
    expect(marker.style.left).toBe('385px')
  })
})

describe('buildGanttGroups', () => {
  it('preserves the incoming order within assignee groups', () => {
    const groups = buildGanttGroups([
      createTask('task-early', 'Task Early', {
        dueAt: '2026-03-26',
        statusPosition: 2,
      }),
      createTask('task-late', 'Task Late', {
        dueAt: '2026-03-29',
        statusPosition: 0,
      }),
    ], 'assignee', [], [])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.tasks.map((task) => task.id)).toEqual(['task-early', 'task-late'])
  })

  it('keeps sprint-scoped tasks in a sprint bucket when fallback sprint records are provided', () => {
    const groups = buildGanttGroups([
      createTask('task-sprint', 'Sprint Task', {sprintId: 'sprint-1'}),
      createTask('task-backlog', 'Backlog Task', {sprintId: null}),
    ], 'group', [], [], undefined, [{
      completedAt: null,
      createdAt: '1970-01-01T00:00:00.000Z',
      endDate: null,
      goal: null,
      id: 'sprint-1',
      name: 'Sprint unavailable',
      position: 0,
      projectId: 'project-1',
      startDate: null,
      status: 'planned',
      updatedAt: '1970-01-01T00:00:00.000Z',
    }], 'sprint')

    expect(groups.find((group) => group.id === 'sprint-1')?.tasks.map((task) => task.id)).toEqual(['task-sprint'])
    expect(groups.find((group) => group.id === '__backlog')?.tasks.map((task) => task.id)).toEqual(['task-backlog'])
  })
})
