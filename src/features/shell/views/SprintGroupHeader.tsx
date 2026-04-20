import {Check, ChevronRight, MoreHorizontal, Pencil} from 'lucide-react'
import {useState} from 'react'

import type {Mode} from '../../../app/mode'
import {Badge} from '../../../components/ui/badge'
import {Button} from '../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {formatShortDate} from '../../cards/card-view-mappers'
import type {ProjectTableTask} from '../../cards/card-view-mappers'
import type {ProjectStatusOption, StatusCategory} from '../../cards/card.types'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import {DistributionBar, type DistributionSegment} from './DistributionBar'

type SprintGroupHeaderProps = {
  expanded: boolean
  isConfigurationDisabled?: boolean
  mode?: Mode
  onCompleteSprint: () => void
  onEditSprint: () => void
  onRenameSprint: (name: string) => void
  onStartSprint: () => void
  onToggle: () => void
  sprint: ProjectSprintRecord
  statusOptions: ProjectStatusOption[]
  taskCount: number
  tasks: ProjectTableTask[]
}

function getStatusCategory(statusOptionId: string | null, statusOptions: ProjectStatusOption[]): StatusCategory | null {
  if (!statusOptionId) return null
  const option = statusOptions.find((o) => o.id === statusOptionId)
  return option?.category ?? null
}

function buildProgressSegments(tasks: ProjectTableTask[], statusOptions: ProjectStatusOption[]): DistributionSegment[] {
  let notStarted = 0
  let started = 0
  let completed = 0

  for (const task of tasks) {
    const category = getStatusCategory(task.card.statusOptionId, statusOptions)
    if (category === 'completed') {
      completed++
    } else if (category === 'started') {
      started++
    } else {
      notStarted++
    }
  }

  return [
    {color: '#2f7a55', count: completed, key: 'completed', label: 'Completed'},
    {color: '#335c8f', count: started, key: 'started', label: 'In Progress'},
    {color: 'rgba(217, 209, 197, 0.3)', count: notStarted, key: 'not_started', label: 'Not Started'},
  ]
}

function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate && !endDate) return null
  if (startDate && endDate) return `${formatShortDate(startDate)} \u2014 ${formatShortDate(endDate)}`
  if (startDate) return `${formatShortDate(startDate)} \u2014`
  return `\u2014 ${formatShortDate(endDate)}`
}

function isOverdue(sprint: ProjectSprintRecord): boolean {
  if (sprint.status !== 'active' || !sprint.endDate) return false
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return sprint.endDate < todayStr
}

export function SprintGroupHeader({
  expanded,
  isConfigurationDisabled = false,
  mode: _mode,
  onCompleteSprint,
  onEditSprint,
  onRenameSprint,
  onStartSprint,
  onToggle,
  sprint,
  statusOptions,
  taskCount,
  tasks,
}: SprintGroupHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(sprint.name)

  const dateRange = formatDateRange(sprint.startDate, sprint.endDate)
  const overdue = isOverdue(sprint)
  const segments = buildProgressSegments(tasks, statusOptions)

  const bgClass =
    sprint.status === 'active'
      ? 'bg-surface-elevated'
      : sprint.status === 'completed'
        ? 'bg-surface-muted'
        : 'bg-surface-base'

  const textClass =
    sprint.status === 'completed'
      ? 'text-text-muted'
      : 'text-text-strong'

  const startEdit = () => {
    if (isConfigurationDisabled) return
    setEditValue(sprint.name)
    setEditing(true)
  }

  const saveEdit = () => {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== sprint.name) {
      onRenameSprint(trimmed)
    }
  }

  return (
    <div className={`border-b border-border-subtle ${bgClass} transition-colors`}>
      <div className='flex items-center gap-3 px-3 py-3'>
        {/* LEFT: Sticky zone */}
        <div className='sticky left-0 z-10 flex shrink-0 items-center gap-1'>
          {/* Chevron */}
          <button
            className='flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            type='button'
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}/>
          </button>

          {/* Sprint name — editable */}
          {editing ? (
            <input
              autoFocus
              className={`h-7 bg-transparent font-display text-base font-semibold outline-none ${textClass}`}
              onBlur={saveEdit}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                }
                if (e.key === 'Escape') {
                  setEditing(false)
                }
              }}
              value={editValue}
            />
          ) : (
            <span
              className={`cursor-text font-display text-base font-semibold ${textClass}`}
              onClick={(e) => {
                e.stopPropagation()
                startEdit()
              }}
            >
              {sprint.name}
            </span>
          )}

          {/* Task count badge */}
          <Badge variant='count'>{taskCount}</Badge>
        </div>

        {/* CENTER: Progress bar */}
        {sprint.status !== 'completed' ? (
          <div className='min-w-0 flex-1 px-2'>
            <div className='mx-auto max-w-xs'>
              <DistributionBar segments={segments} total={taskCount}/>
            </div>
          </div>
        ) : (
          <div className='flex-1'/>
        )}

        {/* RIGHT: Date range + lifecycle button */}
        <div className='flex shrink-0 items-center gap-3'>
          {dateRange ? (
            <span className={`whitespace-nowrap text-sm ${overdue ? 'font-medium text-error' : 'text-text-medium'}`}>
              {dateRange}
            </span>
          ) : null}

          {!isConfigurationDisabled ? (
            <div className='flex items-center gap-1'>
              {sprint.status === 'planned' ? (
                <Button onClick={onStartSprint} size='compact' variant='secondary'>
                  Start Sprint
                </Button>
              ) : sprint.status === 'active' ? (
                <Button onClick={onCompleteSprint} size='compact' variant='secondary'>
                  Complete Sprint
                </Button>
              ) : (
                <span className='inline-flex items-center gap-1 text-sm text-text-muted'>
                  <Check className='h-3.5 w-3.5'/>
                  Completed
                </span>
              )}

              {sprint.status !== 'completed' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label='Open sprint actions'
                      className='rounded-lg p-1 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
                      onClick={(e) => e.stopPropagation()}
                      type='button'
                    >
                      <MoreHorizontal className='h-4 w-4'/>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-44'>
                    <DropdownMenuItem onClick={onEditSprint}>
                      <Pencil className='h-4 w-4'/>
                      <span>Edit sprint</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Goal line */}
      {sprint.goal ? (
        <div className='px-3 pb-2 pl-10'>
          <p className='text-sm italic text-text-muted'>{sprint.goal}</p>
        </div>
      ) : null}
    </div>
  )
}

type BacklogGroupHeaderProps = {
  expanded: boolean
  onToggle: () => void
  taskCount: number
}

export function BacklogGroupHeader({
  expanded,
  onToggle,
  taskCount,
}: BacklogGroupHeaderProps) {
  return (
    <div className='border-b border-border-subtle bg-surface-base transition-colors hover:bg-canvas-accent'>
      <div className='sticky left-0 z-10 flex w-fit items-center gap-1 bg-surface-base px-3 py-3'>
        <button
          className='flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong'
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          type='button'
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}/>
        </button>
        <span className='font-display text-base font-semibold text-text-medium'>Backlog</span>
        <Badge variant='count'>{taskCount}</Badge>
      </div>
    </div>
  )
}
