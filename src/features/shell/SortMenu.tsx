import {ArrowDownAZ, ArrowUpAZ, ArrowUpDown, ChevronDown, ChevronUp, Plus, X} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import type {ProjectTableSort} from '../projects/project-view.types'

type SortMenuProps = {
  onSortChange: (sort: ProjectTableSort) => void
  sort: ProjectTableSort
  sortFieldOptions: {label: string; value: string}[]
}

export function SortMenu({onSortChange, sort, sortFieldOptions}: SortMenuProps) {
  const [showFieldList, setShowFieldList] = useState(false)
  const isActive = sort.length > 0
  const sortedFieldKeys = new Set(sort.map((s) => s.fieldKey))
  const unsortedOptions = sortFieldOptions.filter((o) => !sortedFieldKeys.has(o.value))

  const getLabel = (fieldKey: string) =>
    sortFieldOptions.find((o) => o.value === fieldKey)?.label ?? fieldKey

  const toggleDirection = (index: number) => {
    const next = [...sort]
    next[index] = {
      ...next[index],
      direction: next[index].direction === 'asc' ? 'desc' : 'asc',
    }
    onSortChange(next)
  }

  const removeSort = (index: number) => {
    onSortChange(sort.filter((_, i) => i !== index))
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    const next = [...sort]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onSortChange(next)
  }

  const moveDown = (index: number) => {
    if (index >= sort.length - 1) return
    const next = [...sort]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onSortChange(next)
  }

  const addSort = (fieldKey: string) => {
    onSortChange([...sort, {direction: 'asc', fieldKey}])
    setShowFieldList(false)
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setShowFieldList(false) }}>
      <DropdownMenuTrigger asChild>
        <Button variant={isActive ? 'primary' : 'secondary'}>
          <ArrowUpDown className='h-4 w-4'/>
          Sort
          {sort.length > 0 ? (
            <span className='text-sm opacity-70'>/ {sort.length}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-72'>
        <DropdownMenuLabel>Sort</DropdownMenuLabel>

        {/* Active sorts */}
        {sort.map((entry, index) => (
          <div className='flex items-center gap-1.5 px-3 py-2' key={entry.fieldKey}>
            {/* Reorder arrows */}
            <div className='flex flex-col'>
              <button
                className='rounded p-0.5 text-text-muted transition-colors hover:text-text-strong disabled:opacity-30'
                disabled={index === 0}
                onClick={() => moveUp(index)}
                type='button'
              >
                <ChevronUp className='h-3 w-3'/>
              </button>
              <button
                className='rounded p-0.5 text-text-muted transition-colors hover:text-text-strong disabled:opacity-30'
                disabled={index === sort.length - 1}
                onClick={() => moveDown(index)}
                type='button'
              >
                <ChevronDown className='h-3 w-3'/>
              </button>
            </div>
            <span className='flex-1 text-sm text-text-strong'>{getLabel(entry.fieldKey)}</span>
            <button
              className='flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs text-text-medium hover:bg-canvas-accent'
              onClick={() => toggleDirection(index)}
              type='button'
            >
              {entry.direction === 'asc' ? (
                <><ArrowUpAZ className='h-3.5 w-3.5'/> A→Z</>
              ) : (
                <><ArrowDownAZ className='h-3.5 w-3.5'/> Z→A</>
              )}
            </button>
            <button
              className='flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-canvas-accent hover:text-text-strong'
              onClick={() => removeSort(index)}
              type='button'
            >
              <X className='h-3.5 w-3.5'/>
            </button>
          </div>
        ))}

        {sort.length > 0 && unsortedOptions.length > 0 ? <DropdownMenuSeparator/> : null}

        {/* Add sort */}
        {showFieldList ? (
          <>
            <DropdownMenuLabel>Select field</DropdownMenuLabel>
            {unsortedOptions.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => addSort(option.value)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </>
        ) : unsortedOptions.length > 0 ? (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowFieldList(true) }}>
            <Plus className='h-4 w-4'/>
            Add sort
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
