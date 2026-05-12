import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {TaskBoardMode} from '../cards/card.types'

export type ProjectTaskModeRepository = {
  getProjectTaskMode(projectId: string): Promise<TaskBoardMode>
  setProjectTaskMode(projectId: string, taskMode: TaskBoardMode): Promise<TaskBoardMode>
}

function parseProjectTaskModeRow(
  row: {taskMode: string} | null,
  message: string,
): TaskBoardMode {
  if (!row) {
    throw new Error(message)
  }

  if (row.taskMode === 'standard' || row.taskMode === 'sprint') {
    return row.taskMode
  }

  throw new Error(message)
}

export const projectTaskModeRepository: ProjectTaskModeRepository = {
  async getProjectTaskMode(projectId) {
    const row = await rpcAdapter.callSingle<{taskMode: string} | null>('get_project_task_mode', {
      target_project_id: projectId,
    })

    return parseProjectTaskModeRow(row, 'The project task mode could not be loaded.')
  },
  async setProjectTaskMode(projectId, taskMode) {
    const row = await rpcAdapter.callSingle<{taskMode: string} | null>('set_project_task_mode', {
      target_project_id: projectId,
      target_task_mode: taskMode,
    })

    return parseProjectTaskModeRow(row, 'The project task mode update could not be confirmed.')
  },
}
