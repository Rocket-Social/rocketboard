import {FilePlus2} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'

export type CreateInitiativeInput = {
  initiativeName: string
}

type CreateInitiativeDialogProps = {
  isOpen: boolean
  onClose: () => void
  onCreate: (input: CreateInitiativeInput) => Promise<void> | void
}

export function CreateInitiativeDialog({
  isOpen,
  onClose,
  onCreate,
}: CreateInitiativeDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [initiativeName, setInitiativeName] = useState('')

  const handleSubmit = async () => {
    if (!initiativeName.trim() || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onCreate({initiativeName: initiativeName.trim()})
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(30rem,calc(100vw-2rem))] rounded-[28px] bg-surface-base'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Create Initiatives</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Add an initiative board</DialogTitle>
          <DialogDescription className='mt-2'>
            Track strategic goals and link them to project work.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 px-6 py-5'>
          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Initiative name</span>
            <Input
              autoFocus
              onChange={(event) => setInitiativeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSubmit()
              }}
              placeholder='e.g., Q3 Goals'
              value={initiativeName}
            />
          </label>

          <div className='flex justify-end gap-2'>
            <Button onClick={onClose} variant='ghost'>
              Cancel
            </Button>
            <Button
              disabled={!initiativeName.trim() || isSubmitting}
              onClick={() => void handleSubmit()}
              variant='primary'
            >
              <FilePlus2 className='h-4 w-4'/>
              {isSubmitting ? 'Creating…' : 'Create initiative'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
