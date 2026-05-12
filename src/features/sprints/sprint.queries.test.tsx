/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import type {CardRecord} from '../cards/card.types'
import type {ProjectStatusOption} from '../cards/card.types'
import type {ProjectSprintRecord} from './sprint.types'
import {
  useCompleteSprintMutation,
  useCreateSprintMutation,
  useStartSprintMutation,
  useUpdateSprintMutation,
} from './sprint.queries'

const {
  completeSprintMock,
  createSprintMock,
  deleteSprintMock,
  startSprintMock,
  updateSprintMock,
} = vi.hoisted(() => ({
  completeSprintMock: vi.fn(),
  createSprintMock: vi.fn(),
  deleteSprintMock: vi.fn(),
  startSprintMock: vi.fn(),
  updateSprintMock: vi.fn(),
}))

vi.mock('./sprint.repository', () => ({
  sprintRepository: {
    completeSprint: completeSprintMock,
    createSprint: createSprintMock,
    deleteSprint: deleteSprintMock,
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

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {promise, reject, resolve}
}

function makeSprint(overrides: Partial<ProjectSprintRecord> = {}): ProjectSprintRecord {
  return {
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    endDate: '2026-04-12',
    goal: 'Ship fast',
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

const defaultStatusOptions: ProjectStatusOption[] = [
  {
    category: 'not_started',
    color: null,
    id: 'status-1',
    isDefault: true,
    key: 'todo',
    label: 'To Do',
    position: 0,
  },
  {
    category: 'completed',
    color: null,
    id: 'status-done',
    isDefault: false,
    key: 'done',
    label: 'Done',
    position: 1,
  },
]

function makeCardRecord(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    assigneeName: 'Test User',
    assigneeUserId: null,
    bodyJson: {content: [], type: 'doc'},
    bodyMd: '',
    completedAt: null,
    createdAt: '2026-04-05T12:00:00.000Z',
    customFieldValues: {},
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    id: 'card-1',
    initiativeId: null,
    priorityOptionId: null,
    projectId: 'project-1',
    sprintId: 'sprint-1',
    startAt: null,
    statusOptionId: 'status-1',
    statusPosition: 0,
    tags: [],
    title: 'Card 1',
    ...overrides,
  }
}

function CreateSprintHarness() {
  const mutation = useCreateSprintMutation('project-1')
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        onClick={() => {
          void mutation.mutateAsync({name: 'Sprint 2', projectId: 'project-1'}).then(() => setStatus('resolved'))
        }}
        type='button'
      >
        Create sprint
      </button>
      <span>{status}</span>
    </>
  )
}

function UpdateSprintHarness() {
  const mutation = useUpdateSprintMutation('project-1')

  return (
    <button
      onClick={() => mutation.mutate({
        endDate: '2026-04-12',
        goal: 'Ship fast',
        id: 'sprint-1',
        name: 'Renamed sprint',
        startDate: '2026-04-06',
      })}
      type='button'
    >
      Update sprint
    </button>
  )
}

function StartSprintHarness() {
  const mutation = useStartSprintMutation('project-1')

  return (
    <button onClick={() => mutation.mutate('sprint-2')} type='button'>
      Start sprint
    </button>
  )
}

function CompleteSprintHarness() {
  const mutation = useCompleteSprintMutation('project-1')
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        onClick={() => {
          void mutation
            .mutateAsync({action: 'return_to_backlog', sprintId: 'sprint-1'})
            .then(() => setStatus('resolved'))
            .catch(() => setStatus('rejected'))
        }}
        type='button'
      >
        Complete sprint
      </button>
      <span>{status}</span>
    </>
  )
}

function CompleteSprintCreateNextHarness() {
  const mutation = useCompleteSprintMutation('project-1')
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        onClick={() => {
          void mutation
            .mutateAsync({
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
            .then(() => setStatus('resolved'))
            .catch(() => setStatus('rejected'))
        }}
        type='button'
      >
        Complete sprint into next
      </button>
      <span>{status}</span>
    </>
  )
}

describe('sprint mutations', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    completeSprintMock.mockReset()
    createSprintMock.mockReset()
    deleteSprintMock.mockReset()
    startSprintMock.mockReset()
    updateSprintMock.mockReset()
  })

  it('resolves create-sprint mutations without waiting for background invalidation', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const invalidateDeferred = deferredPromise<void>()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters) => {
      const queryKey = (filters as {queryKey?: readonly unknown[]} | undefined)?.queryKey

      if (queryKey?.[0] === 'project' && queryKey?.[1] === 'sprints') {
        return invalidateDeferred.promise as ReturnType<typeof queryClient.invalidateQueries>
      }

      return Promise.resolve() as ReturnType<typeof queryClient.invalidateQueries>
    })

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], [makeSprint()])
    createSprintMock.mockResolvedValue(makeSprint({
      id: 'sprint-2',
      name: 'Sprint 2',
      position: 1,
    }))

    render(
      <QueryClientProvider client={queryClient}>
        <CreateSprintHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Create sprint'}))

    await waitFor(() => expect(screen.getAllByText('resolved')).toHaveLength(1))
    expect(queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'])).toEqual([
      expect.objectContaining({id: 'sprint-1'}),
      expect.objectContaining({id: 'sprint-2'}),
    ])

    invalidateDeferred.resolve()
    invalidateSpy.mockRestore()
  })

  it('rolls back optimistic sprint updates when the mutation fails', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const updateDeferred = deferredPromise<void>()

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], [makeSprint()])
    updateSprintMock.mockReturnValue(updateDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <UpdateSprintHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Update sprint'}))

    await waitFor(() => {
      const sprint = queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'])?.[0]
      expect(sprint?.endDate).toBe('2026-04-12')
      expect(sprint?.goal).toBe('Ship fast')
      expect(sprint?.name).toBe('Renamed sprint')
      expect(sprint?.startDate).toBe('2026-04-06')
    })

    updateDeferred.reject(new Error('update failed'))

    await waitFor(() => {
      const sprint = queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'])?.[0]
      expect(sprint?.name).toBe('Sprint 1')
      expect(sprint?.startDate).toBe('2026-04-05')
    })
  })

  it('optimistically starts a sprint and rolls back on failure', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const startDeferred = deferredPromise<void>()

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], [
      makeSprint({id: 'sprint-1', status: 'active'}),
      makeSprint({id: 'sprint-2', name: 'Sprint 2', position: 1}),
    ])
    startSprintMock.mockReturnValue(startDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <StartSprintHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Start sprint'}))

    await waitFor(() => {
      const sprints = queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1']) ?? []
      expect(sprints.find((sprint) => sprint.id === 'sprint-1')?.status).toBe('planned')
      expect(sprints.find((sprint) => sprint.id === 'sprint-2')?.status).toBe('active')
    })

    startDeferred.reject(new Error('start failed'))

    await waitFor(() => {
      const sprints = queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1']) ?? []
      expect(sprints.find((sprint) => sprint.id === 'sprint-1')?.status).toBe('active')
      expect(sprints.find((sprint) => sprint.id === 'sprint-2')?.status).toBe('planned')
    })
  })

  it('optimistically completes the sprint and reassigns incomplete cards', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const invalidateDeferred = deferredPromise<void>()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() =>
      invalidateDeferred.promise as ReturnType<typeof queryClient.invalidateQueries>,
    )

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], [makeSprint({status: 'active'})])
    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-open', statusOptionId: 'status-1'}),
      makeCardRecord({id: 'card-done', statusOptionId: 'status-done'}),
    ])
    queryClient.setQueryData<ProjectStatusOption[]>(['project', 'status-options', 'project-1'], defaultStatusOptions)
    completeSprintMock.mockResolvedValue(undefined)

    render(
      <QueryClientProvider client={queryClient}>
        <CompleteSprintHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint'}))

    await waitFor(() => expect(screen.getAllByText('resolved')).toHaveLength(1))
    const cards = queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1']) ?? []
    const sprints = queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1']) ?? []

    expect(cards.find((card) => card.id === 'card-open')?.sprintId).toBeNull()
    expect(cards.find((card) => card.id === 'card-done')?.sprintId).toBe('sprint-1')
    expect(sprints[0]?.status).toBe('completed')
    expect(sprints[0]?.completedAt).toBeTruthy()

    invalidateDeferred.resolve()
    invalidateSpy.mockRestore()
  })

  it('reconciles a server-created next sprint after atomic completion succeeds', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const invalidateDeferred = deferredPromise<void>()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() =>
      invalidateDeferred.promise as ReturnType<typeof queryClient.invalidateQueries>,
    )

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], [makeSprint({status: 'active'})])
    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [
      makeCardRecord({id: 'card-open', statusOptionId: 'status-1'}),
      makeCardRecord({id: 'card-done', statusOptionId: 'status-done'}),
    ])
    queryClient.setQueryData<ProjectStatusOption[]>(['project', 'status-options', 'project-1'], defaultStatusOptions)
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
        <CompleteSprintCreateNextHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint into next'}))

    await waitFor(() => expect(screen.getAllByText('resolved')).toHaveLength(1))
    const cards = queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1']) ?? []
    const sprints = queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1']) ?? []

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
    expect(cards.find((card) => card.id === 'card-open')?.sprintId).toBe('sprint-2')
    expect(cards.find((card) => card.id === 'card-done')?.sprintId).toBe('sprint-1')
    expect(sprints.find((sprint) => sprint.id === 'sprint-1')?.status).toBe('completed')
    expect(sprints.find((sprint) => sprint.id === 'sprint-2')).toEqual(
      expect.objectContaining({id: 'sprint-2', name: 'Sprint 2'}),
    )

    invalidateDeferred.resolve()
    invalidateSpy.mockRestore()
  })

  it('rolls back optimistic complete-sprint updates when the mutation fails', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const completeDeferred = deferredPromise<void>()

    queryClient.setQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'], [makeSprint({status: 'active'})])
    queryClient.setQueryData<CardRecord[]>(['project', 'cards', 'project-1'], [makeCardRecord({statusOptionId: 'status-1'})])
    queryClient.setQueryData<ProjectStatusOption[]>(['project', 'status-options', 'project-1'], defaultStatusOptions)
    completeSprintMock.mockReturnValue(completeDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <CompleteSprintHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Complete sprint'}))

    await waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])?.[0]?.sprintId).toBeNull()
      expect(queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'])?.[0]?.status).toBe('completed')
    })

    completeDeferred.reject(new Error('complete failed'))

    await waitFor(() => {
      expect(queryClient.getQueryData<CardRecord[]>(['project', 'cards', 'project-1'])?.[0]?.sprintId).toBe('sprint-1')
      expect(queryClient.getQueryData<ProjectSprintRecord[]>(['project', 'sprints', 'project-1'])?.[0]?.status).toBe('active')
    })
  })
})
