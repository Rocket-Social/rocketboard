import {CheckCheck} from 'lucide-react'

import type {InboxTabId} from '../inbox.types'

type InboxBulkActionsProps = {
  isPending: boolean
  onMarkAllRead: () => void
  tab: InboxTabId
  unreadCount: number
}

export function InboxBulkActions({
  isPending,
  onMarkAllRead,
  tab,
  unreadCount,
}: InboxBulkActionsProps) {
  // D-8: bulk action is "Mark all read" only. No "Archive read."
  // The button is rendered only on the Inbox tab and only when there's
  // something to mark — the All tab would be a confusing no-op since
  // it includes already-read rows.
  if (tab !== 'inbox' || unreadCount === 0) return null

  return (
    <div className='flex items-center justify-between border-b border-border-subtle px-3 py-2'>
      <span className='text-xs text-text-muted'>
        {unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`}
      </span>
      <button
        className='inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong disabled:pointer-events-none disabled:opacity-50'
        disabled={isPending}
        onClick={onMarkAllRead}
        type='button'
      >
        <CheckCheck className='h-3.5 w-3.5'/>
        Mark all read
      </button>
    </div>
  )
}
