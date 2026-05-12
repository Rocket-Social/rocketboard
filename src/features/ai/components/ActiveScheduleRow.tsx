// Wave 2 AI Kanban Phase 5 — single Active schedule row.
//
// Layout per PRD §6.10:
//   ●Sara   Daily Crash Log Triage              [Pause] [Edit] [Delete]
//           weekdays at 10:00 PT · last run 3d ago
//
// Responsive (D5-17): single row at sm: and above; below sm: stacks to
// 3 tiers (persona+title / cron+last-run / button cluster). Each tier
// keeps 44px tap height per Phase 4 D18.
//
// Inline Delete confirmation strip per D5-9 (no modal). Toast that
// points the user at the Jobs section is fired by the parent
// (recovery hint after delete success).

import {useEffect, useRef, useState} from 'react'
import {Loader2, Pencil, Pause, Play, Trash2} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import {findJobBySlug, SOURCE_JOB_SLUG_KEY} from '../agent-recipes'
import {describeCron} from '../cron-format'
import type {AgentSchedule, AssignablePersona} from '../agent.types'
import {PersonaAvatar} from './PersonaAvatar'

type ActiveScheduleRowProps = {
  isDeleting?: boolean
  isPausing?: boolean
  isResuming?: boolean
  onConfirmDelete: () => void
  onEdit: () => void
  onPause: () => void
  onResume: () => void
  persona: AssignablePersona | null
  schedule: AgentSchedule
}

const FALLBACK_TITLE = 'Untitled schedule'
const FALLBACK_PERSONA_NAME = 'Unknown agent'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'no runs yet'
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'unknown'
  const deltaMs = Date.now() - ts
  if (deltaMs < 0) return 'just now'
  const seconds = Math.floor(deltaMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export function ActiveScheduleRow({
  isDeleting = false,
  isPausing = false,
  isResuming = false,
  onConfirmDelete,
  onEdit,
  onPause,
  onResume,
  persona,
  schedule,
}: ActiveScheduleRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const liveRegionRef = useRef<HTMLDivElement | null>(null)

  // Auto-revert confirmation strip after the row remounts (e.g. after a
  // failed delete). Doesn't matter for the success case — row vanishes.
  useEffect(() => {
    if (!isDeleting && confirmingDelete) {
      // Stay confirming until user clicks Cancel or Delete.
    }
  }, [isDeleting, confirmingDelete])

  const cardTemplate = schedule.cardTemplate ?? {}
  const title = typeof cardTemplate.title === 'string' && cardTemplate.title.trim()
    ? cardTemplate.title
    : FALLBACK_TITLE

  const sourceSlug =
    typeof cardTemplate[SOURCE_JOB_SLUG_KEY] === 'string'
      ? (cardTemplate[SOURCE_JOB_SLUG_KEY] as string)
      : null
  const sourceJob = findJobBySlug(sourceSlug)

  const personaName = persona?.name ?? FALLBACK_PERSONA_NAME
  const cronSummary = describeCron(schedule.cronExpression, schedule.timezone)
  const lastRunRelative = formatRelativeTime(schedule.lastRunAt)
  const isPaused = schedule.isPaused

  const handleDeleteClick = () => {
    setConfirmingDelete(true)
  }
  const handleCancelDelete = () => {
    setConfirmingDelete(false)
  }
  const handleConfirmDelete = () => {
    onConfirmDelete()
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border border-border-subtle p-4 sm:flex-row sm:items-center sm:gap-4 ${
        isPaused ? 'bg-surface-muted opacity-80' : 'bg-surface-elevated'
      }`}
      data-testid={`active-schedule-row-${schedule.id}`}
    >
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <PersonaAvatar
          accentColor={persona?.accentColor}
          name={persona?.name}
          size='md'
        />
        <div className='flex min-w-0 flex-1 flex-col'>
          <p className='truncate text-sm font-medium text-text-strong'>{title}</p>
          <p className='truncate text-xs text-text-muted'>
            {personaName} · {cronSummary} · last run {lastRunRelative}
            {sourceJob ? ` · from ${sourceJob.name}` : ''}
          </p>
        </div>
      </div>

      {confirmingDelete ? (
        <div
          aria-live='polite'
          className='flex flex-wrap items-center gap-2 rounded-xl bg-error/10 p-2 text-xs text-error'
          data-testid={`active-schedule-row-${schedule.id}-confirm`}
          ref={liveRegionRef}
        >
          <span>Delete this schedule? Future runs cancelled.</span>
          <Button
            disabled={isDeleting}
            onClick={handleCancelDelete}
            size='compact'
            type='button'
            variant='ghost'
          >
            Cancel
          </Button>
          <Button
            className='bg-error text-white hover:brightness-110'
            data-testid={`active-schedule-row-${schedule.id}-confirm-delete`}
            disabled={isDeleting}
            onClick={handleConfirmDelete}
            size='compact'
            type='button'
            variant='primary'
          >
            {isDeleting ? <Loader2 className='h-4 w-4 animate-spin'/> : <Trash2 className='h-4 w-4'/>}
            Delete
          </Button>
        </div>
      ) : (
        <div className='flex flex-wrap items-center gap-2'>
          {isPaused ? (
            <Button
              data-testid={`active-schedule-row-${schedule.id}-resume`}
              disabled={isResuming}
              onClick={onResume}
              size='compact'
              type='button'
              variant='ghost'
            >
              {isResuming ? <Loader2 className='h-4 w-4 animate-spin'/> : <Play className='h-4 w-4'/>}
              Resume
            </Button>
          ) : (
            <Button
              data-testid={`active-schedule-row-${schedule.id}-pause`}
              disabled={isPausing}
              onClick={onPause}
              size='compact'
              type='button'
              variant='ghost'
            >
              {isPausing ? <Loader2 className='h-4 w-4 animate-spin'/> : <Pause className='h-4 w-4'/>}
              Pause
            </Button>
          )}
          <Button
            data-testid={`active-schedule-row-${schedule.id}-edit`}
            onClick={onEdit}
            size='compact'
            type='button'
            variant='ghost'
          >
            <Pencil className='h-4 w-4'/>
            Edit
          </Button>
          <Button
            data-testid={`active-schedule-row-${schedule.id}-delete`}
            onClick={handleDeleteClick}
            size='compact'
            type='button'
            variant='ghost'
          >
            <Trash2 className='h-4 w-4'/>
            Delete
          </Button>
        </div>
      )}
    </li>
  )
}
