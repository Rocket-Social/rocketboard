import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'

type CreateInitiativeDialogProps = {
  onClose: () => void
  onCreate: (input: {description?: string; name: string; targetDate?: string; visibility?: 'open' | 'private'}) => Promise<void>
}

export function CreateInitiativeDialog({onClose, onCreate}: CreateInitiativeDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await onCreate({
        description: description.trim() || undefined,
        name: name.trim(),
        targetDate: targetDate || undefined,
        visibility: isPrivate ? 'private' : 'open',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-full max-w-md rounded-2xl p-6'>
        <DialogTitle className='mb-4 text-lg'>New Initiative</DialogTitle>

        <div className='space-y-4'>
          <div>
            <label className='mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted'>
              Name
            </label>
            <Input
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit()
              }}
              placeholder='e.g. Payment Integration'
              value={name}
            />
          </div>

          <div>
            <label className='mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted'>
              Description (optional)
            </label>
            <textarea
              className='h-20 w-full resize-none rounded-xl border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
              onChange={(e) => setDescription(e.target.value)}
              placeholder='What is this initiative about?'
              value={description}
            />
          </div>

          <div>
            <label className='mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted'>
              Target Date (optional)
            </label>
            <Input
              onChange={(e) => setTargetDate(e.target.value)}
              type='date'
              value={targetDate}
            />
          </div>
        </div>

        <label className='mt-4 flex cursor-pointer items-center gap-2'>
          <input
            checked={isPrivate}
            className='h-4 w-4 rounded border-border-subtle text-primary focus:ring-primary'
            onChange={(e) => setIsPrivate(e.target.checked)}
            type='checkbox'
          />
          <span className='text-sm text-text-strong'>Private</span>
          <span className='text-xs text-text-muted'>Only you and workspace admins can see this</span>
        </label>

        <div className='mt-6 flex justify-end gap-3'>
          <Button onClick={onClose} variant='secondary'>Cancel</Button>
          <Button disabled={!name.trim() || submitting} onClick={() => void handleSubmit()} variant='primary'>
            {submitting ? 'Creating...' : 'Create Initiative'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
