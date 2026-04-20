import {useState} from 'react'

import {useToast} from '../../components/ui/toast'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import type {TaskBoardMode} from '../cards/card.types'
import {useSetProjectTaskModeMutation} from '../projects/project-task-mode.mutations'
import {useProjectChrome} from './project/ProjectChromeContext'
import {useProjectData} from './project/ProjectDataContext'
import {TaskModeMenu} from './TaskModeMenu'

function getTaskModeLabel(taskMode: TaskBoardMode) {
  return taskMode === 'sprint' ? 'Sprint' : 'Standard'
}

export function ProjectTaskModeControl() {
  const {toast} = useToast()
  const {canEditProject, projectId} = useProjectChrome()
  const {projectTaskMode, projectTaskModeReady} = useProjectData()
  const setProjectTaskModeMutation = useSetProjectTaskModeMutation(projectId)
  const [isSaving, setIsSaving] = useState(false)

  return (
    <TaskModeMenu
      disabled={isSaving || !projectTaskModeReady}
      disabledReason={canEditProject ? null : 'Guest users cannot set task mode.'}
      isLoading={!projectTaskModeReady}
      onTaskModeChange={(nextTaskMode) => {
        if (!canEditProject || isSaving || !projectTaskModeReady || nextTaskMode === projectTaskMode) {
          return
        }

        setIsSaving(true)
        void setProjectTaskModeMutation.mutateAsync(nextTaskMode)
          .then(() => {
            toast({
              description: 'Table, kanban, and gantt updated for everyone on this project.',
              title: `Project task mode set to ${getTaskModeLabel(nextTaskMode)}`,
            })
          })
          .catch((error) => {
            toast({
              description: getErrorMessage(error, 'The project task mode could not be updated.'),
              title: "Couldn't update project task mode",
              variant: 'error',
            })
          })
          .finally(() => {
            setIsSaving(false)
          })
      }}
      taskMode={projectTaskMode}
    />
  )
}
