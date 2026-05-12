// Wave 2 AI Kanban Phase 4 (PR 4-B) — agent status pill rendered
// top-right of the CardSheet title.
//
// D16 visual conventions:
//   rounded-full px-2 py-0.5 text-xs
//   primary-soft bg + primary text for running (default through agentStatusPillClass)
//   persona avatar circle (h-5 w-5) immediately before the label
//
// Source-of-truth: `get_card_detail.agent_run_summary` (PR 4-A SQL).
// The summary already follows the live-first ordering (D4) and
// suppresses stale terminal runs >24h, so the caller just renders
// when summary is non-null.

import {agentStatusLabel, agentStatusPillClass} from '../agent.status'
import {PersonaAvatar} from './PersonaAvatar'
import {cn} from '../../../lib/cn'
import type {AgentCardRunSummary} from '../../cards/card.types'

export type AgentStatusPillProps = {
  className?: string
  summary: AgentCardRunSummary | null
}

export function AgentStatusPill({className, summary}: AgentStatusPillProps) {
  if (!summary) return null
  return (
    <span
      aria-label={`Agent status: ${agentStatusLabel(summary.status)}, ${summary.personaName}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        agentStatusPillClass(summary.status),
        className,
      )}
      data-testid='agent-status-pill'
    >
      <PersonaAvatar
        accentColor={summary.personaAccentColor}
        name={summary.personaName}
        size='sm'
      />
      <span>{agentStatusLabel(summary.status)}</span>
    </span>
  )
}
