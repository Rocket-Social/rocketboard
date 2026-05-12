import {useMemo} from 'react'

import {normalizeCardDateString} from '../../../cards/card-date'
import {isCardCompletedStatus} from '../../../cards/card-view-mappers'
import type {CardRecord, ProjectStatusOption} from '../../../cards/card.types'
import {TrendChart, type TrendChartPoint, type TrendChartSeries} from './TrendChart'

type DateRange = {endDate: string; startDate: string}

type BurnUpWidgetProps = {
  cards: CardRecord[]
  dateRange?: DateRange | null
  statusOptions: ProjectStatusOption[]
}

function toLocalDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function BurnUpWidget({cards, dateRange, statusOptions}: BurnUpWidgetProps) {
  const hasEffort = cards.some((c) => c.effort !== null && c.effort > 0)
  const cardValue = (c: CardRecord) => hasEffort ? (c.effort ?? 0) : 1
  const totalScope = cards.reduce((sum, c) => sum + cardValue(c), 0)
  const doneValue = cards.filter((c) => isCardCompletedStatus(c.statusOptionId, statusOptions)).reduce((sum, c) => sum + cardValue(c), 0)
  const remainingValue = totalScope - doneValue

  const {points, todayIndex, series} = useMemo(() => {
    const today = new Date()
    const todayStr = toLocalDateString(today)
    const rangeStartDate = dateRange?.startDate
      ? new Date(dateRange.startDate + 'T00:00:00')
      : (() => { const d = new Date(today); d.setDate(d.getDate() - 6); return d })()
    const rangeEndDate = dateRange?.endDate
      ? new Date(dateRange.endDate + 'T23:59:59')
      : today

    const msPerDay = 24 * 60 * 60 * 1000
    const days = Math.max(2, Math.round((rangeEndDate.getTime() - rangeStartDate.getTime()) / msPerDay) + 1)

    let tIdx = -1
    const pts: TrendChartPoint[] = []
    const scopeData: (number | null)[] = []
    const doneData: (number | null)[] = []

    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStartDate)
      d.setDate(d.getDate() + i)
      const dayStr = toLocalDateString(d)
      const dateLabel = d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
      const isFuture = dayStr > todayStr

      if (dayStr === todayStr) tIdx = i
      pts.push({date: dateLabel, isFuture})

      if (isFuture) {
        scopeData.push(totalScope)
        doneData.push(null)
      } else {
        const scope = cards.reduce((sum, c) => {
          const createdDay = normalizeCardDateString(c.createdAt)
          if (!createdDay) return sum
          return createdDay <= dayStr ? sum + cardValue(c) : sum
        }, 0)
        const done = cards.reduce((sum, c) => {
          if (!c.completedAt) return sum
          const completedDay = normalizeCardDateString(c.completedAt)
          if (!completedDay) return sum
          return completedDay <= dayStr ? sum + cardValue(c) : sum
        }, 0)
        scopeData.push(scope)
        doneData.push(done)
      }
    }

    if (tIdx === -1) {
      for (let i = pts.length - 1; i >= 0; i--) {
        if (!pts[i].isFuture) { tIdx = i; break }
      }
    }

    const s: TrendChartSeries[] = [
      {color: 'var(--color-text-muted)', dashed: true, data: scopeData, label: 'Total scope'},
      {color: 'var(--color-primary)', data: doneData, fillOpacity: 0.15, label: 'Completed'},
    ]

    return {points: pts, series: s, todayIndex: tIdx}
  }, [cards, dateRange, totalScope, cardValue, hasEffort, statusOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className='mb-2 text-right text-sm text-text-muted'>
        {remainingValue} remaining
      </div>
      <TrendChart points={points} series={series} todayIndex={todayIndex}/>
      <div className='mt-3 flex items-center justify-center gap-6 text-xs text-text-muted'>
        <span className='flex items-center gap-1.5'>
          <span className='inline-block h-2.5 w-2.5 rounded-sm bg-primary'/>
          Completed
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='inline-block h-2.5 w-2.5 rounded-sm bg-text-muted opacity-40'/>
          Total scope
        </span>
      </div>
    </>
  )
}
