import {ChevronDown} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {formatShortDate} from '../cards/card-view-mappers'
import type {ProjectSprintRecord} from '../sprints/sprint.types'

type SprintPickerProps = {
  isUnavailable?: boolean
  onSelect: (sprintId: string) => void
  unavailableLabel?: string
  selectedSprintId: string | null
  sprints: ProjectSprintRecord[]
}

function sprintDateLabel(sprint: ProjectSprintRecord) {
  if (!sprint.startDate && !sprint.endDate) return ''
  return `${formatShortDate(sprint.startDate)} \u2013 ${formatShortDate(sprint.endDate)}`
}

export function SprintPicker({
  isUnavailable = false,
  onSelect,
  selectedSprintId,
  sprints,
  unavailableLabel,
}: SprintPickerProps) {
  const selected = sprints.find((s) => s.id === selectedSprintId) ?? null

  const statusOrder: Record<string, number> = {active: 0, planned: 1, completed: 2}
  const sortedSprints = [...sprints].sort((a, b) => {
    const diff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
    if (diff !== 0) return diff
    const aTime = a.startDate ? new Date(a.startDate).getTime() : Infinity
    const bTime = b.startDate ? new Date(b.startDate).getTime() : Infinity
    return aTime - bTime
  })

  const activePlanned = sortedSprints.filter((s) => s.status !== 'completed')
  const completed = sortedSprints.filter((s) => s.status === 'completed')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
          type='button'
        >
          {selected ? (
            <>
              <span>{selected.name}</span>
              <span className='text-text-muted'>{sprintDateLabel(selected)}</span>
            </>
          ) : (
            <span>{unavailableLabel ?? (isUnavailable ? 'Sprint history unavailable' : 'Select sprint')}</span>
          )}
          <ChevronDown className='h-3.5 w-3.5 text-text-muted' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        {isUnavailable && sprints.length === 0 ? (
          <DropdownMenuItem disabled>
            Sprint history is temporarily unavailable
          </DropdownMenuItem>
        ) : null}
        {activePlanned.length > 0 ? (
          <>
            <DropdownMenuLabel>Sprints</DropdownMenuLabel>
            {activePlanned.map((sprint) => (
              <DropdownMenuItem
                key={sprint.id}
                onClick={() => onSelect(sprint.id)}
              >
                <span className='flex flex-1 items-center gap-2'>
                  {sprint.status === 'active' ? (
                    <span className='h-2 w-2 shrink-0 rounded-full bg-primary' />
                  ) : null}
                  <span>{sprint.name}</span>
                </span>
                {selectedSprintId === sprint.id ? (
                  <span className='text-primary text-xs'>Selected</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {completed.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Completed</DropdownMenuLabel>
            {completed.map((sprint) => (
              <DropdownMenuItem
                key={sprint.id}
                onClick={() => onSelect(sprint.id)}
              >
                <span className='flex-1'>{sprint.name}</span>
                {selectedSprintId === sprint.id ? (
                  <span className='text-primary text-xs'>Selected</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
