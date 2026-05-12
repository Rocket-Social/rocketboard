import {useState} from 'react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '../../../components/ui/dialog'

type DeleteGroupDialogProps = {
  groupName: string
  onClose: () => void
  onDeleteKeepTasks: () => void
  onDeleteWithTasks: () => void
  taskCount: number
}

export function DeleteGroupDialog({
  groupName,
  onClose,
  onDeleteKeepTasks,
  onDeleteWithTasks,
  taskCount,
}: DeleteGroupDialogProps) {
  const [option, setOption] = useState<'keep' | 'delete'>('keep')

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(28rem,calc(100vw-2rem))]'>
        <DialogHeader>
          <DialogTitle className='text-base'>Delete this group?</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <p className='text-sm text-text-medium'>
            The group <strong className='font-semibold'>{groupName}</strong> contains {taskCount} {taskCount === 1 ? 'task' : 'tasks'}.
          </p>

          <div className='space-y-3'>
            <label className='flex cursor-pointer items-start gap-3'>
              <input
                checked={option === 'keep'}
                className='mt-0.5 h-4 w-4 accent-primary'
                name='deleteOption'
                onChange={() => setOption('keep')}
                type='radio'
                value='keep'
              />
              <span className='text-sm text-text-medium'>
                Delete this group and keep the {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
              </span>
            </label>
            <label className='flex cursor-pointer items-start gap-3'>
              <input
                checked={option === 'delete'}
                className='mt-0.5 h-4 w-4 accent-primary'
                name='deleteOption'
                onChange={() => setOption('delete')}
                type='radio'
                value='delete'
              />
              <span className='text-sm text-text-medium'>
                Delete this group and delete the {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
              </span>
            </label>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} variant='secondary'>Cancel</Button>
          <Button
            onClick={() => {
              if (option === 'keep') {
                onDeleteKeepTasks()
              } else {
                onDeleteWithTasks()
              }
            }}
            variant='primary'
          >
            Delete group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
