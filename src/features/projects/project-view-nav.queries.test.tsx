/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import type {WorkspaceSummary} from './project-shell.types'

const {
  createViewMock,
  invalidateAllProjectDataMock,
  reorderViewsMock,
  renameViewMock,
  setDefaultViewMock,
  setHiddenMock,
} = vi.hoisted(() => ({
  createViewMock: vi.fn(),
  invalidateAllProjectDataMock: vi.fn(),
  reorderViewsMock: vi.fn(),
  renameViewMock: vi.fn(),
  setDefaultViewMock: vi.fn(),
  setHiddenMock: vi.fn(),
}))

vi.mock('./project-view.repository', () => ({
  projectViewRepository: {
    createView: createViewMock,
    renameView: renameViewMock,
    reorderViews: reorderViewsMock,
    setDefaultView: setDefaultViewMock,
    setHidden: setHiddenMock,
  },
}))

vi.mock('./project-shell.queries', () => ({
  invalidateAllProjectData: invalidateAllProjectDataMock,
}))

import {
  useCreateProjectViewMutation,
  useSetProjectViewHiddenMutation,
} from './project-view-nav.queries'

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

function makeWorkspaceSummaries(): WorkspaceSummary[] {
  return [
    {
      canManageWorkspace: true,
      colorToken: 'slate',
      defaultProjectSlug: 'launchpad',
      icon: 'W',
      id: 'workspace-1',
      name: 'Workspace',
      organizationId: 'org-1',
      organizationName: 'Org',
      organizationSlug: 'org',
      projects: [
        {
          access: 'open',
          builtinFieldLabels: {},
          builtinOptionLabels: {},
          defaultProjectViewId: 'table',
          icon: '🚀',
          id: 'project-1',
          lastUpdatedLabel: 'just now',
          memberCount: 3,
          name: 'Launchpad',
          priorityOptions: [],
          projectViews: [
            {
              id: 'overview',
              isDefault: false,
              isHidden: false,
              name: 'Overview',
              position: 0,
              viewType: 'overview',
            },
            {
              id: 'table',
              isDefault: true,
              isHidden: false,
              name: 'Table',
              position: 1,
              viewType: 'table',
            },
            {
              id: 'kanban',
              isDefault: false,
              isHidden: false,
              name: 'Kanban',
              position: 2,
              viewType: 'kanban',
            },
          ],
          slug: 'launchpad',
          statusOptions: [],
          taskCount: 12,
        },
      ],
      slug: 'workspace',
      timezone: 'America/Los_Angeles',
    },
  ]
}

function CreateViewHarness() {
  const mutation = useCreateProjectViewMutation('workspace', 'launchpad', 'project-1')
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        onClick={() => {
          void mutation.mutateAsync('kanban').then(() => setStatus('resolved'))
        }}
        type='button'
      >
        Create view
      </button>
      <span>{status}</span>
    </>
  )
}

function HideViewHarness() {
  const mutation = useSetProjectViewHiddenMutation('workspace', 'launchpad', 'project-1')

  return (
    <button
      onClick={() => mutation.mutate({hidden: true, projectViewId: 'kanban'})}
      type='button'
    >
      Hide view
    </button>
  )
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

describe('project view nav mutations', () => {
  beforeEach(() => {
    createViewMock.mockReset()
    invalidateAllProjectDataMock.mockReset()
    reorderViewsMock.mockReset()
    renameViewMock.mockReset()
    setDefaultViewMock.mockReset()
    setHiddenMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves create-view mutations without waiting for background invalidation', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const invalidateDeferred = deferredPromise<void>()

    queryClient.setQueryData(['project', 'workspace-summaries'], makeWorkspaceSummaries())
    createViewMock.mockResolvedValue({
      id: 'gantt',
      isDefault: false,
      isHidden: false,
      name: 'Gantt',
      position: 3,
      viewType: 'gantt',
    })
    invalidateAllProjectDataMock.mockReturnValue(invalidateDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <CreateViewHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Create view'}))

    await waitFor(() => expect(screen.getByText('resolved')).toBeInTheDocument())
    expect(invalidateAllProjectDataMock).toHaveBeenCalledWith(queryClient, 'project-1')

    invalidateDeferred.resolve()
  })

  it('optimistically hides a view and rolls back the cache when the mutation fails', async () => {
    const user = userEvent.setup()
    const queryClient = createQueryClient()
    const hideDeferred = deferredPromise<void>()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    queryClient.setQueryData(['project', 'workspace-summaries'], makeWorkspaceSummaries())
    setHiddenMock.mockReturnValue(hideDeferred.promise)

    render(
      <QueryClientProvider client={queryClient}>
        <HideViewHarness/>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', {name: 'Hide view'}))

    await waitFor(() => {
      const workspaces = queryClient.getQueryData<WorkspaceSummary[]>(['project', 'workspace-summaries'])
      expect(workspaces?.[0]?.projects[0]?.projectViews.find((view) => view.id === 'kanban')?.isHidden).toBe(true)
    })

    hideDeferred.reject(new Error('network down'))

    await waitFor(() => {
      const workspaces = queryClient.getQueryData<WorkspaceSummary[]>(['project', 'workspace-summaries'])
      expect(workspaces?.[0]?.projects[0]?.projectViews.find((view) => view.id === 'kanban')?.isHidden).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })
})
