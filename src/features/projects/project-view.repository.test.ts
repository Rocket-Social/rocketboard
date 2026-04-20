import {beforeEach, describe, expect, it, vi} from 'vitest'

const {rpcCallMock, rpcCallSingleMock} = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
  rpcCallSingleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: rpcCallMock,
    callSingle: rpcCallSingleMock,
  },
}))

import {projectViewRepository} from './project-view.repository'

describe('projectViewRepository', () => {
  beforeEach(() => {
    rpcCallMock.mockReset()
    rpcCallSingleMock.mockReset()
  })

  it('maps GitHub view payloads returned from createView', async () => {
    rpcCallSingleMock.mockResolvedValue({
      id: 'github-view',
      isDefault: false,
      isHidden: false,
      name: 'GitHub',
      position: 3,
      viewType: 'github',
    })

    await expect(projectViewRepository.createView('project-1', 'github')).resolves.toEqual({
      id: 'github-view',
      isDefault: false,
      isHidden: false,
      name: 'GitHub',
      position: 3,
      viewType: 'github',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith('create_project_view', {
      target_project_id: 'project-1',
      target_view_type: 'github',
    })
  })

  it('creates document views with the document enum value', async () => {
    rpcCallSingleMock.mockResolvedValue({
      id: 'document-view',
      isDefault: false,
      isHidden: false,
      name: 'Document',
      position: 3,
      viewType: 'document',
    })

    await expect(projectViewRepository.createView('project-1', 'document')).resolves.toEqual({
      id: 'document-view',
      isDefault: false,
      isHidden: false,
      name: 'Document',
      position: 3,
      viewType: 'document',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith('create_project_view', {
      target_project_id: 'project-1',
      target_view_type: 'document',
    })
  })

  it('writes kanban with the current enum while still accepting legacy board payloads', async () => {
    rpcCallSingleMock.mockResolvedValue({
      id: 'kanban-view',
      isDefault: false,
      isHidden: false,
      name: 'Kanban',
      position: 2,
      viewType: 'board',
    })

    await expect(projectViewRepository.createView('project-1', 'kanban')).resolves.toEqual({
      id: 'kanban-view',
      isDefault: false,
      isHidden: false,
      name: 'Kanban',
      position: 2,
      viewType: 'kanban',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith('create_project_view', {
      target_project_id: 'project-1',
      target_view_type: 'kanban',
    })
  })

  it('maps canvas view payloads returned from createView', async () => {
    rpcCallSingleMock.mockResolvedValue({
      id: 'canvas-view',
      isDefault: false,
      isHidden: false,
      name: 'Canvas',
      position: 4,
      viewType: 'canvas',
    })

    await expect(projectViewRepository.createView('project-1', 'canvas')).resolves.toEqual({
      id: 'canvas-view',
      isDefault: false,
      isHidden: false,
      name: 'Canvas',
      position: 4,
      viewType: 'canvas',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith('create_project_view', {
      target_project_id: 'project-1',
      target_view_type: 'canvas',
    })
  })

  it('saves table shared config without task mode', async () => {
    rpcCallMock.mockResolvedValue([{
      base_shared_version: 1,
      personal_collapsed_groups: [],
      personal_column_widths: {},
      project_view_id: 'view-1',
      shared_filters: {priority: [], status: []},
      shared_group_by: 'group',
      shared_person_filter_user_id: null,
      shared_sort: [],
      shared_version: 2,
      shared_visible_field_keys: ['status'],
    }])

    await expect(projectViewRepository.setSharedConfig('view-1', {
      filters: {priority: [], status: []},
      groupBy: 'group',
      personFilterUserId: null,
      sort: [],
      visibleFieldKeys: ['status'],
    })).resolves.toMatchObject({
      sharedConfig: expect.objectContaining({
        groupBy: 'group',
        visibleFieldKeys: ['status'],
      }),
      sharedVersion: 2,
    })

    expect(rpcCallMock).toHaveBeenCalledWith('set_project_table_shared_config_by_view_id', {
      target_filters: {priority: [], status: []},
      target_group_by: 'group',
      target_person_filter_user_id: null,
      target_project_view_id: 'view-1',
      target_sort: [],
      target_visible_field_keys: ['status'],
    })
  })
})
