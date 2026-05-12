import type {ReactNode} from 'react'

import type {NotificationRow} from '../inbox.types'

export type NotificationGroupBucket = 'today' | 'this-week' | 'earlier'

const GROUP_LABEL: Record<NotificationGroupBucket, string> = {
  earlier: 'Earlier',
  'this-week': 'This week',
  today: 'Today',
}

export function classifyNotificationBucket(
  notification: NotificationRow,
  now: Date = new Date(),
): NotificationGroupBucket {
  const created = new Date(notification.createdAt)
  if (Number.isNaN(created.getTime())) return 'earlier'

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (created.getTime() >= startOfToday.getTime()) return 'today'

  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfToday.getDate() - 6)
  if (created.getTime() >= startOfWeek.getTime()) return 'this-week'

  return 'earlier'
}

export function groupNotifications(
  notifications: NotificationRow[],
  now: Date = new Date(),
): Array<{bucket: NotificationGroupBucket; rows: NotificationRow[]}> {
  const buckets: Record<NotificationGroupBucket, NotificationRow[]> = {
    earlier: [],
    'this-week': [],
    today: [],
  }
  for (const n of notifications) {
    buckets[classifyNotificationBucket(n, now)].push(n)
  }
  // Display order: today → this-week → earlier. Empty buckets are skipped.
  const order: NotificationGroupBucket[] = ['today', 'this-week', 'earlier']
  return order
    .map((bucket) => ({bucket, rows: buckets[bucket]}))
    .filter((group) => group.rows.length > 0)
}

type NotificationGroupProps = {
  bucket: NotificationGroupBucket
  children: ReactNode
}

export function NotificationGroup({bucket, children}: NotificationGroupProps) {
  return (
    <section className='space-y-1'>
      <h2 className='px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted'>
        {GROUP_LABEL[bucket]}
      </h2>
      <ul className='space-y-1'>{children}</ul>
    </section>
  )
}
