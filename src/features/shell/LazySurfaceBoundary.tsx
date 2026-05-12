import {Suspense, type ReactNode} from 'react'

import {ErrorBoundary} from '../../components/ErrorBoundary'

type LazySurfaceBoundaryVariant = 'dialog' | 'inline' | 'popover'

type LazySurfaceBoundaryProps = {
  children: ReactNode
  label: string
  onDismiss?: () => void
  variant?: LazySurfaceBoundaryVariant
}

function LazySurfaceFallback({
  label,
  onDismiss,
  onRetry,
  variant,
}: {
  label: string
  onDismiss?: () => void
  onRetry: () => void
  variant: LazySurfaceBoundaryVariant
}) {
  const containerClassName = variant === 'dialog'
    ? 'fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4'
    : variant === 'popover'
      ? 'w-72 p-1.5'
      : 'flex justify-center px-4 py-4'

  const cardClassName = variant === 'dialog'
    ? 'w-full max-w-sm rounded-3xl border border-border-subtle bg-surface-base p-6 shadow-float'
    : 'rounded-2xl border border-border-subtle bg-surface-base p-4 shadow-float'

  return (
    <div className={containerClassName}>
      <div className={cardClassName}>
        <p className='font-mono text-xs uppercase text-error'>
          {label} failed to load.
        </p>
        <div className='mt-4 flex items-center gap-4'>
          <button
            className='text-sm text-text-secondary'
            onClick={onRetry}
            type='button'
          >
            Retry
          </button>
          {variant === 'dialog' && onDismiss ? (
            <button
              className='text-sm text-text-secondary'
              onClick={onDismiss}
              type='button'
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function LazySurfaceLoading({
  onDismiss,
  variant,
}: {
  onDismiss?: () => void
  variant: LazySurfaceBoundaryVariant
}) {
  if (variant !== 'dialog') {
    return null
  }

  return (
    <div className='fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4'>
      <div className='w-full max-w-sm rounded-3xl border border-border-subtle bg-surface-base p-6 shadow-float'>
        <p className='font-mono text-xs uppercase text-text-muted'>
          Loading
        </p>
        {onDismiss ? (
          <button
            className='mt-4 text-sm text-text-secondary'
            onClick={onDismiss}
            type='button'
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function LazySurfaceBoundary({
  children,
  label,
  onDismiss,
  variant = 'inline',
}: LazySurfaceBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={({reset}) => (
        <LazySurfaceFallback
          label={label}
          onDismiss={onDismiss}
          onRetry={reset}
          variant={variant}
        />
      )}
      label={label}
    >
      <Suspense fallback={
        <LazySurfaceLoading
          onDismiss={onDismiss}
          variant={variant}
        />
      }>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}
