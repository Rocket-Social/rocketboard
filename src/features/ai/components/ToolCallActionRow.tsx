// Wave 2 AI Kanban Phase 4 (PR 4-A) — shared per-row atom for the two
// tool-call review surfaces (chat-drawer + card-comment action bar).
//
// D6 keeps the data layers separate — the chat surface keys by
// Anthropic block ids, the card-comment surface keys by stable
// `tool_use_id` audit entries — but the visual row stays unified so
// the two contexts read the same.
//
// D18 ensures the buttons hit a 44px touch target on `< sm:` viewports
// (`max-sm:h-11 max-sm:px-4`) while desktop stays at the existing
// `h-7 px-3` density.

import {Check, X} from 'lucide-react'
import type {ReactNode} from 'react'

import {cn} from '../../../lib/cn'

export type ToolCallActionRowProps = {
  approveLabel?: string
  approveTitle?: string
  className?: string
  description?: ReactNode
  disabled?: boolean
  extraSlot?: ReactNode
  isPending?: boolean
  isPermissionDenied?: boolean
  label: ReactNode
  onApprove?: () => void
  onReject?: () => void
  pendingState?: 'approving' | 'rejecting' | null
  rejectLabel?: string
  rejectTitle?: string
  rowRef?: React.RefObject<HTMLDivElement | null>
}

export function ToolCallActionRow({
  approveLabel = 'Approve',
  approveTitle = 'Approve (⌘↵)',
  className,
  description,
  disabled = false,
  extraSlot,
  isPending = false,
  isPermissionDenied = false,
  label,
  onApprove,
  onReject,
  pendingState = null,
  rejectLabel = 'Reject',
  rejectTitle = 'Reject (Esc)',
  rowRef,
}: ToolCallActionRowProps) {
  const buttonsDisabled = disabled || isPending || isPermissionDenied

  return (
    <div
      className={cn(
        'flex items-start gap-2 py-2',
        className,
      )}
      ref={rowRef}
    >
      <div className='flex-1'>
        <p className='text-sm font-medium text-text-strong'>{label}</p>
        {description ? (
          <p className='mt-0.5 truncate text-xs text-text-muted'>{description}</p>
        ) : null}
        {extraSlot}
      </div>
      {isPermissionDenied ? null : (
        <div className='flex shrink-0 items-center gap-2'>
          {onApprove ? (
            <button
              aria-label={typeof label === 'string' ? `Approve ${label}` : 'Approve'}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-strong',
                'h-7 sm:h-7 max-sm:h-11 max-sm:px-4',
                'disabled:cursor-not-allowed disabled:bg-primary/40',
              )}
              disabled={buttonsDisabled}
              onClick={onApprove}
              title={approveTitle}
              type='button'
            >
              <Check className='h-3 w-3' />
              {pendingState === 'approving' ? 'Approving…' : approveLabel}
            </button>
          ) : null}
          {onReject ? (
            <button
              aria-label={typeof label === 'string' ? `Reject ${label}` : 'Reject'}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg bg-canvas-accent px-3 py-1 text-xs font-medium text-text-medium transition-colors hover:bg-canvas-accent hover:text-text-strong',
                'h-7 sm:h-7 max-sm:h-11 max-sm:px-4',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
              disabled={buttonsDisabled}
              onClick={onReject}
              title={rejectTitle}
              type='button'
            >
              <X className='h-3 w-3' />
              {pendingState === 'rejecting' ? 'Rejecting…' : rejectLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
