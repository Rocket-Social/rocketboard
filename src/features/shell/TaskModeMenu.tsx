import {Check, ChevronDown, Rows3} from 'lucide-react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type {TaskBoardMode} from '../cards/card.types'

type TaskModeMenuProps = {
  disabled?: boolean
  disabledReason?: string | null
  isLoading?: boolean
  onTaskModeChange: (taskMode: TaskBoardMode) => void
  taskMode: TaskBoardMode
}

function getTaskModeLabel(taskMode: TaskBoardMode) {
  return taskMode === 'sprint' ? 'Sprint' : 'Standard'
}

export function TaskModeMenu({
  disabled = false,
  disabledReason = null,
  isLoading = false,
  onTaskModeChange,
  taskMode,
}: TaskModeMenuProps) {
  const activeLabel = isLoading ? 'Loading' : getTaskModeLabel(taskMode)
  const menuDisabled = disabledReason != null || isLoading

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={disabledReason ?? `Project task mode: ${activeLabel}`}
          className={taskMode === 'standard' ? 'border-border-strong/60' : undefined}
          disabled={disabled}
          title={disabledReason ?? undefined}
          variant={taskMode === 'sprint' ? 'primary' : 'secondary'}
        >
          <Rows3 className='h-4 w-4'/>
          {activeLabel}
          <ChevronDown className='h-3 w-3'/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Task mode</DropdownMenuLabel>
        <div className='px-3 pb-2 text-xs leading-relaxed text-text-muted'>
          Changes table, kanban, and gantt for everyone on this project.
        </div>
        {disabledReason ? (
          <div className='px-3 pb-2 text-xs text-text-muted'>
            {disabledReason}
          </div>
        ) : null}
        <DropdownMenuItem disabled={menuDisabled} onClick={() => onTaskModeChange('standard')} title={disabledReason ?? undefined}>
          <span className='flex-1'>Standard</span>
          {taskMode === 'standard' ? <Check className='h-4 w-4 text-primary'/> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem disabled={menuDisabled} onClick={() => onTaskModeChange('sprint')} title={disabledReason ?? undefined}>
          <span className='flex-1'>Sprint</span>
          {taskMode === 'sprint' ? <Check className='h-4 w-4 text-primary'/> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
