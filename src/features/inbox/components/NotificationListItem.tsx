import {Archive, Check, Circle} from 'lucide-react'
import {memo} from 'react'

import {cn} from '../../../lib/cn'
import {getNotificationIcon} from '../inbox.icons'
import type {NotificationRow} from '../inbox.types'
import {parseNotificationLink} from '../parse-notification-link'

type NotificationListItemProps = {
  notification: NotificationRow
  organizationLabel: string | null
  onArchive: (notification: NotificationRow) => void
  onClick: (notification: NotificationRow) => void
  onToggleRead: (notification: NotificationRow) => void
}

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = now - then
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

export const NotificationListItem = memo(function NotificationListItem({
  notification,
  organizationLabel,
  onArchive,
  onClick,
  onToggleRead,
}: NotificationListItemProps) {
  const Icon = getNotificationIcon(notification.kind)
  const isUnread = notification.readAt === null
  const linkTarget = parseNotificationLink(notification.link)
  const clickable = linkTarget !== null

  return (
    <li
      className={cn(
        'group relative flex items-start gap-3 rounded-lg px-3 py-3 transition-colors',
        isUnread
          ? 'bg-canvas-elevated hover:bg-canvas-accent'
          : 'hover:bg-canvas-accent',
      )}
      data-testid='inbox-notification-row'
      data-unread={isUnread ? 'true' : 'false'}
    >
      {/* Unread dot — fixed-width column so titles align across read/unread */}
      <div className='flex h-5 w-2 shrink-0 items-center justify-center pt-1'>
        {isUnread ? (
          <span
            aria-label='Unread'
            className='h-2 w-2 rounded-full bg-primary'
          />
        ) : null}
      </div>

      <Icon
        aria-hidden='true'
        className='mt-0.5 h-4 w-4 shrink-0 text-text-muted'
      />

      <button
        className={cn(
          'flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left',
          clickable
            ? 'cursor-pointer'
            : 'cursor-default',
        )}
        disabled={!clickable}
        onClick={() => onClick(notification)}
        type='button'
      >
        <div className='flex w-full items-center gap-2'>
          <span
            className={cn(
              'truncate text-sm',
              isUnread ? 'font-semibold text-text-strong' : 'font-medium text-text-strong',
            )}
          >
            {notification.title}
          </span>
          {organizationLabel ? (
            <span
              className='shrink-0 rounded-full bg-canvas-accent px-2 py-0.5 text-[11px] font-medium text-text-muted'
              title={organizationLabel}
            >
              {organizationLabel}
            </span>
          ) : null}
          <span className='ml-auto shrink-0 text-xs text-text-muted'>
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        {notification.body ? (
          <span className='line-clamp-2 text-xs text-text-muted'>
            {notification.body}
          </span>
        ) : null}
        {!clickable ? (
          <span className='text-[11px] italic text-text-muted'>
            (no longer available)
          </span>
        ) : null}
      </button>

      {/* Per-row action icons (D-7 inline, no dropdown). Hidden until row hover
          on desktop, always visible on mobile so the touch target is reachable. */}
      <div className='flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100'>
        <button
          aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
          className='flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-strong'
          onClick={(event) => {
            event.stopPropagation()
            onToggleRead(notification)
          }}
          type='button'
        >
          {isUnread ? <Check className='h-3.5 w-3.5'/> : <Circle className='h-3.5 w-3.5'/>}
        </button>
        <button
          aria-label='Archive'
          className='flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-strong'
          onClick={(event) => {
            event.stopPropagation()
            onArchive(notification)
          }}
          type='button'
        >
          <Archive className='h-3.5 w-3.5'/>
        </button>
      </div>
    </li>
  )
})
