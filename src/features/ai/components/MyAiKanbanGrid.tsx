// Wave 2 AI Kanban — status-grouped grid for the My AI Kanban tab.
//
// Four columns per PRD §6.2:
//   - To Do   — `status='queued'` (also catches schedule-pending state)
//   - Working — `status='running'`
//   - Awaiting — `status='awaiting_approval'`
//   - Done    — terminal states (`succeeded`, `failed`, `cancelled`)
//
// The persona-grouped and project-grouped views described in §6.2 land
// in a follow-up; this PR ships the default Status grouping only so the
// surface is functional end-to-end before the secondary axis is wired.

import type {AgentRunStatus, AgentRunWithContext} from '../agent.types'
import {MyAiKanbanRunCard} from './MyAiKanbanRunCard'

type StatusBucket = 'to_do' | 'working' | 'awaiting' | 'done'

const STATUS_TO_BUCKET: Record<AgentRunStatus, StatusBucket> = {
  awaiting_approval: 'awaiting',
  cancelled: 'done',
  failed: 'done',
  queued: 'to_do',
  running: 'working',
  succeeded: 'done',
}

const COLUMNS: Array<{bucket: StatusBucket; label: string}> = [
  {bucket: 'to_do', label: 'To Do'},
  {bucket: 'working', label: 'Working'},
  {bucket: 'awaiting', label: 'Awaiting'},
  {bucket: 'done', label: 'Done'},
]

type MyAiKanbanGridProps = {
  onProjectClick?: (projectId: string) => void
  onRunClick?: (run: AgentRunWithContext) => void
  runs: AgentRunWithContext[]
}

export function MyAiKanbanGrid({onProjectClick, onRunClick, runs}: MyAiKanbanGridProps) {
  const groups: Record<StatusBucket, AgentRunWithContext[]> = {
    awaiting: [],
    done: [],
    to_do: [],
    working: [],
  }
  for (const run of runs) {
    const bucket = STATUS_TO_BUCKET[run.status as AgentRunStatus] ?? 'to_do'
    groups[bucket].push(run)
  }

  return (
    <div
      className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'
      data-testid='my-ai-kanban-grid'
    >
      {COLUMNS.map((column) => {
        const columnRuns = groups[column.bucket]
        return (
          <section
            aria-label={column.label}
            className='flex flex-col gap-2 rounded-3xl bg-canvas-accent p-3'
            data-bucket={column.bucket}
            data-testid={`my-ai-kanban-column-${column.bucket}`}
            key={column.bucket}
          >
            <header className='flex items-center justify-between px-1 pt-1'>
              <span className='text-xs font-semibold uppercase tracking-wide text-text-muted'>
                {column.label}
              </span>
              <span className='text-xs font-medium text-text-muted'>{columnRuns.length}</span>
            </header>
            <div className='flex flex-col gap-2'>
              {columnRuns.length === 0 ? (
                <p className='px-1 py-2 text-xs text-text-muted'>—</p>
              ) : (
                columnRuns.map((run) => (
                  <MyAiKanbanRunCard
                    key={run.id}
                    onProjectClick={onProjectClick}
                    onRunClick={onRunClick}
                    run={run}
                  />
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
