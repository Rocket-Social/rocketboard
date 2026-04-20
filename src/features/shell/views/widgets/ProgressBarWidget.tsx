import {useMemo} from 'react'

import {formatCardStatusLabel, isCardCompletedStatus} from '../../../cards/card-view-mappers'
import type {CardRecord, ProjectStatusOption} from '../../../cards/card.types'
import type {Mode} from '../../../../app/mode'
import {statusCategoryColor} from '../../theme'

type ProgressBarWidgetProps = {
  cards: CardRecord[]
  mode: Mode
  statusOptions: ProjectStatusOption[]
}

export function ProgressBarWidget({cards, mode, statusOptions}: ProgressBarWidgetProps) {
  const hasEffort = cards.some((c) => c.effort !== null && c.effort > 0)
  const cardValue = (c: CardRecord) => hasEffort ? (c.effort ?? 0) : 1

  const totalValue = cards.reduce((sum, c) => sum + cardValue(c), 0)
  const doneValue = cards.filter((c) => isCardCompletedStatus(c.statusOptionId, statusOptions)).reduce((sum, c) => sum + cardValue(c), 0)
  const pct = totalValue > 0 ? Math.round((doneValue / totalValue) * 100) : 0

  const segments = useMemo(() => {
    const counts = new Map<string, number>()
    for (const option of statusOptions) counts.set(option.id, 0)
    for (const card of cards) {
      if (card.statusOptionId) {
        counts.set(card.statusOptionId, (counts.get(card.statusOptionId) ?? 0) + cardValue(card))
      }
    }
    return statusOptions.map((option) => ({
      color: statusCategoryColor(mode, option.category),
      count: counts.get(option.id) ?? 0,
      id: option.id,
      label: formatCardStatusLabel(option.id, statusOptions),
    }))
  }, [cards, mode, statusOptions, cardValue, hasEffort]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className='flex flex-col items-center gap-4'>
      <span className='font-display text-3xl font-semibold text-text-strong'>
        {pct}%
      </span>

      <div className='flex h-4 w-full overflow-hidden rounded-full'>
        {segments.map((seg, i) =>
          seg.count > 0 ? (
            <div
              key={seg.id}
              style={{
                backgroundColor: seg.color,
                marginLeft: i > 0 ? '1px' : undefined,
                width: `${(seg.count / Math.max(totalValue, 1)) * 100}%`,
              }}
            />
          ) : null,
        )}
      </div>

      <div className='flex flex-wrap items-center justify-center gap-x-4 gap-y-1'>
        {segments.filter((s) => s.count > 0).map((seg) => (
          <span className='flex items-center gap-1.5 text-xs text-text-muted' key={seg.id}>
            <span className='inline-block h-2.5 w-2.5 rounded-full' style={{backgroundColor: seg.color}}/>
            {seg.label}: {hasEffort ? seg.count : Math.round(seg.count)}
          </span>
        ))}
      </div>
    </div>
  )
}
