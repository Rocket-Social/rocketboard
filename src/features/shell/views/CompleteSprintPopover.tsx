import {useState} from 'react'

import {Button} from '../../../components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import {
  formatCompleteSprintMoveTargetLabel,
} from '../../sprints/complete-sprint-target'
import type {CompleteSprintAction, CompleteSprintMoveTarget} from '../../sprints/sprint.types'

type CompleteSprintDialogProps = {
  incompleteCount: number
  moveTarget: CompleteSprintMoveTarget
  onClose: () => void
  onComplete: (action: CompleteSprintAction) => void
  sprintName: string
}

export function CompleteSprintDialog({
  incompleteCount,
  moveTarget,
  onClose,
  onComplete,
  sprintName,
}: CompleteSprintDialogProps) {
  const hasIncompleteTasks = incompleteCount > 0
  const [action, setAction] = useState<CompleteSprintAction>(hasIncompleteTasks ? 'move_to_next' : 'keep')
  const moveLabel = formatCompleteSprintMoveTargetLabel(moveTarget)

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(20rem,calc(100vw-2rem))]'>
        <DialogHeader>
          <DialogTitle className='text-base'>Complete &ldquo;{sprintName}&rdquo;?</DialogTitle>
          <DialogDescription className='sr-only'>
            Choose what to do with any incomplete tasks before completing this sprint.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {hasIncompleteTasks ? (
            <>
              <p className='text-sm text-text-medium'>
                {incompleteCount} incomplete {incompleteCount === 1 ? 'task' : 'tasks'} remaining:
              </p>

              <div className='space-y-3'>
                <label className='flex cursor-pointer items-start gap-3'>
                  <input
                    checked={action === 'move_to_next'}
                    className='mt-0.5 h-4 w-4 accent-primary'
                    name='completeAction'
                    onChange={() => setAction('move_to_next')}
                    type='radio'
                    value='move_to_next'
                  />
                  <span className='text-sm text-text-medium'>{moveLabel}</span>
                </label>
                <label className='flex cursor-pointer items-start gap-3'>
                  <input
                    checked={action === 'return_to_backlog'}
                    className='mt-0.5 h-4 w-4 accent-primary'
                    name='completeAction'
                    onChange={() => setAction('return_to_backlog')}
                    type='radio'
                    value='return_to_backlog'
                  />
                  <span className='text-sm text-text-medium'>Return incomplete tasks to Backlog</span>
                </label>
                <label className='flex cursor-pointer items-start gap-3'>
                  <input
                    checked={action === 'keep'}
                    className='mt-0.5 h-4 w-4 accent-primary'
                    name='completeAction'
                    onChange={() => setAction('keep')}
                    type='radio'
                    value='keep'
                  />
                  <span className='text-sm text-text-medium'>Leave incomplete tasks in this completed sprint</span>
                </label>
              </div>
            </>
          ) : (
            <p className='text-sm text-text-medium'>All tasks in this sprint are complete.</p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} variant='ghost'>Cancel</Button>
          <Button
            onClick={() => onComplete(action)}
            variant='primary'
          >
            Complete Sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
