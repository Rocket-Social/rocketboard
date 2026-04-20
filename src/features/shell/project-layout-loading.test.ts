import {describe, expect, it} from 'vitest'

import {
  shouldBlockProjectShell,
  shouldShowProjectShellSurfaceSkeleton,
} from './project-layout-loading'

describe('project-layout-loading', () => {
  it('blocks the shell until structural project data is ready', () => {
    expect(
      shouldBlockProjectShell({
        fieldsPending: false,
        hasResolvedProject: true,
        hasWorkspace: true,
        isAuthenticated: true,
        priorityPending: false,
        sessionPending: false,
        statusPending: false,
        workspacesPending: false,
      }),
    ).toBe(false)

    expect(
      shouldBlockProjectShell({
        fieldsPending: false,
        hasResolvedProject: true,
        hasWorkspace: true,
        isAuthenticated: true,
        priorityPending: true,
        sessionPending: false,
        statusPending: false,
        workspacesPending: false,
      }),
    ).toBe(true)
  })

  it('keeps volatile project data loading inside the content surface', () => {
    expect(
      shouldShowProjectShellSurfaceSkeleton({
        cardsPending: false,
        groupsPending: false,
        sprintsPending: false,
        tableViewStatesPending: false,
      }),
    ).toBe(false)

    expect(
      shouldShowProjectShellSurfaceSkeleton({
        cardsPending: true,
        groupsPending: false,
        sprintsPending: false,
        tableViewStatesPending: false,
      }),
    ).toBe(true)
  })
})
