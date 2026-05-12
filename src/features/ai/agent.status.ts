// Wave 2 AI Kanban Phase 4 (PR 4-B) — shared status presentation map.
//
// Originally inlined in MyAiKanbanRunCard.tsx; extracted here so the
// CardSheet status pill (D16, top-right of the title) and the run-card
// pill stay in lockstep. Future surfaces (TableView assignee column,
// notification copy) can import these directly.
//
// The pill suppresses for cards with no live run AND no terminal-young
// run; that gating happens at the call site (`get_card_detail.agent_run_summary`
// already returns null for stale runs per Phase 4-A D4).

import type {AgentRunStatus} from '../cards/card.types'

export const AGENT_STATUS_LABEL: Record<AgentRunStatus, string> = {
  awaiting_approval: '⏸ Awaiting',
  cancelled: '✕ Cancelled',
  failed: '⚠ Failed',
  queued: 'Queued',
  running: '● Working',
  succeeded: '✓ Done',
}

export const AGENT_STATUS_PILL_CLASS: Record<AgentRunStatus, string> = {
  awaiting_approval: 'bg-warning/12 text-warning',
  cancelled: 'bg-surface-muted text-text-muted',
  failed: 'bg-error/12 text-error',
  queued: 'bg-surface-muted text-text-muted',
  running: 'bg-primary-soft text-primary',
  succeeded: 'bg-success/12 text-success',
}

export function agentStatusLabel(status: string): string {
  return AGENT_STATUS_LABEL[status as AgentRunStatus] ?? status
}

export function agentStatusPillClass(status: string): string {
  return AGENT_STATUS_PILL_CLASS[status as AgentRunStatus] ?? AGENT_STATUS_PILL_CLASS.queued
}
