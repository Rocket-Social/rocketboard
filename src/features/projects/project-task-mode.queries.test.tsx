/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider, type QueryClient} from '@tanstack/react-query'
import {act, renderHook, waitFor} from '@testing-library/react'
import type {ReactNode} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import {
  projectTaskModeKeys,
  useProjectTaskModeQuery,
} from './project-task-mode.queries'
import {useSetProjectTaskModeMutation} from './project-task-mode.mutations'

const {getProjectTaskModeMock, setProjectTaskModeMock} = vi.hoisted(() => ({
  getProjectTaskModeMock: vi.fn(),
  setProjectTaskModeMock: vi.fn(),
}))

vi.mock('./project-task-mode.repository', () => ({
  projectTaskModeRepository: {
    getProjectTaskMode: getProjectTaskModeMock,
    setProjectTaskMode: setProjectTaskModeMock,
  },
}))

function createQueryClient() {
  return createTestQueryClient({
    defaultOptions: {
      mutations: {retry: false},
      queries: {retry: false},
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({children}: {children: ReactNode}) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
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

describe('project task mode queries', () => {
  beforeEach(() => {
    getProjectTaskModeMock.mockReset()
    setProjectTaskModeMock.mockReset()
  })

  it('treats the task mode as not ready until the current mount refetch settles', async () => {
    const queryClient = createQueryClient()
    const deferred = deferredPromise<'sprint'>()

    queryClient.setQueryData(projectTaskModeKeys.detail('project-1'), 'standard')
    getProjectTaskModeMock.mockReturnValue(deferred.promise)

    const {result} = renderHook(() => useProjectTaskModeQuery('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(getProjectTaskModeMock).toHaveBeenCalledWith('project-1'))
    expect(result.current.taskMode).toBe('standard')
    expect(result.current.isReady).toBe(false)

    act(() => {
      deferred.resolve('sprint')
    })

    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(result.current.taskMode).toBe('sprint')
  })

  it('skips the fetch and stays ready when the query is disabled', () => {
    const queryClient = createQueryClient()

    const {result} = renderHook(() => useProjectTaskModeQuery('project-1', {enabled: false}), {
      wrapper: createWrapper(queryClient),
    })

    expect(getProjectTaskModeMock).not.toHaveBeenCalled()
    expect(result.current.isReady).toBe(true)
  })

  it('keeps the task mode unready when the current mount refetch fails', async () => {
    const queryClient = createQueryClient()

    queryClient.setQueryData(projectTaskModeKeys.detail('project-1'), 'standard')
    getProjectTaskModeMock.mockRejectedValue(new Error('Task mode unavailable'))

    const {result} = renderHook(() => useProjectTaskModeQuery('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isReady).toBe(false)
  })

  it('optimistically patches the cache and rolls back on mutation failure', async () => {
    const queryClient = createQueryClient()
    const deferred = deferredPromise<'sprint'>()
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(() => Promise.resolve() as ReturnType<typeof queryClient.invalidateQueries>)

    queryClient.setQueryData(projectTaskModeKeys.detail('project-1'), 'standard')
    setProjectTaskModeMock.mockReturnValue(deferred.promise)

    const {result} = renderHook(() => useSetProjectTaskModeMutation('project-1'), {
      wrapper: createWrapper(queryClient),
    })

    let mutationPromise: Promise<unknown> | undefined
    act(() => {
      mutationPromise = result.current.mutateAsync('sprint').catch(() => undefined)
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(projectTaskModeKeys.detail('project-1'))).toBe('sprint')
    })

    act(() => {
      deferred.reject(new Error('network down'))
    })

    await mutationPromise

    await waitFor(() => {
      expect(queryClient.getQueryData(projectTaskModeKeys.detail('project-1'))).toBe('standard')
    })
    expect(invalidateSpy).toHaveBeenCalledWith({queryKey: projectTaskModeKeys.detail('project-1')})
  })
})
