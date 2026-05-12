import {ArrowLeft} from 'lucide-react'

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {cn} from '../../lib/cn'

export function RadioCard({
  badge,
  badgeVariant = 'neutral',
  children,
  description,
  disabled = false,
  selected,
  title,
  onSelect,
}: {
  badge?: string
  badgeVariant?: 'accent' | 'neutral' | 'success'
  children?: React.ReactNode
  description: string
  disabled?: boolean
  selected: boolean
  title: string
  onSelect: () => void
}) {
  const badgeColor = badgeVariant === 'success'
    ? 'bg-success/10 text-success border-success/20'
    : badgeVariant === 'accent'
      ? 'bg-primary/10 text-primary border-primary/20'
      : 'border-border-subtle text-text-muted'

  return (
    <button
      aria-checked={selected}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border-subtle hover:border-border-strong',
        disabled && 'cursor-default opacity-50',
      )}
      disabled={disabled}
      onClick={onSelect}
      role='radio'
      type='button'
    >
      <div className='flex items-start gap-3'>
        <div className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-primary' : 'border-text-muted/40',
        )}>
          {selected ? <div className='h-2 w-2 rounded-full bg-primary'/> : null}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-semibold text-text-strong'>{title}</span>
            {badge ? (
              <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', badgeColor)}>
                {badge}
              </span>
            ) : null}
          </div>
          <p className='mt-1 text-sm text-text-muted'>{description}</p>
          {children}
        </div>
      </div>
    </button>
  )
}

export function DialogShell({
  children,
  isDesktop,
  onBack,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode
  isDesktop: boolean
  onBack?: () => void
  onClose: () => void
  subtitle?: string
  title: string
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className={cn(
          'overflow-hidden bg-surface-base',
          isDesktop
            ? 'w-[min(30rem,calc(100vw-2rem))] rounded-[28px]'
            : 'inset-0 left-0 top-0 flex h-full max-h-full w-full max-w-full translate-x-0 translate-y-0 flex-col rounded-none',
        )}
      >
        <DialogHeader className='flex-row items-start gap-3 px-6 py-5 pr-14'>
          {onBack ? (
            <button
              aria-label='Go back'
              className='mt-1 rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
              onClick={onBack}
              type='button'
            >
              <ArrowLeft className='h-4 w-4'/>
            </button>
          ) : null}
          <div>
            <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>
              {subtitle ?? 'Import'}
            </p>
            <DialogTitle className='mt-1 font-display text-2xl'>
              {title}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              Bring notes into Rocketboard from an external source.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto px-6 py-5'>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
