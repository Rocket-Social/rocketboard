import {useMemo} from 'react'

import {formatCardStatusLabel, isCardCompletedStatus} from '../../../cards/card-view-mappers'
import type {CardRecord, ProjectStatusOption} from '../../../cards/card.types'
import type {Mode} from '../../../../app/mode'
import {statusCategoryColor} from '../../theme'

type ProgressWidgetProps = {
  cards: CardRecord[]
  mode: Mode
  statusOptions: ProjectStatusOption[]
}

export function ProgressWidget({cards, mode, statusOptions}: ProgressWidgetProps) {
  const total = cards.length
  const doneCount = cards.filter((c) => isCardCompletedStatus(c.statusOptionId, statusOptions)).length

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const option of statusOptions) map.set(option.id, 0)
    for (const card of cards) {
      if (card.statusOptionId) {
        map.set(card.statusOptionId, (map.get(card.statusOptionId) ?? 0) + 1)
      }
    }
    return map
  }, [cards, statusOptions])

  const barSegments = statusOptions.map((option) => ({
    color: statusCategoryColor(mode, option.category),
    count: counts.get(option.id) ?? 0,
    key: option.id,
  }))

  return (
    <>
      <div className='mb-4 flex items-baseline justify-between'>
        <span className='text-sm text-text-muted'>{doneCount}/{total} closed</span>
      </div>

      <div className='mb-5 flex h-3 w-full overflow-hidden rounded-full'>
        {barSegments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.key}
              style={{
                backgroundColor: seg.color,
                width: `${(seg.count / Math.max(total, 1)) * 100}%`,
              }}
            />
          ) : null,
        )}
      </div>

      <div className='flex flex-col gap-3'>
        {statusOptions.map((option) => {
          const label = formatCardStatusLabel(option.id, statusOptions)
          const color = statusCategoryColor(mode, option.category)
          const count = counts.get(option.id) ?? 0
          return (
            <div className='flex items-center justify-between' key={option.id}>
              <div className='flex items-center gap-2.5'>
                <span className='inline-block h-3 w-3 rounded-full' style={{backgroundColor: color}}/>
                <span className='text-sm text-text-medium'>{label}</span>
              </div>
              <span className='text-sm text-text-muted'>{count} {count === 1 ? 'task' : 'tasks'}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
