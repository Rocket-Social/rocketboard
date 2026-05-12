import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'

const initiativeQueriesMockState = vi.hoisted(() => ({
  invalidateAllProjectData: vi.fn(() => Promise.resolve()),
}))

vi.mock('../projects/project-shell.queries', () => ({
  invalidateAllProjectData: initiativeQueriesMockState.invalidateAllProjectData,
}))

import {
  invalidateInitiativeAffectedProjects,
  workspaceInitiativesQueryOptions,
  workspaceInitiativeSparklineQueryOptions,
  workspaceInitiativeSummariesQueryOptions,
} from './initiative.queries'

describe('workspace initiative query options', () => {
  beforeEach(() => {
    initiativeQueriesMockState.invalidateAllProjectData.mockClear()
  })

  it('stay disabled until a workspace id exists', () => {
    expect(workspaceInitiativesQueryOptions('').enabled).toBe(false)
    expect(workspaceInitiativeSummariesQueryOptions('').enabled).toBe(false)
    expect(workspaceInitiativeSparklineQueryOptions('').enabled).toBe(false)

    expect(workspaceInitiativesQueryOptions('workspace-1').enabled).toBe(true)
    expect(workspaceInitiativeSummariesQueryOptions('workspace-1').enabled).toBe(true)
    expect(workspaceInitiativeSparklineQueryOptions('workspace-1').enabled).toBe(true)
  })

  it('invalidates only concrete affected project ids for initiative changes', async () => {
    const queryClient = createTestQueryClient()

    await invalidateInitiativeAffectedProjects(queryClient, [
      'project-2',
      '',
      null,
      'project-1',
      'project-2',
      undefined,
    ])

    expect(initiativeQueriesMockState.invalidateAllProjectData).toHaveBeenCalledTimes(2)
    expect(initiativeQueriesMockState.invalidateAllProjectData).toHaveBeenNthCalledWith(1, queryClient, 'project-2')
    expect(initiativeQueriesMockState.invalidateAllProjectData).toHaveBeenNthCalledWith(2, queryClient, 'project-1')
  })
})
