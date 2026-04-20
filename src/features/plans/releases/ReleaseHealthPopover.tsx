import {useState} from 'react'

import {Popover, PopoverContent, PopoverTrigger} from '../../../components/ui/popover'
import type {ReleaseHealth} from '../plan.types'
import {
  getReleaseHealthChipClasses,
  releaseHealthLabels,
} from './release-utils'

const healthOptions: ReleaseHealth[] = ['on_track', 'at_risk', 'blocked']

type ReleaseHealthPopoverProps = {
  health: ReleaseHealth
  onSelect: (health: ReleaseHealth) => void
}

export function ReleaseHealthPopover({health, onSelect}: ReleaseHealthPopoverProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex w-full items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80 ${getReleaseHealthChipClasses(health)}`}
          type='button'
        >
          {releaseHealthLabels[health]}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-44 p-1.5' sideOffset={4}>
        <div className='px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted'>Health</div>
        {healthOptions.map((option) => (
          <button
            className='flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong'
            key={option}
            onClick={() => {
              onSelect(option)
              setOpen(false)
            }}
            type='button'
          >
            <span className={`h-2.5 w-2.5 rounded-full ${option === 'on_track' ? 'bg-success' : option === 'at_risk' ? 'bg-warning' : 'bg-error'}`}/>
            <span className='flex-1'>{releaseHealthLabels[option]}</span>
            {option === health ? <span className='text-xs text-text-muted'>✓</span> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
