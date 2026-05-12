import {Calendar, ChevronDown, Search} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Input} from '../../components/ui/input'
import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'
import {cn} from '../../lib/cn'
import {formatShortDate} from '../cards/card-view-mappers'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {
  resolveTaskScopeQuickSprints,
  sortTaskScopeSprintsByRecency,
} from './task-scope'

type SprintPickerProps = {
  isUnavailable?: boolean
  onSelect: (sprintId: string) => void
  unavailableLabel?: string
  selectedSprintId: string | null
  sprints: ProjectSprintRecord[]
}

function sprintDateLabel(sprint: ProjectSprintRecord) {
  if (!sprint.startDate && !sprint.endDate) return ''
  return `${formatShortDate(sprint.startDate)} - ${formatShortDate(sprint.endDate)}`
}

function renderSprintMeta(sprint: ProjectSprintRecord) {
  const dateLabel = sprintDateLabel(sprint)
  if (!dateLabel) {
    return sprint.status === 'active' ? 'Active sprint' : null
  }

  return sprint.status === 'active' ? `Active sprint · ${dateLabel}` : dateLabel
}

export function SprintPicker({
  isUnavailable = false,
  onSelect,
  selectedSprintId,
  sprints,
  unavailableLabel,
}: SprintPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSprint = useMemo(
    () => sprints.find((sprint) => sprint.id === selectedSprintId) ?? null,
    [selectedSprintId, sprints],
  )
  const quickSprints = useMemo(
    () => resolveTaskScopeQuickSprints(sprints),
    [sprints],
  )
  const quickSprintIds = useMemo(
    () => new Set(quickSprints.map(({sprint}) => sprint.id)),
    [quickSprints],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const extraSelectedSprints = useMemo(() => (
    selectedSprint && !quickSprintIds.has(selectedSprint.id) ? [selectedSprint] : []
  ), [quickSprintIds, selectedSprint])
  const searchResults = useMemo(() => {
    const extraSelectedIds = new Set(extraSelectedSprints.map((sprint) => sprint.id))
    return sortTaskScopeSprintsByRecency(sprints).filter((sprint) => {
      if (quickSprintIds.has(sprint.id) || extraSelectedIds.has(sprint.id)) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return sprint.name.toLowerCase().includes(normalizedQuery)
    })
  }, [extraSelectedSprints, normalizedQuery, quickSprintIds, sprints])

  const handleSelect = (sprintId: string) => {
    onSelect(sprintId)
    setOpen(false)
    setQuery('')
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }

  const renderSprintButton = (
    sprint: ProjectSprintRecord,
    label?: string,
  ) => (
    <button
      className='flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-canvas-accent'
      key={label ? `${label}:${sprint.id}` : sprint.id}
      onClick={() => handleSelect(sprint.id)}
      type='button'
    >
      <span
        className={cn(
          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-border-strong',
          sprint.status === 'active' ? 'bg-primary' : 'bg-border-strong',
        )}
      />
      <span className='min-w-0 flex-1'>
        {label ? <span className='block text-[11px] font-semibold uppercase tracking-wide text-text-muted'>{label}</span> : null}
        <span className='block truncate text-sm font-medium text-text-strong'>{sprint.name}</span>
        {renderSprintMeta(sprint) ? (
          <span className='block truncate text-xs text-text-muted'>{renderSprintMeta(sprint)}</span>
        ) : null}
      </span>
      {selectedSprintId === sprint.id ? (
        <span className='text-xs font-medium text-primary'>Selected</span>
      ) : null}
    </button>
  )

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
          type='button'
        >
          <Calendar className='h-3.5 w-3.5 text-text-muted'/>
          {selectedSprint ? (
            <>
              <span>{selectedSprint.name}</span>
              {sprintDateLabel(selectedSprint) ? (
                <span className='text-text-muted'>{sprintDateLabel(selectedSprint)}</span>
              ) : null}
            </>
          ) : (
            <span>{unavailableLabel ?? (isUnavailable ? 'Sprint history unavailable' : 'Select sprint')}</span>
          )}
          <ChevronDown className='h-3.5 w-3.5 text-text-muted' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-[22rem] p-3'>
        {isUnavailable && sprints.length === 0 ? (
          <div className='rounded-xl border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-muted'>
            Sprint history is temporarily unavailable.
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='relative'>
              <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
              <Input
                className='pl-9'
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Search sprints'
                value={query}
              />
            </div>

            {quickSprints.length > 0 ? (
              <div className='space-y-1'>
                <div className='px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>Quick picks</div>
                <div className='space-y-1'>
                  {quickSprints.map(({label, sprint}) => renderSprintButton(sprint, label))}
                </div>
              </div>
            ) : null}

            {extraSelectedSprints.length > 0 ? (
              <div className='space-y-1'>
                <div className='px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>Selected</div>
                <div className='space-y-1'>
                  {extraSelectedSprints.map((sprint) => renderSprintButton(sprint))}
                </div>
              </div>
            ) : null}

            <div className='space-y-1'>
              <div className='px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>
                {normalizedQuery ? 'Matches' : 'All sprints'}
              </div>
              {searchResults.length > 0 ? (
                <div className='max-h-72 space-y-1 overflow-y-auto pr-1'>
                  {searchResults.map((sprint) => renderSprintButton(sprint))}
                </div>
              ) : (
                <div className='rounded-xl border border-dashed border-border-subtle px-3 py-4 text-sm text-text-muted'>
                  No sprints match that search.
                </div>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
