// Wave 1 Phase 1a defined the original 6 kinds; Phase 6-B + Phase 7-B
// extended `notifications_kind_check` with budget + dispatch-quota kinds.
// Follow-card v1 added comment_on_followed_card (the assignee-only
// comment_on_owned_card stays valid for historical rows).
// The audit (§1.5) confirmed shape compatibility — every sender writes a
// human-readable title + a parseable link or an internal-path link.
export type NotificationKind =
  | 'assignment'
  | 'comment_on_followed_card'
  | 'comment_on_owned_card'
  | 'drift_nudge'
  | 'mention'
  | 'org_budget_capped'
  | 'org_budget_warning'
  | 'org_dispatch_quota_exceeded'
  | 'org_dispatch_quota_warning'
  | 'run_awaiting_approval'
  | 'run_completed'

export type NotificationRow = {
  id: string
  userId: string
  organizationId: string
  projectId: string | null
  cardId: string | null
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  originUserId: string | null
  originRunId: string | null
  readAt: string | null
  archivedAt: string | null
  createdAt: string
}

export type InboxTabId = 'inbox' | 'all'

export type InboxCursor = {
  lastCreatedAt: string
  lastId: string
}

export type ListNotificationsArgs = {
  cursor: InboxCursor | null
  tab: InboxTabId
  pageSize?: number
}

export type ListNotificationsResult = {
  rows: NotificationRow[]
  nextCursor: InboxCursor | null
}

export const INBOX_PAGE_SIZE = 50

// Kinds that are always per-user / never org-billing related — used by the
// future "Mentions" tab spec (deferred §6 follow-up). Keep here so the
// audit's grouping is encoded in code even when unused.
export const PER_USER_NOTIFICATION_KINDS: ReadonlySet<NotificationKind> = new Set([
  'assignment',
  'comment_on_followed_card',
  'comment_on_owned_card',
  'drift_nudge',
  'mention',
  'run_awaiting_approval',
  'run_completed',
])

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}
