import type {InboxTabId} from './inbox.types'

// Kept in its own module so the eager-loaded sidebar badge + realtime
// hook can reference the keys without importing the heavier
// `inbox.queries.ts` (mutations + toast + lucide icons would follow).
export const inboxKeys = {
  all: ['inbox'] as const,
  notifications: (tab: InboxTabId) => ['inbox', 'notifications', tab] as const,
  unreadCount: ['inbox', 'unread-count'] as const,
}
