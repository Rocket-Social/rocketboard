import {Zap} from 'lucide-react'

import {ToolCallActionRow} from './ToolCallActionRow'
import type {AiToolCall} from '../ai.types'

type AiToolCallConfirmationProps = {
  onApprove: (toolCallId: string) => void
  onApproveAll: () => void
  onSkip: (toolCallId: string) => void
  toolCalls: AiToolCall[]
}

export function AiToolCallConfirmation({
  onApprove,
  onApproveAll,
  onSkip,
  toolCalls,
}: AiToolCallConfirmationProps) {
  if (toolCalls.length === 0) return null

  return (
    <div className='space-y-2 px-4 py-2'>
      <div className='flex items-center gap-2 text-xs font-medium text-text-muted'>
        <Zap className='h-3.5 w-3.5' />
        <span>Proposed actions</span>
        {toolCalls.length > 1 ? (
          <button
            className='ml-auto rounded-lg px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10'
            onClick={onApproveAll}
            type='button'
          >
            Approve all
          </button>
        ) : null}
      </div>

      {toolCalls.map((tc) => (
        <div
          className='rounded-2xl border border-border-subtle bg-surface-elevated px-3'
          key={tc.id}
        >
          <ToolCallActionRow
            approveLabel='Approve'
            description={tc.description}
            label={tc.action}
            onApprove={() => onApprove(tc.id)}
            onReject={() => onSkip(tc.id)}
            rejectLabel='Skip'
            rejectTitle='Skip'
          />
        </div>
      ))}
    </div>
  )
}
