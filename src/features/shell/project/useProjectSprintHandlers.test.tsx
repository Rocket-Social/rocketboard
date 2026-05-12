/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../../test/queryClient'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {sprintCompletedEventName, type SprintCompletedEventDetail} from '../sprint-completion-events'
import type {CompleteSprintDialogState} from './ProjectDialogContext'
import {useProjectSprintHandlers} from './useProjectSprintHandlers'

const {completeSprintMock, createSprintMock, startSprintMock, toastMock, updateSprintMock} = vi.hoisted(() => ({
  completeSprintMock: vi.fn(),
  createSprintMock: vi.fn(),
  startSprintMock: vi.fn(),
  toastMock: vi.fn(),
  updateSprintMock: vi.fn(),
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

vi.mock('../../sprints/sprint.repository', () => ({
  sprintRepository: {
    completeSprint: completeSprintMock,
    createSprint: createSprintMock,
    deleteSprint: vi.fn(),
    getProjectSprints: vi.fn(),
    setCardSprint: vi.fn(),
    startSprint: startSprintMock,
    updateSprint: updateSprintMock,
  },
}))

function createQueryClient() {
  return createTestQueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  })
}

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
    status: 'active',
    updatedAt: '2026-04-05T12:00:00.000Z',
    ...overrides,
  }
}

function CompleteSprintHarness({
  completeSprintState = {
    incompleteCount: 3,
    sprintId: 'sprint-1',
    sprintName: 'Sprint 1',
  },
  projectSprints,
}: {
  completeSprintState?: CompleteSprintDialogState
  projectSprints: ProjectSprintRecord[]
}) {
  const [state, setState] = useState<typeof completeSprintState | null>(completeSprintState)
  const {handleCompleteSprintAction} = useProjectSprintHandlers({
    completeSprintState: state,
    editingSprintId: null,
    projectId: 'project-1',
    projectSprints,
    setCompleteSprintState: setState,
  })

  return (
    <button onClick={() => handleCompleteSprintAction('move_to_next')} type='button'>
      Complete sprint
    </button>
  )
}

describe('useProjectSprintHandlers', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    completeSprintMock.mockReset()
    createSprintMock.mockReset()
    startSprintMock.mockReset()
    toastMock.mockReset()
    updateSprintMock.mockReset()
  })

  it('moves incomplete tasks to the actual next planned sprint', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const sprintCompletedEvents: SprintCompletedEventDetail[] = []
    const handleSprintCompleted = (event: Event) => {
      sprintCompletedEvents.push((event as CustomEvent<SprintCompletedEventDetail>).detail)
    }
    const projectSprints = [
      makeSprint({id: 'sprint-1', name: 'Sprint 1', position: 0, status: 'active'}),
      makeSprint({id: 'sprint-2', name: 'Sprint 2', position: 1, status: 'planned'}),
    ]

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], projectSprints)
    completeSprintMock.mockResolvedValue(undefined)
    window.addEventListener(sprintCompletedEventName, handleSprintCompleted)

    render(
      <QueryClientProvider client={queryClient}>
        <CompleteSprintHarness
          completeSprintState={{
            incompleteCount: 3,
            sourceViewId: 'view-1',
            sprintId: 'sprint-1',
            sprintName: 'Sprint 1',
          }}
          projectSprints={projectSprints}
        />
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint'}))

    await waitFor(() => {
      expect(completeSprintMock).toHaveBeenCalledWith({
        action: 'move_to_next',
        nextSprint: {
          kind: 'existing',
          sprintId: 'sprint-2',
          sprintName: 'Sprint 2',
        },
        sprintId: 'sprint-1',
      })
    })
    expect(createSprintMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
    expect(sprintCompletedEvents).toEqual([{
      completedSprintId: 'sprint-1',
      currentSprintId: 'sprint-2',
      currentSprintName: 'Sprint 2',
      projectId: 'project-1',
      sourceViewId: 'view-1',
    }])
    window.removeEventListener(sprintCompletedEventName, handleSprintCompleted)
  })

  it('passes a create-next target through the complete mutation when none exists yet', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const projectSprints = [
      makeSprint({
        endDate: '2026-04-19',
        startDate: '2026-04-05',
        status: 'active',
      }),
    ]

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], projectSprints)
    completeSprintMock.mockResolvedValue(makeSprint({
      endDate: '2026-05-03',
      id: 'sprint-2',
      name: 'Sprint 2',
      position: 1,
      startDate: '2026-04-19',
      status: 'planned',
    }))

    render(
      <QueryClientProvider client={queryClient}>
        <CompleteSprintHarness projectSprints={projectSprints}/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint'}))

    await waitFor(() => {
      expect(completeSprintMock).toHaveBeenCalledWith({
        action: 'move_to_next',
        nextSprint: {
          endDate: '2026-05-03',
          goal: null,
          kind: 'create',
          sprintName: 'Sprint 2',
          startDate: '2026-04-19',
        },
        sprintId: 'sprint-1',
      })
    })
    expect(createSprintMock).not.toHaveBeenCalled()
  })

  it('does not leave a stray sprint-creation side effect when completion fails', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const projectSprints = [
      makeSprint({
        endDate: '2026-04-19',
        startDate: '2026-04-05',
        status: 'active',
      }),
    ]

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], projectSprints)
    completeSprintMock.mockRejectedValue(new Error('completion failed'))

    render(
      <QueryClientProvider client={queryClient}>
        <CompleteSprintHarness projectSprints={projectSprints}/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint'}))

    await waitFor(() => {
      expect(completeSprintMock).toHaveBeenCalledWith({
        action: 'move_to_next',
        nextSprint: {
          endDate: '2026-05-03',
          goal: null,
          kind: 'create',
          sprintName: 'Sprint 2',
          startDate: '2026-04-19',
        },
        sprintId: 'sprint-1',
      })
      expect(toastMock).toHaveBeenCalledWith({
        title: 'completion failed',
        variant: 'error',
      })
    })
    expect(createSprintMock).not.toHaveBeenCalled()
  })

  it('surfaces the real Postgres error message when start_sprint rejects (e.g. another active sprint blocks it)', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const projectSprints = [
      makeSprint({id: 'sprint-1', name: 'Sprint 1', status: 'planned'}),
    ]
    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], projectSprints)
    startSprintMock.mockRejectedValue(new Error('Another sprint is already active. Complete it before starting a new one.'))

    function StartSprintHarness() {
      const {startSprint} = useProjectSprintHandlers({
        completeSprintState: null,
        editingSprintId: null,
        projectId: 'project-1',
        projectSprints,
        setCompleteSprintState: vi.fn(),
      })
      return (
        <button onClick={() => startSprint('sprint-1')} type='button'>
          Start
        </button>
      )
    }

    render(
      <QueryClientProvider client={queryClient}>
        <StartSprintHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Start'}))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Another sprint is already active. Complete it before starting a new one.',
        variant: 'error',
      })
    })
  })

  it('does not create or move anything when there are no incomplete tasks', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const projectSprints = [
      makeSprint({id: 'sprint-1', name: 'Sprint 1', position: 0, status: 'active'}),
    ]

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], projectSprints)
    completeSprintMock.mockResolvedValue(undefined)

    render(
      <QueryClientProvider client={queryClient}>
        <CompleteSprintHarness
          completeSprintState={{
            incompleteCount: 0,
            sprintId: 'sprint-1',
            sprintName: 'Sprint 1',
          }}
          projectSprints={projectSprints}
        />
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint'}))

    await waitFor(() => {
      expect(completeSprintMock).toHaveBeenCalledWith({
        action: 'keep',
        nextSprint: null,
        sprintId: 'sprint-1',
      })
    })
    expect(createSprintMock).not.toHaveBeenCalled()
  })
})
