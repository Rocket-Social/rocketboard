// @vitest-environment jsdom

import {act, cleanup, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {ProjectGanttTask} from '../../cards/card-view-mappers'
import {GanttView} from './GanttView'

type ResizeCallback = (entries: {contentRect: {width: number; height: number}}[]) => void

class ResizeObserverDouble {
  static latestCallback: ResizeCallback | null = null
  constructor(cb: ResizeCallback) {
    ResizeObserverDouble.latestCallback = cb
  }
  disconnect() {}
  observe() {}
  unobserve() {}
}

function fireResize(width: number) {
  if (!ResizeObserverDouble.latestCallback) return
  ResizeObserverDouble.latestCallback([
    {contentRect: {height: 800, width}},
  ])
}

function createTask(id: string, title: string): ProjectGanttTask {
  return {
    assignee: 'JK',
    card: {
      assigneeName: 'Test',
      assigneeUserId: 'u',
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
    },
    completed: false,
    endWeek: 1,
    id,
    startWeek: 0,
    status: 'To Do',
    title,
  }
}

beforeEach(() => {
  ResizeObserverDouble.latestCallback = null
  vi.stubGlobal('ResizeObserver', ResizeObserverDouble)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GanttView day-scale header', () => {
  it('renders 35 daily header cells at a wide viewport (regression: single-column stretch bug)', () => {
    render(
      <GanttView
        activeTaskId={null}
        isTaskDetailOpen={false}
        mode='light'
        onOpenTask={vi.fn()}
        onScheduleTask={vi.fn(async () => true)}
        tasks={[createTask('task-1', 'T1')]}
        timeScale='day'
      />,
    )

    // Simulate a realistic viewport so the responsive dayWidth path fires.
    act(() => {
      fireResize(1400)
    })

    // Only `${dayPrefix} ${dayOfMonth}` labels come from day headers. Count
    // by selecting all of them — we expect 35 (5 weeks × 7 days).
    const dayLabels = screen.queryAllByText(/^(Su|Mo|Tu|We|Th|Fr|Sa) \d+$/)
    expect(dayLabels.length).toBeGreaterThanOrEqual(35)
  })

  it('keeps day cells at the base width when the natural timeline overflows the viewport (regression: single-column feedback loop)', () => {
    render(
      <GanttView
        activeTaskId={null}
        isTaskDetailOpen={false}
        mode='light'
        onOpenTask={vi.fn()}
        onScheduleTask={vi.fn(async () => true)}
        tasks={[createTask('task-1', 'T1')]}
        timeScale='day'
      />,
    )

    // Narrow viewport: 1000px < natural day-scale content (35 * 40 = 1400px).
    // The scaling must step aside so horizontal scroll handles overflow.
    act(() => {
      fireResize(1000)
    })

    const dayLabel = screen.queryAllByText(/^(Su|Mo|Tu|We|Th|Fr|Sa) \d+$/)[0]
    const firstCell = dayLabel?.closest('[style*="width"]') as HTMLElement | null
    expect(firstCell).not.toBeNull()
    expect(Number.parseFloat(firstCell?.style.width ?? '0')).toBe(40)
  })

  it('clamps task bars that extend past the picked date range so they do not push scroll beyond the header (regression: cannot scroll to last header day when a task bar overruns)', () => {
    // Task spans Apr 10 → Apr 22 (crosses both ends of the "This Week" range).
    const outOfRangeTask = createTask('task-overrun', 'Overrun')
    outOfRangeTask.card.startAt = '2026-04-10'
    outOfRangeTask.card.dueAt = '2026-04-22'

    render(
      <GanttView
        activeTaskId={null}
        dateRange={{endDate: '2026-04-18', startDate: '2026-04-12'}}
        isTaskDetailOpen={false}
        mode='light'
        onOpenTask={vi.fn()}
        onScheduleTask={vi.fn(async () => true)}
        tasks={[outOfRangeTask]}
        timeScale='day'
      />,
    )

    act(() => {
      fireResize(1400)
    })

    const bar = screen.getByTestId('gantt-bar-task-overrun') as HTMLElement
    const left = Number.parseFloat(bar.style.left || '0')
    const width = Number.parseFloat(bar.style.width || '0')

    // Picked range is exactly 7 days, so bar left+width must fit inside
    // `totalDays * dayWidth`. That guarantees the scroll container's scroll
    // width tracks the header (7 days) — not the task bar's true end (Apr 22).
    const totalDays = 7
    const dayWidth = 1400 / totalDays // dayWidth under my earlier fix when naturalTotal<=availableWidth
    const maxReach = totalDays * dayWidth
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + width).toBeLessThanOrEqual(maxReach + 1)
  })

  it('scales day cells up when the viewport is wider than the natural timeline', () => {
    render(
      <GanttView
        activeTaskId={null}
        isTaskDetailOpen={false}
        mode='light'
        onOpenTask={vi.fn()}
        onScheduleTask={vi.fn(async () => true)}
        tasks={[createTask('task-1', 'T1')]}
        timeScale='day'
      />,
    )

    // Wide viewport: 2056px = 256 sidebar + 1800 timeline; natural is 1400,
    // so we can stretch cells to ~51px each (1800/35) and fill the viewport.
    act(() => {
      fireResize(2056)
    })

    const dayLabel = screen.queryAllByText(/^(Su|Mo|Tu|We|Th|Fr|Sa) \d+$/)[0]
    const firstCell = dayLabel?.closest('[style*="width"]') as HTMLElement | null
    expect(firstCell).not.toBeNull()
    const widthPx = Number.parseFloat(firstCell?.style.width ?? '0')
    expect(widthPx).toBeGreaterThanOrEqual(40)
    expect(widthPx).toBeLessThanOrEqual(60)
  })
})
