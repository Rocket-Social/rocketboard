import {Calendar, ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '../../components/ui/popover'
import {getBrowserWeekStartsOn, getMonthGridOffset, getWeekdayLabels, startOfWeek} from '../../lib/week-preferences'
import {useSessionQuery} from '../auth/session.queries'

// Domain types owned by projects/project-view.types.ts, re-exported for backward compatibility
import {defaultOverviewDateRange, type OverviewDateRange, type OverviewDateRangePreset} from '../projects/project-view.types'
export {defaultOverviewDateRange, type OverviewDateRange, type OverviewDateRangePreset}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function computePresetRange(
  preset: OverviewDateRangePreset,
  weekStartsOn: ReturnType<typeof getBrowserWeekStartsOn>,
): {endDate: string | null; startDate: string | null} {
  if (preset === 'all_time') {
    return {endDate: null, startDate: null}
  }

  const today = new Date()
  const weekStart = startOfWeek(today, weekStartsOn)

  if (preset === 'this_week') {
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    return {endDate: toDateString(weekEnd), startDate: toDateString(weekStart)}
  }

  if (preset === 'last_week') {
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6)
    return {endDate: toDateString(lastWeekEnd), startDate: toDateString(lastWeekStart)}
  }

  // next_week
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const nextWeekEnd = new Date(nextWeekStart)
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 6)
  return {endDate: toDateString(nextWeekEnd), startDate: toDateString(nextWeekStart)}
}

function formatDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
}

function formatDateRangeLabel(range: OverviewDateRange) {
  if (range.preset === 'all_time') return 'All Time'
  if (!range.startDate || !range.endDate) return 'All Time'

  const presetLabels: Record<string, string> = {
    last_week: 'Last Week',
    next_week: 'Next Week',
    this_week: 'This Week',
  }
  const label = presetLabels[range.preset]
  if (label) return label
  return `${formatDateLabel(range.startDate)} – ${formatDateLabel(range.endDate)}`
}

// ─── Mini Calendar ──────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function MiniCalendar({
  month,
  onDateClick,
  selectedEnd,
  selectedStart,
  weekStartsOn,
  year,
}: {
  month: number
  onDateClick: (dateStr: string) => void
  selectedEnd: string | null
  selectedStart: string | null
  weekStartsOn: ReturnType<typeof getBrowserWeekStartsOn>
  year: number
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getMonthGridOffset(year, month, weekStartsOn)
  const dayHeaders = getWeekdayLabels(weekStartsOn)

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className='grid grid-cols-7 gap-0'>
        {dayHeaders.map((h) => (
          <div className='py-1 text-center text-[10px] font-medium text-text-muted' key={h}>{h}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`}/>
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isStart = dateStr === selectedStart
          const isEnd = dateStr === selectedEnd
          const isInRange = selectedStart && selectedEnd && dateStr >= selectedStart && dateStr <= selectedEnd
          const isSelected = isStart || isEnd

          return (
            <button
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                isSelected
                  ? 'bg-primary font-semibold text-white'
                  : isInRange
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-medium hover:bg-canvas-accent'
              }`}
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              type='button'
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Date Range Picker ──────────────────────────────────────

type OverviewDateRangePickerProps = {
  onChange: (range: OverviewDateRange) => void
  value: OverviewDateRange
}

export function OverviewDateRangePicker({onChange, value}: OverviewDateRangePickerProps) {
  const sessionQuery = useSessionQuery()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const weekStartsOn =
    sessionQuery.data?.status === 'authenticated'
      ? sessionQuery.data.user.weekStartsOn
      : getBrowserWeekStartsOn()

  const today = new Date()
  const [leftMonth, setLeftMonth] = useState(today.getMonth() === 0 ? 11 : today.getMonth() - 1)
  const [leftYear, setLeftYear] = useState(today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear())

  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const prevMonth = () => {
    if (leftMonth === 0) {
      setLeftMonth(11)
      setLeftYear(leftYear - 1)
    } else {
      setLeftMonth(leftMonth - 1)
    }
  }

  const nextMonth = () => {
    if (leftMonth === 11) {
      setLeftMonth(0)
      setLeftYear(leftYear + 1)
    } else {
      setLeftMonth(leftMonth + 1)
    }
  }

  const selectPreset = (preset: OverviewDateRangePreset) => {
    const {startDate, endDate} = computePresetRange(preset, weekStartsOn)
    setDraft({endDate, preset, startDate})
  }

  const [pickingField, setPickingField] = useState<'start' | 'end'>('start')

  const handleDateClick = (dateStr: string) => {
    if (pickingField === 'start') {
      setDraft((d) => ({
        endDate: d.endDate && dateStr > d.endDate ? dateStr : d.endDate,
        preset: 'custom',
        startDate: dateStr,
      }))
      setPickingField('end')
    } else {
      setDraft((d) => ({
        endDate: dateStr,
        preset: 'custom',
        startDate: d.startDate && dateStr < d.startDate ? dateStr : d.startDate,
      }))
      setPickingField('start')
    }
  }

  const handleApply = () => {
    onChange(draft)
    setOpen(false)
  }

  const handleCancel = () => {
    setDraft(value)
    setOpen(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(value)
      setPickingField('start')
    }
    setOpen(nextOpen)
  }

  const presets: {label: string; value: OverviewDateRangePreset}[] = [
    {label: 'This Week', value: 'this_week'},
    {label: 'Last Week', value: 'last_week'},
    {label: 'Next Week', value: 'next_week'},
    {label: 'All Time', value: 'all_time'},
  ]

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-strong shadow-sm transition-colors hover:bg-canvas-accent'
          type='button'
        >
          <Calendar className='h-3.5 w-3.5 text-text-muted'/>
          {formatDateRangeLabel(value)}
          <ChevronDown className='h-3.5 w-3.5 text-text-muted'/>
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <div className='flex'>
          {/* Left sidebar: presets */}
          <div className='flex w-36 flex-col gap-0.5 border-r border-border-subtle p-2'>
            {presets.map((p) => (
              <button
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  draft.preset === p.value
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-text-medium hover:bg-canvas-accent'
                }`}
                key={p.value}
                onClick={() => selectPreset(p.value)}
                type='button'
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Right area: calendar */}
          <div className='p-4'>
            {/* Date inputs */}
            <div className='mb-4 flex items-center gap-3'>
              <label className='flex-1'>
                <span className='mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted'>Start Date</span>
                <input
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-sm ${
                    pickingField === 'start' ? 'border-primary bg-primary/5' : 'border-border-subtle bg-surface-base'
                  }`}
                  onChange={(e) => setDraft((d) => ({...d, preset: 'custom', startDate: e.target.value || null}))}
                  onClick={() => setPickingField('start')}
                  type='date'
                  value={draft.startDate ?? ''}
                />
              </label>
              <label className='flex-1'>
                <span className='mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted'>End Date</span>
                <input
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-sm ${
                    pickingField === 'end' ? 'border-primary bg-primary/5' : 'border-border-subtle bg-surface-base'
                  }`}
                  onChange={(e) => setDraft((d) => ({...d, endDate: e.target.value || null, preset: 'custom'}))}
                  onClick={() => setPickingField('end')}
                  type='date'
                  value={draft.endDate ?? ''}
                />
              </label>
            </div>

            {/* Month navigation */}
            <div className='mb-3 flex items-center justify-between'>
              <button className='rounded-md p-1 hover:bg-canvas-accent' onClick={prevMonth} type='button'>
                <ChevronLeft className='h-4 w-4 text-text-muted'/>
              </button>
              <div className='flex gap-12 text-sm font-medium text-text-strong'>
                <span>{monthNames[leftMonth]} {leftYear}</span>
                <span>{monthNames[rightMonth]} {rightYear}</span>
              </div>
              <button className='rounded-md p-1 hover:bg-canvas-accent' onClick={nextMonth} type='button'>
                <ChevronRight className='h-4 w-4 text-text-muted'/>
              </button>
            </div>

            {/* Dual calendars */}
            <div className='flex gap-6'>
              <MiniCalendar
                month={leftMonth}
                onDateClick={handleDateClick}
                selectedEnd={draft.endDate}
                selectedStart={draft.startDate}
                weekStartsOn={weekStartsOn}
                year={leftYear}
              />
              <MiniCalendar
                month={rightMonth}
                onDateClick={handleDateClick}
                selectedEnd={draft.endDate}
                selectedStart={draft.startDate}
                weekStartsOn={weekStartsOn}
                year={rightYear}
              />
            </div>

            {/* Footer */}
            <div className='mt-4 flex justify-end gap-2'>
              <Button onClick={handleCancel} size='compact' variant='secondary'>Cancel</Button>
              <Button onClick={handleApply} size='compact' variant='primary'>Apply</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
