import {Filter, X} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {ProjectTableFilters} from '../projects/project-view.types'

type QuickFilterMenuProps = {
  filters: ProjectTableFilters
  onFiltersChange: (filters: ProjectTableFilters) => void
  priorityOptions: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border-subtle bg-surface-base text-text-medium hover:bg-canvas-accent'
      }`}
      onClick={onClick}
      type='button'
    >
      {label}
    </button>
  )
}

export function QuickFilterMenu({filters, onFiltersChange, priorityOptions, statusOptions}: QuickFilterMenuProps) {
  const [open, setOpen] = useState(false)

  const hasStatusFilter = filters.status.length > 0
  const hasPriorityFilter = filters.priority.length > 0
  const isActive = hasStatusFilter || hasPriorityFilter

  // Count active filter categories (not individual options)
  let filterCategoryCount = 0
  if (hasStatusFilter) filterCategoryCount++
  if (hasPriorityFilter) filterCategoryCount++

  const completedOptionIds = statusOptions
    .filter((o) => o.category === 'completed')
    .map((o) => o.id)
  const incompleteOptionIds = statusOptions
    .filter((o) => o.category !== 'completed')
    .map((o) => o.id)

  const toggleStatus = (statusId: string) => {
    const newStatus = filters.status.includes(statusId)
      ? filters.status.filter((s) => s !== statusId)
      : [...filters.status, statusId]
    onFiltersChange({...filters, status: newStatus})
  }

  const togglePriority = (priorityId: string) => {
    const newPriority = filters.priority.includes(priorityId)
      ? filters.priority.filter((p) => p !== priorityId)
      : [...filters.priority, priorityId]
    onFiltersChange({...filters, priority: newPriority})
  }

  const clearAll = () => {
    onFiltersChange({priority: [], status: []})
  }

  const statusSet = new Set(filters.status)
  const isIncomplete =
    incompleteOptionIds.length > 0
    && incompleteOptionIds.every((id) => statusSet.has(id))
    && completedOptionIds.every((id) => !statusSet.has(id))
  const isCompleted =
    completedOptionIds.length > 0
    && completedOptionIds.every((id) => statusSet.has(id))
    && incompleteOptionIds.every((id) => !statusSet.has(id))

  const setIncomplete = () => {
    if (isIncomplete) {
      onFiltersChange({...filters, status: []})
    } else {
      onFiltersChange({...filters, status: incompleteOptionIds})
    }
  }

  const setCompleted = () => {
    if (isCompleted) {
      onFiltersChange({...filters, status: []})
    } else {
      onFiltersChange({...filters, status: completedOptionIds})
    }
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button variant={isActive ? 'primary' : 'secondary'}>
          <Filter className='h-4 w-4'/>
          Filter
          {filterCategoryCount > 0 ? (
            <span className='text-sm opacity-70'>/ {filterCategoryCount}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-72'>
        <div className='flex items-center justify-between px-3 py-2'>
          <span className='text-xs font-medium uppercase tracking-wider text-text-muted'>Filters</span>
          {isActive ? (
            <button
              className='flex items-center gap-1 text-xs text-primary hover:text-primary/80'
              onClick={clearAll}
              type='button'
            >
              <X className='h-3 w-3'/>
              Clear
            </button>
          ) : null}
        </div>

        <DropdownMenuSeparator/>

        <div className='px-3 py-2'>
          <DropdownMenuLabel className='px-0 py-1'>Tasks</DropdownMenuLabel>
          <div className='flex gap-1.5'>
            <FilterChip active={isIncomplete} label='Incomplete' onClick={setIncomplete}/>
            <FilterChip active={isCompleted} label='Completed' onClick={setCompleted}/>
          </div>
        </div>

        <div className='px-3 py-2'>
          <DropdownMenuLabel className='px-0 py-1'>Status</DropdownMenuLabel>
          <div className='flex flex-wrap gap-1.5'>
            {statusOptions.map((option) => (
              <FilterChip
                active={filters.status.includes(option.id)}
                key={option.id}
                label={option.label}
                onClick={() => toggleStatus(option.id)}
              />
            ))}
          </div>
        </div>

        <div className='px-3 py-2'>
          <DropdownMenuLabel className='px-0 py-1'>Priority</DropdownMenuLabel>
          <div className='flex flex-wrap gap-1.5'>
            {priorityOptions.map((option) => (
              <FilterChip
                active={filters.priority.includes(option.id)}
                key={option.id}
                label={option.label}
                onClick={() => togglePriority(option.id)}
              />
            ))}
            <FilterChip
              active={filters.priority.includes('__none')}
              label='No priority'
              onClick={() => togglePriority('__none')}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
