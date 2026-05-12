import {beforeEach, describe, expect, it, vi} from 'vitest'

const {callSingleMock, getBrowserTimeZoneMock} = vi.hoisted(() => ({
  callSingleMock: vi.fn(),
  getBrowserTimeZoneMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    callSingle: callSingleMock,
  },
}))

vi.mock('../../lib/timezone', () => ({
  getBrowserTimeZone: getBrowserTimeZoneMock,
}))

import {setupRepository} from './setup.repository'

describe('setupRepository', () => {
  beforeEach(() => {
    callSingleMock.mockReset()
    getBrowserTimeZoneMock.mockReset()
    getBrowserTimeZoneMock.mockReturnValue('America/Los_Angeles')
  })

  it('forwards the browser timezone when bootstrapping a workspace', async () => {
    callSingleMock.mockResolvedValue({route: {projectSlug: 'project', viewId: 'view-1', viewType: 'table', workspaceSlug: 'workspace'}})

    await setupRepository.bootstrapWorkspace({
      projectName: 'Getting Started',
      workspaceName: 'My Workspace',
    })

    expect(callSingleMock).toHaveBeenCalledWith('bootstrap_workspace', {
      target_project_name: 'Getting Started',
      target_timezone: 'America/Los_Angeles',
      target_workspace_name: 'My Workspace',
    })
  })

  it('forwards the browser timezone when creating a workspace', async () => {
    callSingleMock.mockResolvedValue({route: {projectSlug: 'project', viewId: 'view-1', viewType: 'table', workspaceSlug: 'workspace'}})

    await setupRepository.createWorkspace({
      access: 'private',
      organizationId: 'org-1',
      projectName: 'Getting Started',
      workspaceName: 'My Workspace',
    })

    expect(callSingleMock).toHaveBeenCalledWith('create_workspace', {
      target_org_id: 'org-1',
      target_project_name: 'Getting Started',
      target_timezone: 'America/Los_Angeles',
      target_workspace_access: 'private',
      target_workspace_name: 'My Workspace',
    })
  })

  it('looks up the current user pending invite redirect', async () => {
    callSingleMock.mockResolvedValue({
      acceptToken: 'invite-token',
      resourceType: 'organization',
    })

    await setupRepository.getPendingInviteForCurrentUser()

    expect(callSingleMock).toHaveBeenCalledWith('get_pending_invite_for_current_user')
  })
})
