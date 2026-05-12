import type {QueryClient} from '@tanstack/react-query'
import {beforeEach, describe, expect, it} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import type {ProjectTableViewStatesResult} from './project-shell.repository'
import type {ProjectTableViewState} from './project-view.types'
import {
  patchProjectTableViewPersonalLayout,
  patchProjectTableViewSharedConfig,
} from './project-data.cache'

const projectId = 'project-1'
const projectViewId = 'view-1'

function createTableViewState(overrides?: Partial<ProjectTableViewState>): ProjectTableViewState {
  return {
    personalConfig: {
      collapsedGroups: ['group-a'],
      columnWidths: {title: 240},
    },
    sharedConfig: {
      filters: {
        priority: [],
        status: [],
      },
      groupBy: 'group',
      personFilterUserId: null,
      sort: [],
      visibleFieldKeys: ['assignee', 'status'],
    },
    sharedVersion: 1,
    ...overrides,
  }
}

describe('project table view cache patching', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createTestQueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  function seedTableViewState(tableViewState: ProjectTableViewState) {
    queryClient.setQueryData<ProjectTableViewStatesResult>(
      ['project', 'table-view-states', projectId],
      {
        projectViewBackend: {
          message: null,
          status: 'ready',
        },
        tableViewStates: {
          [projectViewId]: tableViewState,
        },
      },
    )
  }

  function getTableViewState() {
    const result = queryClient.getQueryData<ProjectTableViewStatesResult>(['project', 'table-view-states', projectId])
    return result?.tableViewStates[projectViewId]
  }

  it('keeps the latest shared config when a personal-layout response arrives with stale shared data', () => {
    const initialState = createTableViewState()
    const sharedSaveState = createTableViewState({
      sharedConfig: {
        ...initialState.sharedConfig,
        groupBy: 'status',
      },
      sharedVersion: 2,
    })
    const personalLayoutState = createTableViewState({
      personalConfig: {
        collapsedGroups: ['sprint-1'],
        columnWidths: {title: 320},
      },
    })

    seedTableViewState(initialState)

    patchProjectTableViewSharedConfig(queryClient, projectId, projectViewId, sharedSaveState)
    patchProjectTableViewPersonalLayout(queryClient, projectId, projectViewId, personalLayoutState)

    expect(getTableViewState()).toEqual({
      personalConfig: personalLayoutState.personalConfig,
      sharedConfig: sharedSaveState.sharedConfig,
      sharedVersion: sharedSaveState.sharedVersion,
    })
  })

  it('keeps the latest personal layout when a shared-config response arrives with stale personal data', () => {
    const initialState = createTableViewState()
    const personalLayoutState = createTableViewState({
      personalConfig: {
        collapsedGroups: ['group-b'],
        columnWidths: {title: 400},
      },
    })
    const sharedSaveState = createTableViewState({
      sharedConfig: {
        ...initialState.sharedConfig,
        groupBy: 'status',
      },
      sharedVersion: 2,
    })

    seedTableViewState(initialState)

    patchProjectTableViewPersonalLayout(queryClient, projectId, projectViewId, personalLayoutState)
    patchProjectTableViewSharedConfig(queryClient, projectId, projectViewId, sharedSaveState)

    expect(getTableViewState()).toEqual({
      personalConfig: personalLayoutState.personalConfig,
      sharedConfig: sharedSaveState.sharedConfig,
      sharedVersion: sharedSaveState.sharedVersion,
    })
  })
})
