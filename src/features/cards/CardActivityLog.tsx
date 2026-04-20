import {Filter} from 'lucide-react'
import {useMemo, useState} from 'react'

import {useQuery} from '@tanstack/react-query'
import {rpcAdapter} from '../../platform/data/rpc-adapter'

type ActivityEvent = {
  id: string
  actor_id: string | null
  actor_name: string
  card_id: string
  created_at: string
  event_action: string
  event_type: string
  metadata: Record<string, unknown>
  title: string
}

type FilterType = 'all' | 'card' | 'assignment' | 'comment'

const FILTER_OPTIONS: Array<{label: string; value: FilterType}> = [
  {label: 'All', value: 'all'},
  {label: 'Card', value: 'card'},
  {label: 'Assignment', value: 'assignment'},
  {label: 'Updates', value: 'comment'},
]

const AVATAR_COLORS = ['#E8912D', '#5DA283', '#6C6EC9', '#D4527A', '#4ECDC4', '#4A90D9', '#9B59B6', '#E74C3C']

function getAvatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 1).toUpperCase()
}

function formatTimeAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function getDescription(event: ActivityEvent): string {
  const {metadata, event_action} = event

  if (event_action === 'created') {
    return (metadata.cardTitle as string) ?? ''
  }

  if (event_action === 'completed' || event_action === 'reopened' || event_action === 'deleted') {
    return ''
  }

  const oldVal = valueToText(metadata.oldValue)
  const newVal = valueToText(metadata.newValue)

  if (oldVal === '—' && newVal === '—') return ''
  if (oldVal === '—') return newVal
  return `${oldVal}  ›  ${newVal}`
}

// Merge "Task created" + immediate "Title changed" into single entry (legacy behavior)
const CREATE_TITLE_MERGE_WINDOW_MS = 10_000

function mergeCreatedTitleEvents(events: ActivityEvent[]) {
  const suppressed = new Set<string>()
  const mergedTitles = new Map<string, string>()

  const chrono = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  for (let i = 0; i < chrono.length; i++) {
    const ev = chrono[i]
    if (ev.event_action !== 'created') continue

    const createdAt = new Date(ev.created_at).getTime()
    for (let j = i + 1; j < chrono.length; j++) {
      const next = chrono[j]
      if (new Date(next.created_at).getTime() - createdAt > CREATE_TITLE_MERGE_WINDOW_MS) break

      const field = ((next.metadata.field as string) ?? '').toLowerCase()
      if (field === 'title' && next.card_id === ev.card_id && next.actor_id === ev.actor_id) {
        const newTitle = valueToText(next.metadata.newValue)
        if (newTitle !== '—') {
          mergedTitles.set(ev.id, newTitle)
          suppressed.add(next.id)
        }
        break
      }
    }
  }

  return {
    displayEvents: events.filter((e) => !suppressed.has(e.id)),
    mergedTitles,
  }
}

function useCardActivityQuery(cardId: string | null) {
  return useQuery({
    enabled: Boolean(cardId),
    queryFn: () => rpcAdapter.call<ActivityEvent[]>('get_card_activity', {target_card_id: cardId}),
    queryKey: ['card-activity', cardId],
    refetchOnWindowFocus: false,
  })
}

export function CardActivityLog({cardId}: {cardId: string | null}) {
  const [filter, setFilter] = useState<FilterType>('all')
  const activityQuery = useCardActivityQuery(cardId)
  const events = activityQuery.data ?? []

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events
    return events.filter((e) => e.event_type === filter)
  }, [events, filter])

  const {displayEvents, mergedTitles} = useMemo(
    () => mergeCreatedTitleEvents(filteredEvents),
    [filteredEvents],
  )

  if (!cardId) {
    return <div className='p-6 text-center text-sm text-text-muted'>Save the card first to see activity.</div>
  }

  return (
    <div className='flex flex-col gap-3 p-4'>
      {/* Filter */}
      <div className='flex items-center gap-2'>
        <div className='inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1.5'>
          <Filter className='h-3.5 w-3.5 text-text-muted'/>
          <select
            className='border-none bg-transparent text-sm text-text-strong outline-none'
            onChange={(e) => setFilter(e.target.value as FilterType)}
            value={filter}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Events list */}
      <div className='rounded-xl border border-border-subtle bg-surface-base'>
        {activityQuery.isPending ? (
          <div className='p-4 text-sm text-text-muted'>Loading activity...</div>
        ) : displayEvents.length === 0 ? (
          <div className='p-6 text-center text-sm text-text-muted'>No activity yet for this task.</div>
        ) : (
          <div className='divide-y divide-border-subtle'>
            {displayEvents.map((event) => {
              const description = event.event_action === 'created' && mergedTitles.has(event.id)
                ? mergedTitles.get(event.id)!
                : getDescription(event)
              const actorId = event.actor_id ?? event.actor_name

              return (
                <div className='flex items-center gap-3 px-3 py-2.5 text-[13px]' key={event.id}>
                  {/* Time ago */}
                  <span className='w-8 shrink-0 text-right text-xs tabular-nums text-text-muted'>
                    {formatTimeAgo(event.created_at)}
                  </span>

                  {/* Avatar */}
                  <div className='group relative shrink-0'>
                    <div
                      className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white'
                      style={{backgroundColor: getAvatarColor(actorId)}}
                    >
                      {getUserInitials(event.actor_name)}
                    </div>
                    <div className='pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100'>
                      {event.actor_name}
                    </div>
                  </div>

                  {/* Activity name */}
                  <span className='shrink-0 font-medium text-text-strong'>
                    {event.title}
                  </span>

                  {/* Description */}
                  {description ? (
                    <span className='min-w-0 truncate text-text-medium'>
                      {description}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
