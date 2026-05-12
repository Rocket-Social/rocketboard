import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import {
  INBOX_PAGE_SIZE,
  type InboxCursor,
  type InboxTabId,
  type ListNotificationsArgs,
  type ListNotificationsResult,
  type NotificationKind,
  type NotificationRow,
} from './inbox.types'

// PostgREST column list for the notifications surface — keep narrow, the
// inbox doesn't need every column. organization_id stays in for the multi-org
// chip render (D-13).
const NOTIFICATION_SELECT =
  'id, user_id, organization_id, project_id, card_id, kind, title, body, link, origin_user_id, origin_run_id, read_at, archived_at, created_at'

type NotificationDbRow = {
  id: string
  user_id: string
  organization_id: string
  project_id: string | null
  card_id: string | null
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  origin_user_id: string | null
  origin_run_id: string | null
  read_at: string | null
  archived_at: string | null
  created_at: string
}

function rowToNotification(row: NotificationDbRow): NotificationRow {
  return {
    archivedAt: row.archived_at,
    body: row.body,
    cardId: row.card_id,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    link: row.link,
    organizationId: row.organization_id,
    originRunId: row.origin_run_id,
    originUserId: row.origin_user_id,
    projectId: row.project_id,
    readAt: row.read_at,
    title: row.title,
    userId: row.user_id,
  }
}

function notificationsTable() {
  return getSupabaseBrowserClient().from('notifications')
}

export const inboxRepository = {
  async list({
    cursor,
    pageSize = INBOX_PAGE_SIZE,
    tab,
  }: ListNotificationsArgs): Promise<ListNotificationsResult> {
    // Cursor pagination on (created_at desc, id desc) gives a deterministic
    // tiebreaker when two notifications share a timestamp. PostgREST doesn't
    // expose row-tuple comparison directly, so we encode "strictly less than
    // this (created_at, id)" as:
    //   created_at < cursor.created_at
    //   OR (created_at = cursor.created_at AND id < cursor.id)
    // Supabase's .or() builder accepts this as a comma-separated string.
    let query = notificationsTable()
      .select(NOTIFICATION_SELECT)
      .is('archived_at', null)
      .order('created_at', {ascending: false})
      .order('id', {ascending: false})
      .limit(pageSize)

    if (tab === 'inbox') {
      query = query.is('read_at', null)
    }

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.lastCreatedAt},and(created_at.eq.${cursor.lastCreatedAt},id.lt.${cursor.lastId})`,
      )
    }

    const {data, error} = await query

    if (error) throw error

    const rows = ((data ?? []) as unknown as NotificationDbRow[]).map(rowToNotification)
    const nextCursor: InboxCursor | null =
      rows.length === pageSize
        ? {
            lastCreatedAt: rows[rows.length - 1].createdAt,
            lastId: rows[rows.length - 1].id,
          }
        : null

    return {nextCursor, rows}
  },

  async unreadCount(userId: string): Promise<number> {
    // RLS already scopes to the caller's user_id; the explicit eq is
    // belt-plus-suspenders so the head-only count is unambiguous if ever
    // run with elevated credentials.
    const {count, error} = await notificationsTable()
      .select('id', {count: 'exact', head: true})
      .eq('user_id', userId)
      .is('read_at', null)
      .is('archived_at', null)

    if (error) throw error
    return count ?? 0
  },

  async markRead(notificationId: string): Promise<void> {
    const {error} = await notificationsTable()
      .update({read_at: new Date().toISOString()})
      .eq('id', notificationId)

    if (error) throw error
  },

  async markUnread(notificationId: string): Promise<void> {
    const {error} = await notificationsTable()
      .update({read_at: null})
      .eq('id', notificationId)

    if (error) throw error
  },

  async archive(notificationId: string): Promise<void> {
    const {error} = await notificationsTable()
      .update({archived_at: new Date().toISOString()})
      .eq('id', notificationId)

    if (error) throw error
  },

  async markAllRead({tab, userId}: {tab: InboxTabId; userId: string}): Promise<void> {
    // Plan §1.2: bulk update with explicit (user_id, read_at IS NULL,
    // archived_at IS NULL) filter. The "All" tab includes already-read rows
    // so the bulk action is a no-op there — guard against accidental calls
    // by filtering the same way regardless of tab.
    if (tab !== 'inbox') return

    const {error} = await notificationsTable()
      .update({read_at: new Date().toISOString()})
      .eq('user_id', userId)
      .is('read_at', null)
      .is('archived_at', null)

    if (error) throw error
  },
}
