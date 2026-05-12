// Wave 2 AI Kanban — single run card on the My AI Kanban grid.
//
// Renders the persona avatar (with accent color), card title (sourced
// from the run's prompt as a fallback when the joined card title isn't
// loaded), status pill, project chip, and last-activity timestamp.
//
// The project chip is suppressed for runs whose project is the user's
// Personal AI Workspace (`projects.kind = 'personal_ai_workspace'`)
// because the workspace is hidden from the standard project list — a
// chip pointing nowhere meaningful is noise.

import {ACCENT_BG} from '../ai.constants'
import {agentStatusLabel, agentStatusPillClass} from '../agent.status'
import {cn} from '../../../lib/cn'
import type {AgentRunWithContext} from '../agent.types'

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      month: 'short',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function deriveTitle(run: AgentRunWithContext): string {
  // cards.title is what the user typed in the +New Task modal —
  // clone_template_to_card leaves run.prompt NULL, so prompt is only a
  // meaningful source for Phase 4's assignee-changed dispatch path.
  const cardTitle = (run.card?.title ?? '').trim()
  if (cardTitle) {
    return cardTitle.length > 90 ? `${cardTitle.slice(0, 87)}…` : cardTitle
  }
  const trimmedPrompt = (run.prompt ?? '').trim()
  if (trimmedPrompt) {
    return trimmedPrompt.length > 90 ? `${trimmedPrompt.slice(0, 87)}…` : trimmedPrompt
  }
  if (run.persona?.name) return `Task for ${run.persona.name}`
  return 'Untitled task'
}

type MyAiKanbanRunCardProps = {
  onProjectClick?: (projectId: string) => void
  // Card-level click → resolve the originating schedule and open the
  // edit dialog (handled by the parent). The project chip retains its
  // own click and stops propagation so it doesn't double-fire.
  onRunClick?: (run: AgentRunWithContext) => void
  run: AgentRunWithContext
}

export function MyAiKanbanRunCard({
  onProjectClick,
  onRunClick,
  run,
}: MyAiKanbanRunCardProps) {
  const accentBg =
    ACCENT_BG[run.persona?.accentColor ?? 'blue'] ?? ACCENT_BG.blue
  const personaInitial = (run.persona?.name ?? '?').charAt(0).toUpperCase()
  const isPersonalWorkspace = run.project?.kind === 'personal_ai_workspace'
  const showProjectChip = run.project && !isPersonalWorkspace
  const lastUpdate =
    run.finishedAt ?? run.startedAt ?? run.updatedAt ?? run.createdAt
  const clickable = Boolean(onRunClick)

  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-elevated p-3 shadow-panel text-left',
        clickable
          && 'cursor-pointer transition-colors hover:bg-surface-muted/40 focus-within:ring-2 focus-within:ring-primary-soft',
      )}
      data-testid={`agent-run-card-${run.id}`}
      onClick={clickable ? () => onRunClick?.(run) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onRunClick?.(run)
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className='flex items-start gap-2'>
        <div
          aria-hidden='true'
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white',
            accentBg,
          )}
        >
          {personaInitial}
        </div>
        <p className='flex-1 text-sm font-medium leading-snug text-text-strong'>
          {deriveTitle(run)}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            agentStatusPillClass(run.status),
          )}
        >
          {agentStatusLabel(run.status)}
        </span>
      </div>
      <div className='flex items-center justify-between gap-2 text-xs text-text-muted'>
        {showProjectChip && run.project ? (
          <button
            className='truncate rounded-md bg-canvas-accent px-2 py-0.5 text-xs font-medium text-text-medium hover:bg-canvas-accent/80 hover:text-text-strong'
            onClick={(event) => {
              event.stopPropagation()
              onProjectClick?.(run.project!.id)
            }}
            type='button'
          >
            {run.project.name}
          </button>
        ) : (
          <span className='truncate'>
            {isPersonalWorkspace ? 'Personal' : run.persona?.name ?? ''}
          </span>
        )}
        <span className='shrink-0'>{formatTimestamp(lastUpdate)}</span>
      </div>
    </article>
  )
}
