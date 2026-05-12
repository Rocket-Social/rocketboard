import {Check, ChevronDown} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {cn} from '../../lib/cn'
import {CANVAS_ZOOM_LEVELS, formatCanvasZoomLabel} from './canvas-viewport'

type CanvasZoomControlProps = {
  onFit: () => void
  onZoomChange: (scale: number) => void
  scale: number
}

export function CanvasZoomControl({onFit, onZoomChange, scale}: CanvasZoomControlProps) {
  const currentZoomScale = Number.isFinite(scale) ? Number(scale.toFixed(2)) : 1
  const currentZoomLabel = formatCanvasZoomLabel(scale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Canvas zoom ${currentZoomLabel}`}
          className='pointer-events-auto inline-flex h-11 min-w-[82px] items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-elevated/95 px-3 text-sm font-medium text-text-strong shadow-panel backdrop-blur-sm transition-colors hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          type='button'
        >
          <span>{currentZoomLabel}</span>
          <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-[112px] rounded-xl p-1'>
        <DropdownMenuItem className='rounded-lg px-3 py-2.5 text-sm' onSelect={onFit}>
          Fit
        </DropdownMenuItem>
        <DropdownMenuSeparator/>
        {CANVAS_ZOOM_LEVELS.map((zoomLevel) => {
          const zoomLabel = formatCanvasZoomLabel(zoomLevel)
          const isSelected = currentZoomScale === zoomLevel

          return (
            <DropdownMenuItem
              className={cn(
                'justify-between rounded-lg px-3 py-2.5 text-sm',
                isSelected ? 'bg-canvas-accent text-text-strong' : 'text-text-medium',
              )}
              key={zoomLevel}
              onSelect={() => onZoomChange(zoomLevel)}
            >
              <span>{zoomLabel}</span>
              {isSelected ? <Check className='h-3.5 w-3.5 text-primary'/> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
