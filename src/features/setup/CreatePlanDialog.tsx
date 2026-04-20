import {FilePlus2} from 'lucide-react'
import {useEffect, useState} from 'react'

import {Button} from '../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {Input} from '../../components/ui/input'
import type {PlanViewType} from '../plans/plan.types'

const planBoardTypes: PlanViewType[] = ['roadmap', 'releases', 'scorecard']

export type CreatePlanInput = {
  planName: string
  viewTypes: PlanViewType[]
}

type CreatePlanDialogProps = {
  defaultViewType?: PlanViewType
  isOpen: boolean
  onClose: () => void
  onCreate: (input: CreatePlanInput) => Promise<void> | void
}

const planBoardLabels: Record<PlanViewType, string> = {
  releases: 'Releases',
  roadmap: 'Roadmap',
  scorecard: 'Scorecard',
}

const planBoardDescriptions: Record<PlanViewType, string> = {
  releases: 'Track what ships, when it ships, and what changed',
  roadmap: 'Visual timeline of what you\'re building and when',
  scorecard: 'Prioritize with ICE/RICE scoring frameworks',
}

export function CreatePlanDialog({
  defaultViewType,
  isOpen,
  onClose,
  onCreate,
}: CreatePlanDialogProps) {
  const hasFixedViewType = defaultViewType !== undefined
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [planName, setPlanName] = useState('')
  const [selectedViewTypes, setSelectedViewTypes] = useState<PlanViewType[]>(
    defaultViewType ? [defaultViewType] : ['roadmap'],
  )

  useEffect(() => {
    if (isOpen) {
      setPlanName('')
      setIsSubmitting(false)
      setSelectedViewTypes(defaultViewType ? [defaultViewType] : ['roadmap'])
    }
  }, [isOpen, defaultViewType])

  const toggleViewType = (viewType: PlanViewType) => {
    setSelectedViewTypes((current) => {
      if (current.includes(viewType)) {
        return current.filter((item) => item !== viewType)
      }
      return [...current, viewType]
    })
  }

  const handleSubmit = async () => {
    const viewTypes = hasFixedViewType && defaultViewType
      ? [defaultViewType]
      : selectedViewTypes

    if (!planName.trim() || viewTypes.length === 0 || isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      await onCreate({
        planName: planName.trim(),
        viewTypes,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='w-[min(30rem,calc(100vw-2rem))] rounded-[28px] bg-surface-base'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Create Plan</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Add a plan to this workspace.</DialogTitle>
          <DialogDescription className='mt-2'>
            Plans are a set of planning boards around a similar theme.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 px-6 py-5'>
          <label className='space-y-2'>
            <span className='text-sm font-medium text-text-strong'>Plan name</span>
            <Input
              autoFocus
              onChange={(event) => setPlanName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSubmit()
              }}
              placeholder='e.g., Q2 Roadmap'
              value={planName}
            />
          </label>

          {!hasFixedViewType ? (
            <div className='space-y-3 rounded-3xl border border-border-subtle bg-surface-elevated/60 p-4'>
              <div>
                <p className='text-sm font-medium text-text-strong'>Planning boards</p>
                <p className='mt-1 text-sm text-text-medium'>
                  Choose which boards to include.
                </p>
              </div>

              <div className='space-y-2'>
                {planBoardTypes.map((viewType) => {
                  const selected = selectedViewTypes.includes(viewType)
                  const label = planBoardLabels[viewType]
                  const description = planBoardDescriptions[viewType]

                  return (
                    <button
                      aria-label={`${label} board`}
                      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-primary bg-primary-soft/40 text-text-strong'
                          : 'border-border-subtle bg-surface-base text-text-medium hover:border-primary/40'
                      }`}
                      key={viewType}
                      onClick={() => toggleViewType(viewType)}
                      type='button'
                    >
                      <span aria-hidden='true' className='flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-canvas-accent text-sm font-medium text-text-strong'>
                        {label.slice(0, 1)}
                      </span>
                      <span className='space-y-0.5'>
                        <span className='block text-sm font-medium'>{label}</span>
                        <span className='block text-xs text-text-muted'>{description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {selectedViewTypes.length === 0 ? (
                <p className='text-sm text-error'>Pick at least one planning board.</p>
              ) : null}
            </div>
          ) : null}

          <div className='flex justify-end gap-2'>
            <Button onClick={onClose} variant='ghost'>
              Cancel
            </Button>
            <Button
              disabled={!planName.trim() || isSubmitting || selectedViewTypes.length === 0}
              onClick={() => void handleSubmit()}
              variant='primary'
            >
              <FilePlus2 className='h-4 w-4'/>
              {isSubmitting ? 'Creating…' : 'Create plan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
