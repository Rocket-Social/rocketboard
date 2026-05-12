// Wave 2 AI Kanban Phase 5 — Active schedules section.
//
// PRD §6.10 + D5-14: hidden entirely when there are no schedules. The
// Templates section becomes the entire tab content in the empty case;
// no "Active schedules (0)" noise.
//
// Loading skeleton renders 3 placeholder rows while the schedules query
// is still pending (per Pass 2 / §5.4 state matrix).

import {Loader2} from 'lucide-react'

import type {AgentSchedule, AssignablePersona} from '../agent.types'
import {ActiveScheduleRow} from './ActiveScheduleRow'

type ActiveSchedulesSectionProps = {
  deletingScheduleId: string | null
  isError: boolean
  isLoading: boolean
  onConfirmDelete: (schedule: AgentSchedule) => void
  onEdit: (schedule: AgentSchedule) => void
  onPause: (schedule: AgentSchedule) => void
  onResume: (schedule: AgentSchedule) => void
  onRetry: () => void
  pausingScheduleId: string | null
  personas: AssignablePersona[]
  resumingScheduleId: string | null
  schedules: AgentSchedule[]
}

export function ActiveSchedulesSection({
  deletingScheduleId,
  isError,
  isLoading,
  onConfirmDelete,
  onEdit,
  onPause,
  onResume,
  onRetry,
  pausingScheduleId,
  personas,
  resumingScheduleId,
  schedules,
}: ActiveSchedulesSectionProps) {
  if (isLoading) {
    return (
      <section aria-label='Active schedules' data-testid='active-schedules-loading'>
        <h2 className='font-display text-base font-semibold text-text-strong'>
          Active schedules
        </h2>
        <ul className='mt-3 flex flex-col gap-2'>
          {[0, 1, 2].map((i) => (
            <li
              className='flex h-16 items-center gap-3 rounded-2xl border border-border-subtle bg-surface-muted p-4'
              key={i}
            >
              <Loader2 className='h-4 w-4 animate-spin text-text-muted'/>
              <span className='text-sm text-text-muted'>Loading…</span>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (isError) {
    return (
      <section aria-label='Active schedules' data-testid='active-schedules-error'>
        <h2 className='font-display text-base font-semibold text-text-strong'>
          Active schedules
        </h2>
        <div className='mt-3 flex flex-col items-center gap-2 rounded-2xl border border-border-subtle bg-surface-muted p-6 text-center'>
          <p className='text-sm text-text-strong'>Couldn&apos;t load schedules.</p>
          <button
            className='text-sm font-medium text-primary underline-offset-2 hover:underline'
            onClick={onRetry}
            type='button'
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  if (schedules.length === 0) {
    // D5-14: section hidden entirely.
    return null
  }

  return (
    <section aria-label='Active schedules' data-testid='active-schedules-section'>
      <h2 className='font-display text-base font-semibold text-text-strong'>
        Active schedules ({schedules.length})
      </h2>
      <ul className='mt-3 flex flex-col gap-2'>
        {schedules.map((schedule) => {
          const persona = personas.find((p) => p.id === schedule.personaId) ?? null
          return (
            <ActiveScheduleRow
              isDeleting={deletingScheduleId === schedule.id}
              isPausing={pausingScheduleId === schedule.id}
              isResuming={resumingScheduleId === schedule.id}
              key={schedule.id}
              onConfirmDelete={() => onConfirmDelete(schedule)}
              onEdit={() => onEdit(schedule)}
              onPause={() => onPause(schedule)}
              onResume={() => onResume(schedule)}
              persona={persona}
              schedule={schedule}
            />
          )
        })}
      </ul>
    </section>
  )
}
