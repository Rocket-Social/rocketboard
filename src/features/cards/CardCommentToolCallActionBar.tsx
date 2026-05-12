// Wave 2 AI Kanban Phase 4 (PR 4-A) — tool-call review action bar
// rendered inline below the streaming agent comment that produced it.
//
// The bar is keyed by stable `tool_use_id` (Anthropic block ids) so a
// worker-driven reorder of the JSONB array doesn't shuffle React
// children. At click time we re-derive the array index by
// `findIndex(tc => tc.toolUseId === id)` so the canonical RPC call
// uses the JSONB position. If the lookup returns -1, the entry was
// removed/reordered by a concurrent path and we fire the D9 race-toast
// + invalidate (no buttons, no destructive call).
//
// Decisions reflected:
//   D6 — composes the shared `<ToolCallActionRow>` atom.
//   D9 — onError race UX is centralized in the mutations (ai.queries.ts).
//   D11 — `canEdit=false` collapses the bar to a muted permission row.
//   D12 — stable identity by `toolUseId` + transient `'approving'` /
//         `'rejecting'` state per row.
//   D17 — empty pending list renders nothing; permission-denied shows
//         a single "Awaiting review by an editor" line.
//   D18 — Cmd/Ctrl+Enter approves, Esc rejects, both buttons are
//         44px on mobile via the shared atom.

import {Zap} from 'lucide-react'
import {useCallback, useEffect, useRef, useState, type KeyboardEvent} from 'react'

import {ToolCallActionRow} from '../ai/components/ToolCallActionRow'
import {
  useApproveAgentToolCallMutation,
  useRejectAgentToolCallMutation,
} from '../ai/ai.queries'
import type {AgentToolCallAuditEntry} from './card.types'

const HUMANIZE_TOOL_NAMES: Record<string, string> = {
  add_comment: 'Add comment to card',
  agent_add_comment: 'Add comment to card',
  agent_attach_subtask: 'Attach a sub-task',
  agent_create_card_in_project: 'Create a card',
  agent_set_card_assignee: 'Reassign card',
  agent_set_card_priority: 'Set card priority',
  agent_set_card_status: 'Set card status',
  attach_subtask: 'Attach a sub-task',
  create_card_in_project: 'Create a card',
  set_card_assignee: 'Reassign card',
  set_card_priority: 'Set card priority',
  set_card_status: 'Set card status',
}

function humanizeAction(name: string, args: Record<string, unknown>): string {
  const base = HUMANIZE_TOOL_NAMES[name] ?? name.replace(/_/g, ' ')
  if (name.includes('set_card_status') && typeof args.status_label === 'string') {
    return `Set status to ${args.status_label}`
  }
  if (name.includes('set_card_priority') && typeof args.priority === 'string') {
    return `Set priority to ${args.priority}`
  }
  return base
}

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
    .filter(([key, value]) => key !== 'card_id' && value !== null && value !== undefined)
    .slice(0, 3)
    .map(([key, value]) => {
      if (typeof value === 'string' && value.length > 40) {
        return `${key}: "${value.slice(0, 37)}…"`
      }
      if (typeof value === 'object') {
        return `${key}: …`
      }
      return `${key}: ${String(value)}`
    })
  return entries.join(' · ')
}

export type CardCommentToolCallActionBarProps = {
  canEdit: boolean
  cardId: string
  runId: string
  toolCalls: AgentToolCallAuditEntry[]
}

type TransientState = {
  byToolUseId: Map<string, 'approving' | 'rejecting'>
}

export function CardCommentToolCallActionBar({
  canEdit,
  cardId,
  runId,
  toolCalls,
}: CardCommentToolCallActionBarProps) {
  const approve = useApproveAgentToolCallMutation()
  const reject = useRejectAgentToolCallMutation()
  const [transient, setTransient] = useState<TransientState>(() => ({byToolUseId: new Map()}))
  const focusedRowRef = useRef<HTMLDivElement | null>(null)

  // Pending entries by stable tool_use_id (D12). Order in the rendered
  // bar mirrors the order in the worker-written audit array.
  const pendingEntries = toolCalls.filter((entry) => entry.status === 'awaiting_approval')

  // Prune transient state when the canonical status flips (the
  // realtime push lands first because the RPC's onSuccess invalidates
  // — D8 patch path keeps the cache hot).
  useEffect(() => {
    setTransient((prev) => {
      if (prev.byToolUseId.size === 0) return prev
      const next = new Map(prev.byToolUseId)
      let changed = false
      for (const id of next.keys()) {
        const stillPending = pendingEntries.some((entry) => entry.toolUseId === id)
        if (!stillPending) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? {byToolUseId: next} : prev
    })
  }, [pendingEntries])

  const setRowState = useCallback(
    (toolUseId: string, state: 'approving' | 'rejecting' | null) => {
      setTransient((prev) => {
        const next = new Map(prev.byToolUseId)
        if (state === null) {
          next.delete(toolUseId)
        } else {
          next.set(toolUseId, state)
        }
        return {byToolUseId: next}
      })
    },
    [],
  )

  const handleApprove = useCallback(
    (toolUseId: string) => {
      // Re-derive the JSONB index at click time so a concurrent
      // worker write (reorder / append) doesn't dispatch the wrong
      // entry. -1 is the race signal; the mutation onError path
      // turns it into the same info toast the server raises.
      const index = toolCalls.findIndex((entry) => entry.toolUseId === toolUseId)
      if (index < 0) return
      setRowState(toolUseId, 'approving')
      approve.mutate(
        {cardId, runId, toolCallIndex: index},
        {
          onSettled: () => setRowState(toolUseId, null),
        },
      )
    },
    [approve, cardId, runId, setRowState, toolCalls],
  )

  const handleReject = useCallback(
    (toolUseId: string) => {
      const index = toolCalls.findIndex((entry) => entry.toolUseId === toolUseId)
      if (index < 0) return
      setRowState(toolUseId, 'rejecting')
      reject.mutate(
        {cardId, runId, toolCallIndex: index},
        {
          onSettled: () => setRowState(toolUseId, null),
        },
      )
    },
    [cardId, reject, runId, setRowState, toolCalls],
  )

  if (pendingEntries.length === 0) return null

  return (
    <section
      aria-label='Proposed agent actions'
      className='ml-9 mt-2 rounded-2xl border border-border-subtle bg-surface-elevated p-3 transition-all duration-200'
      data-testid={`tool-call-action-bar-${runId}`}
    >
      <div className='flex items-center gap-2 text-xs font-medium text-text-muted'>
        <Zap className='h-3.5 w-3.5' />
        <span>Proposed actions</span>
      </div>
      {!canEdit ? (
        <div className='mt-1 px-1 py-2 text-xs text-text-muted' role='note'>
          Awaiting review by an editor.
        </div>
      ) : null}
      <div className='mt-1 divide-y divide-border-subtle/40'>
        {pendingEntries.map((entry) => {
          const pendingState = transient.byToolUseId.get(entry.toolUseId) ?? null
          const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
            if (!canEdit) return
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              handleApprove(entry.toolUseId)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              handleReject(entry.toolUseId)
            }
          }
          return (
            <div
              data-testid={`tool-call-row-${entry.toolUseId}`}
              key={entry.toolUseId}
              onKeyDown={handleKeyDown}
              tabIndex={canEdit ? 0 : -1}
            >
              <ToolCallActionRow
                description={summarizeArgs(entry.args)}
                isPending={pendingState !== null}
                isPermissionDenied={!canEdit}
                label={humanizeAction(entry.name, entry.args)}
                onApprove={canEdit ? () => handleApprove(entry.toolUseId) : undefined}
                onReject={canEdit ? () => handleReject(entry.toolUseId) : undefined}
                pendingState={pendingState}
                rowRef={focusedRowRef}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
