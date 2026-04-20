import { Check, SkipForward, Zap } from 'lucide-react'

import type { AiToolCall } from '../ai.types'

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
    <div className="space-y-2 px-4 py-2">
      <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
        <Zap className="h-3.5 w-3.5" />
        <span>Proposed actions</span>
        {toolCalls.length > 1 ? (
          <button
            className="ml-auto rounded-lg px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            onClick={onApproveAll}
            type="button"
          >
            Approve all
          </button>
        ) : null}
      </div>

      {toolCalls.map((tc) => (
        <div
          className="rounded-2xl border border-border-subtle bg-surface-elevated p-3"
          key={tc.id}
        >
          <p className="text-sm font-medium text-text-strong">{tc.action}</p>
          <p className="mt-0.5 text-xs text-text-muted">{tc.description}</p>
          <div className="mt-2 flex gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              onClick={() => onApprove(tc.id)}
              type="button"
            >
              <Check className="h-3 w-3" />
              Approve
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-lg bg-canvas-accent px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong"
              onClick={() => onSkip(tc.id)}
              type="button"
            >
              <SkipForward className="h-3 w-3" />
              Skip
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
