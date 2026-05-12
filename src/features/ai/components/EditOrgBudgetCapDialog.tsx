// Wave 2 AI Kanban Phase 6-B (D6-19) — inline cap editor.
//
// Single-field dialog opened from <OrgBudgetMeter>. Lets an org admin
// bump (or clear) the calendar-month cap without trips to org settings,
// which is the alpha-cohort self-service requirement that motivated D6-19.
//
// The numeric input accepts USD with two decimals. Empty string clears
// the cap (server validates [0, 999999.99] and null = no cap). Submit
// fires `useUpdateOrgBudgetCapMutation`, which surfaces success / error
// toasts and invalidates the meter's query so the new value renders on
// the next 60s tick (or sooner — invalidate is synchronous-ish via
// React Query cache).

import {useEffect, useState, type FormEvent} from 'react'
import {Loader2} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import {Input} from '../../../components/ui/input'
import {useUpdateOrgBudgetCapMutation} from '../ai.queries'

type EditOrgBudgetCapDialogProps = {
  currentCapUsd: number | null
  isOpen: boolean
  onClose: () => void
  organizationId: string
}

export function EditOrgBudgetCapDialog({
  currentCapUsd,
  isOpen,
  onClose,
  organizationId,
}: EditOrgBudgetCapDialogProps) {
  const mutation = useUpdateOrgBudgetCapMutation()
  const [value, setValue] = useState<string>(() =>
    currentCapUsd === null || currentCapUsd === undefined ? '' : currentCapUsd.toFixed(2),
  )
  const [error, setError] = useState<string | null>(null)

  // Re-hydrate the input when the dialog opens with a different cap
  // (e.g. the meter polled a fresh value while the dialog was closed).
  useEffect(() => {
    if (!isOpen) return
    setValue(
      currentCapUsd === null || currentCapUsd === undefined ? '' : currentCapUsd.toFixed(2),
    )
    setError(null)
  }, [isOpen, currentCapUsd])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organizationId) return

    const trimmed = value.trim()
    let parsedCap: number | null
    if (trimmed === '') {
      parsedCap = null
    } else {
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) {
        setError('Enter a number, or leave blank to clear.')
        return
      }
      if (parsed < 0) {
        setError('Cap must be 0 or greater.')
        return
      }
      if (parsed > 999_999.99) {
        setError('Cap cannot exceed $999,999.99.')
        return
      }
      parsedCap = parsed
    }

    setError(null)
    mutation.mutate(
      {organizationId, newCapUsd: parsedCap},
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  const isSubmitting = mutation.isPending

  return (
    <Dialog onOpenChange={(open) => (!open && !isSubmitting ? onClose() : undefined)} open={isOpen}>
      <DialogContent className='w-[min(28rem,calc(100vw-2rem))]'>
        <DialogHeader>
          <DialogTitle>Edit AI agent budget cap</DialogTitle>
          <DialogDescription>
            Calendar-month cap on AI agent run cost. Resets on the 1st.
            Leave blank to remove the cap.
          </DialogDescription>
        </DialogHeader>

        <form className='flex flex-col gap-4 px-6 py-5' noValidate onSubmit={handleSubmit}>
          <label className='flex flex-col gap-1.5'>
            <span className='text-sm font-medium text-text-strong'>Monthly cap (USD)</span>
            <Input
              autoFocus
              data-testid='edit-org-budget-cap-input'
              disabled={isSubmitting}
              inputMode='decimal'
              min={0}
              onChange={(event) => setValue(event.target.value)}
              placeholder='50.00'
              step={0.01}
              type='number'
              value={value}
            />
            {error ? (
              <span className='text-xs text-rose-700' role='alert'>
                {error}
              </span>
            ) : null}
          </label>

          <div className='flex items-center justify-end gap-2'>
            <Button
              disabled={isSubmitting}
              onClick={onClose}
              type='button'
              variant='ghost'
            >
              Cancel
            </Button>
            <Button
              data-testid='edit-org-budget-cap-save'
              disabled={isSubmitting}
              type='submit'
              variant='primary'
            >
              {isSubmitting ? <Loader2 aria-hidden='true' className='mr-2 h-4 w-4 animate-spin'/> : null}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
