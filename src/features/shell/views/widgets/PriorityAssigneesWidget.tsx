import {useMemo, useState} from 'react'

import {formatCardPriorityLabel, formatCardStatusLabel, getStatusOptionCategory, isCardCompletedStatus} from '../../../cards/card-view-mappers'
import type {CardRecord, ProjectPriorityOption, ProjectStatusOption} from '../../../cards/card.types'
import type {Mode} from '../../../../app/mode'
import {resolvePriorityOptionStyles, statusCategoryStyles} from '../../theme'

type PriorityAssigneesWidgetProps = {
  cards: CardRecord[]
  mode: Mode
  onClickAssignee?: (userId: string) => void
  onClickTask?: (taskId: string) => void
  priorityOptions?: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
}

type Tab = 'priority' | 'assignees'

export function PriorityAssigneesWidget({
  cards,
  mode,
  onClickAssignee,
  onClickTask,
  priorityOptions,
  statusOptions,
}: PriorityAssigneesWidgetProps) {
  const [tab, setTab] = useState<Tab>('priority')

  return (
    <div className='flex h-full flex-col'>
      <div className='-mx-5 -mt-5 flex border-b border-border-subtle'>
        <button
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'priority'
              ? 'border-b-2 border-primary text-text-strong'
              : 'text-text-muted hover:text-text-medium'
          }`}
          onClick={() => setTab('priority')}
          type='button'
        >
          Priority items
        </button>
        <button
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === 'assignees'
              ? 'border-b-2 border-primary text-text-strong'
              : 'text-text-muted hover:text-text-medium'
          }`}
          onClick={() => setTab('assignees')}
          type='button'
        >
          Assignees
        </button>
      </div>

      <div className='mt-4 flex-1 overflow-y-auto'>
        {tab === 'priority' ? (
          <PriorityTab
            cards={cards}
            mode={mode}
            onClickTask={onClickTask}
            priorityOptions={priorityOptions}
            statusOptions={statusOptions}
          />
        ) : (
          <AssigneesTab
            cards={cards}
            onClickAssignee={onClickAssignee}
            statusOptions={statusOptions}
          />
        )}
      </div>
    </div>
  )
}

function PriorityTab({
  cards,
  mode,
  onClickTask,
  priorityOptions,
  statusOptions,
}: {
  cards: CardRecord[]
  mode: Mode
  onClickTask?: (taskId: string) => void
  priorityOptions?: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
}) {
  const topPriorityIds = new Set(
    [...(priorityOptions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 2).map((o) => o.id),
  )
  const priorityCards = cards.filter(
    (c) => c.priorityOptionId && topPriorityIds.has(c.priorityOptionId),
  )

  if (priorityCards.length === 0) {
    return (
      <div className='flex h-full items-center justify-center text-sm text-text-muted'>
        No high priority items
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-1'>
      {priorityCards.map((card) => {
        const statusLabel = formatCardStatusLabel(card.statusOptionId, statusOptions)
        const sStyles = statusCategoryStyles(mode, getStatusOptionCategory(card.statusOptionId, statusOptions))
        const priorityLabel = formatCardPriorityLabel(card.priorityOptionId, priorityOptions ?? [])
        const priorityOption = (priorityOptions ?? []).find((o) => o.id === card.priorityOptionId) ?? null
        const pStyles = resolvePriorityOptionStyles(mode, priorityOption)
        return (
          <div
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${onClickTask ? 'cursor-pointer hover:bg-canvas-accent' : ''}`}
            key={card.id}
            onClick={onClickTask ? () => onClickTask(card.id) : undefined}
          >
            <span className='min-w-0 flex-1 truncate text-sm text-text-strong' title={card.title}>
              {card.title}
            </span>
            <span
              className='shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium'
              style={sStyles}
            >
              {statusLabel}
            </span>
            <span
              className='shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium'
              style={pStyles ?? undefined}
            >
              {priorityLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AssigneesTab({
  cards,
  onClickAssignee,
  statusOptions,
}: {
  cards: CardRecord[]
  onClickAssignee?: (userId: string) => void
  statusOptions: ProjectStatusOption[]
}) {
  const assigneeMap = useMemo(() => {
    const map = new Map<string, {name: string; total: number; done: number}>()
    for (const card of cards) {
      const key = card.assigneeUserId ?? '__none'
      const name = card.assigneeName || 'No assignee'
      const existing = map.get(key) ?? {name, total: 0, done: 0}
      existing.total++
      if (isCardCompletedStatus(card.statusOptionId, statusOptions)) existing.done++
      map.set(key, existing)
    }
    return map
  }, [cards, statusOptions])

  const assignees = [...assigneeMap.entries()].sort((a, b) => {
    if (a[0] === '__none') return 1
    if (b[0] === '__none') return -1
    return b[1].total - a[1].total
  })

  if (assignees.length === 0) {
    return (
      <div className='flex h-full items-center justify-center text-sm text-text-muted'>
        No tasks
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      {assignees.map(([key, data]) => {
        const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
        const initial = data.name.charAt(0).toUpperCase()
        const isClickable = onClickAssignee && key !== '__none'
        return (
          <div
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${isClickable ? 'cursor-pointer hover:bg-canvas-accent' : ''}`}
            key={key}
            onClick={isClickable ? () => onClickAssignee(key) : undefined}
          >
            <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary'>
              {key === '__none' ? '?' : initial}
            </div>
            <span className='min-w-0 flex-1 truncate text-sm text-text-strong'>{data.name}</span>
            <span className='shrink-0 text-sm text-text-muted'>
              {pct}% of {data.total}
            </span>
          </div>
        )
      })}
    </div>
  )
}
