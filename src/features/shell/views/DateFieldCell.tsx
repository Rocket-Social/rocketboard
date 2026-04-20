import {CalendarDays, X} from 'lucide-react'
import {useRef, type MouseEvent} from 'react'

import {formatShortDate} from '../../cards/card-view-mappers'

type DateFieldCellProps = {
  fieldKey: 'due_date' | 'start_date'
  onChange: (value: string | null) => void
  value: string | null
}

export function DateFieldCell({fieldKey, onChange, value}: DateFieldCellProps) {
  const dateInputRef = useRef<HTMLInputElement>(null)
  const isDueDateField = fieldKey === 'due_date'

  const openDatePicker = () => {
    const input = dateInputRef.current

    if (!input) {
      return
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }

    input.click()
  }

  const stopPropagation = (event: MouseEvent<HTMLDivElement | HTMLButtonElement>) => {
    event.stopPropagation()
  }

  return (
    <div
      className='group/date-cell relative flex min-h-8 w-full cursor-pointer items-center justify-center self-stretch'
      onClick={(event) => {
        stopPropagation(event)
        openDatePicker()
      }}
    >
      {value
        ? <span className='inline-flex items-center text-sm leading-none text-text-strong'>{formatShortDate(value)}</span>
        : <CalendarDays className='h-4 w-4 text-text-muted'/>}
      {isDueDateField && value ? (
        <button
          aria-label='Clear due date'
          className='absolute inset-y-0 right-1 z-10 my-auto flex h-4 w-4 items-center justify-center rounded-sm border border-border-subtle bg-surface-base text-text-muted opacity-0 transition-all hover:bg-canvas-accent hover:text-text-strong focus-visible:opacity-100 group-hover/date-cell:opacity-100'
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onChange(null)
          }}
          type='button'
        >
          <X className='h-2.5 w-2.5'/>
        </button>
      ) : null}
      <input
        ref={dateInputRef}
        className='pointer-events-none absolute inset-0 h-full w-full opacity-0'
        onChange={(event) => onChange(event.target.value || null)}
        type='date'
        value={value ?? ''}
      />
    </div>
  )
}
