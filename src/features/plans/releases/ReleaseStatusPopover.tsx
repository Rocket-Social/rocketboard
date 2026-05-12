import {useState} from 'react'

import {Popover, PopoverContent, PopoverTrigger} from '../../../components/ui/popover'
import type {ReleaseStatus} from '../plan.types'
import {
  getNextReleaseStatuses,
  getReleaseStatusChipClasses,
  releaseStatusLabels,
} from './release-utils'

type ReleaseStatusPopoverProps = {
  onSelect: (status: ReleaseStatus) => void
  status: ReleaseStatus
}

export function ReleaseStatusPopover({onSelect, status}: ReleaseStatusPopoverProps) {
  const [open, setOpen] = useState(false)
  const nextStatuses = getNextReleaseStatuses(status)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex w-full items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80 ${getReleaseStatusChipClasses(status)}`}
          type='button'
        >
          {releaseStatusLabels[status]}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-52 p-1.5' sideOffset={4}>
        <div className='px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted'>Next Status</div>
        {nextStatuses.map((nextStatus) => (
          <button
            className='flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
            key={nextStatus}
            onClick={() => {
              onSelect(nextStatus)
              setOpen(false)
            }}
            type='button'
          >
            <span>{releaseStatusLabels[nextStatus]}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getReleaseStatusChipClasses(nextStatus)}`}>
              {releaseStatusLabels[nextStatus]}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
