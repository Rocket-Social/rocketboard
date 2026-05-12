import {cn} from '../../lib/cn'

type UsageBarProps = {
  label: string
  current: number
  max: number // -1 = unlimited
  className?: string
}

export function UsageBar({label, current, max, className}: UsageBarProps) {
  if (max === -1) return null // unlimited — don't show bar

  const percent = Math.min(100, Math.round((current / max) * 100))
  const isWarning = percent >= 80 && percent < 100
  const isAtLimit = percent >= 100

  return (
    <div className={cn('space-y-1', className)}>
      <div className='flex items-center justify-between'>
        <span className='text-sm text-text-medium'>{label}</span>
        <span className='font-mono text-xs text-text-muted'>
          {current} of {max}
        </span>
      </div>
      <div
        className='h-1.5 w-full overflow-hidden rounded-full bg-canvas-accent'
        role='progressbar'
        aria-valuenow={current}
        aria-valuemax={max}
        aria-label={`${label}: ${current} of ${max} used`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            isAtLimit ? 'bg-error' : isWarning ? 'bg-warning' : 'bg-primary',
          )}
          style={{width: `${percent}%`}}
        />
      </div>
    </div>
  )
}
