import {beforeEach, describe, expect, it, vi} from 'vitest'

const {rpcCallSingleMock} = vi.hoisted(() => ({
  rpcCallSingleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    callSingle: rpcCallSingleMock,
  },
}))

import {projectTaskModeRepository} from './project-task-mode.repository'

describe('projectTaskModeRepository', () => {
  beforeEach(() => {
    rpcCallSingleMock.mockReset()
  })

  it('reads the project task mode from the dedicated project RPC', async () => {
    rpcCallSingleMock.mockResolvedValue({taskMode: 'sprint'})

    await expect(projectTaskModeRepository.getProjectTaskMode('project-1')).resolves.toBe('sprint')

    expect(rpcCallSingleMock).toHaveBeenCalledWith('get_project_task_mode', {
      target_project_id: 'project-1',
    })
  })

  it('throws when the read RPC returns no row', async () => {
    rpcCallSingleMock.mockResolvedValue(null)

    await expect(projectTaskModeRepository.getProjectTaskMode('project-1')).rejects.toThrow(
      'The project task mode could not be loaded.',
    )
  })

  it('throws when the read RPC returns an invalid mode', async () => {
    rpcCallSingleMock.mockResolvedValue({taskMode: 'board'})

    await expect(projectTaskModeRepository.getProjectTaskMode('project-1')).rejects.toThrow(
      'The project task mode could not be loaded.',
    )
  })

  it('writes the project task mode through the dedicated project RPC', async () => {
    rpcCallSingleMock.mockResolvedValue({taskMode: 'sprint'})

    await expect(projectTaskModeRepository.setProjectTaskMode('project-1', 'sprint')).resolves.toBe('sprint')

    expect(rpcCallSingleMock).toHaveBeenCalledWith('set_project_task_mode', {
      target_project_id: 'project-1',
      target_task_mode: 'sprint',
    })
  })

  it('throws when the write RPC returns no row', async () => {
    rpcCallSingleMock.mockResolvedValue(null)

    await expect(projectTaskModeRepository.setProjectTaskMode('project-1', 'sprint')).rejects.toThrow(
      'The project task mode update could not be confirmed.',
    )
  })

  it('throws when the write RPC returns an invalid mode', async () => {
    rpcCallSingleMock.mockResolvedValue({taskMode: 'board'})

    await expect(projectTaskModeRepository.setProjectTaskMode('project-1', 'sprint')).rejects.toThrow(
      'The project task mode update could not be confirmed.',
    )
  })
})
