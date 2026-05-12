import {useEffect, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import {Input} from '../../../components/ui/input'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'

type CreateSprintDialogProps = {
  defaultEndDate: string
  defaultStartDate: string
  existingSprintCount: number
  initialSprint: Pick<ProjectSprintRecord, 'endDate' | 'goal' | 'id' | 'name' | 'startDate'> | null
  onClose: () => void
  onSubmitSprint: (input: {endDate?: string | null; goal?: string | null; name: string; startDate?: string | null}) => void
  open: boolean
}

export function CreateSprintDialog({
  defaultEndDate,
  defaultStartDate,
  existingSprintCount,
  initialSprint,
  onClose,
  onSubmitSprint,
  open,
}: CreateSprintDialogProps) {
  const isEditing = initialSprint !== null
  const [name, setName] = useState(initialSprint?.name ?? `Sprint ${existingSprintCount + 1}`)
  const [startDate, setStartDate] = useState(initialSprint?.startDate ?? defaultStartDate)
  const [endDate, setEndDate] = useState(initialSprint?.endDate ?? defaultEndDate)
  const [showGoal, setShowGoal] = useState(Boolean(initialSprint?.goal))
  const [goal, setGoal] = useState(initialSprint?.goal ?? '')

  useEffect(() => {
    if (!open) return

    const nextGoal = initialSprint?.goal ?? ''
    setName(initialSprint?.name ?? `Sprint ${existingSprintCount + 1}`)
    setStartDate(initialSprint?.startDate ?? defaultStartDate)
    setEndDate(initialSprint?.endDate ?? defaultEndDate)
    setGoal(nextGoal)
    setShowGoal(Boolean(nextGoal))
  }, [defaultEndDate, defaultStartDate, existingSprintCount, initialSprint?.id, open])

  const handleSubmit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    onSubmitSprint({
      endDate: endDate || null,
      goal: goal.trim() || null,
      name: trimmedName,
      startDate: startDate || null,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(28rem,calc(100vw-2rem))]'>
        <DialogHeader>
          <DialogTitle className='text-base'>{isEditing ? 'Edit Sprint' : 'New Sprint'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div>
            <label className='mb-1.5 block text-sm font-medium text-text-medium' htmlFor='create-sprint-name'>Name</label>
            <Input
              autoFocus
              id='create-sprint-name'
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              value={name}
            />
          </div>

          <div className='flex gap-3'>
            <div className='flex-1'>
              <label className='mb-1.5 block text-sm font-medium text-text-medium' htmlFor='create-sprint-start-date'>Start date</label>
              <Input
                id='create-sprint-start-date'
                onChange={(e) => setStartDate(e.target.value)}
                type='date'
                value={startDate}
              />
            </div>
            <div className='flex-1'>
              <label className='mb-1.5 block text-sm font-medium text-text-medium' htmlFor='create-sprint-end-date'>End date</label>
              <Input
                id='create-sprint-end-date'
                onChange={(e) => setEndDate(e.target.value)}
                type='date'
                value={endDate}
              />
            </div>
          </div>

          {showGoal ? (
            <div>
              <label className='mb-1.5 block text-sm font-medium text-text-medium' htmlFor='create-sprint-goal'>Goal</label>
              <textarea
                autoFocus
                className='min-h-[72px] w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
                id='create-sprint-goal'
                onChange={(e) => setGoal(e.target.value)}
                placeholder='What do you want to achieve this sprint?'
                rows={3}
                value={goal}
              />
            </div>
          ) : (
            <button
              className='text-sm font-medium text-primary hover:text-primary-strong'
              onClick={() => setShowGoal(true)}
              type='button'
            >
              + Add a goal
            </button>
          )}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose} variant='ghost'>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={handleSubmit}
            variant='primary'
          >
            {isEditing ? 'Save Changes' : 'Create Sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
