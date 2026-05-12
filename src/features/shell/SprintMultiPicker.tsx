import {CalendarRange, Check, ChevronDown, Search} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Input} from '../../components/ui/input'
import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'
import {cn} from '../../lib/cn'
import {formatShortDate} from '../cards/card-view-mappers'
import type {ProjectSprintRecord} from '../sprints/sprint.types'
import {
  maxTaskScopeSprintSelection,
  resolveTaskScopeQuickSprints,
  sortTaskScopeSprintsByRecency,
} from './task-scope'

type SprintMultiPickerProps = {
  isUnavailable?: boolean
  maxSelected?: number
  onChange: (sprintIds: string[]) => void
  selectedSprintIds: string[]
  sprints: ProjectSprintRecord[]
}

function sprintDateLabel(sprint: ProjectSprintRecord) {
  if (!sprint.startDate && !sprint.endDate) return null
  return `${formatShortDate(sprint.startDate)} - ${formatShortDate(sprint.endDate)}`
}

function getTriggerLabel(selectedSprintIds: string[], sprints: ProjectSprintRecord[]) {
  if (selectedSprintIds.length === 0) {
    return 'Select sprints'
  }

  const quickSprints = resolveTaskScopeQuickSprints(sprints)
  if (selectedSprintIds.length === 1 && quickSprints[0]?.sprint.id === selectedSprintIds[0]) {
    return 'Current sprint'
  }

  if (selectedSprintIds.length === 1) {
    return sprints.find((sprint) => sprint.id === selectedSprintIds[0])?.name ?? '1 sprint'
  }

  return `${selectedSprintIds.length} sprints`
}

export function SprintMultiPicker({
  isUnavailable = false,
  maxSelected = maxTaskScopeSprintSelection,
  onChange,
  selectedSprintIds,
  sprints,
}: SprintMultiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSprintIdSet = useMemo(
    () => new Set(selectedSprintIds),
    [selectedSprintIds],
  )
  const quickSprints = useMemo(
    () => resolveTaskScopeQuickSprints(sprints),
    [sprints],
  )
  const quickSprintIds = useMemo(
    () => new Set(quickSprints.map(({sprint}) => sprint.id)),
    [quickSprints],
  )
  const selectedStandaloneSprints = useMemo(() => {
    const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]))
    return selectedSprintIds
      .map((sprintId) => sprintById.get(sprintId) ?? null)
      .filter((sprint): sprint is ProjectSprintRecord => Boolean(sprint && !quickSprintIds.has(sprint.id)))
  }, [quickSprintIds, selectedSprintIds, sprints])
  const normalizedQuery = query.trim().toLowerCase()
  const searchResults = useMemo(() => {
    const selectedStandaloneIds = new Set(selectedStandaloneSprints.map((sprint) => sprint.id))
    return sortTaskScopeSprintsByRecency(sprints).filter((sprint) => {
      if (quickSprintIds.has(sprint.id) || selectedStandaloneIds.has(sprint.id)) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return sprint.name.toLowerCase().includes(normalizedQuery)
    })
  }, [normalizedQuery, quickSprintIds, selectedStandaloneSprints, sprints])

  const canSelectMore = selectedSprintIds.length < maxSelected

  const handleToggle = (sprintId: string) => {
    const isSelected = selectedSprintIdSet.has(sprintId)
    if (isSelected) {
      if (selectedSprintIds.length === 1) {
        return
      }

      onChange(selectedSprintIds.filter((id) => id !== sprintId))
      return
    }

    if (!canSelectMore) {
      return
    }

    onChange([...selectedSprintIds, sprintId])
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }

  const renderSprintRow = (
    sprint: ProjectSprintRecord,
    label?: string,
  ) => {
    const isSelected = selectedSprintIdSet.has(sprint.id)
    const isDisabled = !isSelected && !canSelectMore
    const meta = sprintDateLabel(sprint)

    return (
      <button
        className={cn(
          'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors',
          isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-canvas-accent',
        )}
        disabled={isDisabled}
        key={label ? `${label}:${sprint.id}` : sprint.id}
        onClick={() => handleToggle(sprint.id)}
        type='button'
      >
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-strong bg-surface-base',
            isSelected ? 'border-primary bg-primary text-white' : '',
          )}
        >
          {isSelected ? <Check className='h-3 w-3'/> : null}
        </span>
        <span className='min-w-0 flex-1'>
          {label ? <span className='block text-[11px] font-semibold uppercase tracking-wide text-text-muted'>{label}</span> : null}
          <span className='block truncate text-sm font-medium text-text-strong'>{sprint.name}</span>
          {meta ? <span className='block truncate text-xs text-text-muted'>{meta}</span> : null}
        </span>
      </button>
    )
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
          type='button'
        >
          <CalendarRange className='h-3.5 w-3.5 text-text-muted'/>
          {isUnavailable && sprints.length === 0 ? 'Sprint history unavailable' : getTriggerLabel(selectedSprintIds, sprints)}
          <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
        </button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-[24rem] p-3'>
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

            <div className='flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>
              <span>Selected {selectedSprintIds.length} of {maxSelected}</span>
              <span>{maxSelected === maxTaskScopeSprintSelection ? 'Up to 3 sprints' : `Up to ${maxSelected} sprints`}</span>
            </div>

            {quickSprints.length > 0 ? (
              <div className='space-y-1'>
                <div className='px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>Quick picks</div>
                <div className='space-y-1'>
                  {quickSprints.map(({label, sprint}) => renderSprintRow(sprint, label))}
                </div>
              </div>
            ) : null}

            {selectedStandaloneSprints.length > 0 ? (
              <div className='space-y-1'>
                <div className='px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>Selected</div>
                <div className='space-y-1'>
                  {selectedStandaloneSprints.map((sprint) => renderSprintRow(sprint))}
                </div>
              </div>
            ) : null}

            <div className='space-y-1'>
              <div className='px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted'>
                {normalizedQuery ? 'Matches' : 'All sprints'}
              </div>
              {searchResults.length > 0 ? (
                <div className='max-h-72 space-y-1 overflow-y-auto pr-1'>
                  {searchResults.map((sprint) => renderSprintRow(sprint))}
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
