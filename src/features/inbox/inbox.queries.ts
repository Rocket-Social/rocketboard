import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {getErrorMessage} from '../../platform/data/rpc-adapter'
import {useToast} from '../../components/ui/toast'
import {inboxKeys} from './inbox.keys'
import {inboxRepository} from './inbox.repository'
import type {
  InboxCursor,
  InboxTabId,
  ListNotificationsResult,
  NotificationRow,
} from './inbox.types'

export {inboxKeys} from './inbox.keys'
export {useUnreadCountQuery} from './inbox.unread'

const NOTIFICATIONS_STALE_MS = 30_000

export function useInboxNotificationsQuery(tab: InboxTabId) {
  return useInfiniteQuery<
    ListNotificationsResult,
    Error,
    {pageParams: Array<InboxCursor | null>; pages: ListNotificationsResult[]},
    ReturnType<typeof inboxKeys.notifications>,
    InboxCursor | null
  >({
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
    queryFn: ({pageParam}) =>
      inboxRepository.list({cursor: pageParam ?? null, tab}),
    queryKey: inboxKeys.notifications(tab),
    staleTime: NOTIFICATIONS_STALE_MS,
  })
}

function invalidateInboxCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({queryKey: inboxKeys.all})
}

// Optimistic mutations: flip the local cache so the row's read/archived
// state changes immediately, then invalidate on success/error so the
// canonical state is the next refetch's payload.

type OptimisticPatch = {
  archivedAt?: string | null
  readAt?: string | null
}

function patchNotificationInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  notificationId: string,
  patch: OptimisticPatch,
) {
  for (const tab of ['inbox', 'all'] as const) {
    queryClient.setQueryData<{
      pageParams: Array<InboxCursor | null>
      pages: ListNotificationsResult[]
    }>(inboxKeys.notifications(tab), (current) => {
      if (!current) return current
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          rows: page.rows.map((row) =>
            row.id === notificationId ? {...row, ...patch} : row,
          ),
        })),
      }
    })
  }
}

function removeNotificationFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  notificationId: string,
) {
  for (const tab of ['inbox', 'all'] as const) {
    queryClient.setQueryData<{
      pageParams: Array<InboxCursor | null>
      pages: ListNotificationsResult[]
    }>(inboxKeys.notifications(tab), (current) => {
      if (!current) return current
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          rows: page.rows.filter((row) => row.id !== notificationId),
        })),
      }
    })
  }
}

export function useMarkReadMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: (notification: NotificationRow) =>
      inboxRepository.markRead(notification.id),
    onMutate: async (notification) => {
      await queryClient.cancelQueries({queryKey: inboxKeys.all})
      const previousReadAt = notification.readAt
      patchNotificationInCache(queryClient, notification.id, {
        readAt: new Date().toISOString(),
      })
      return {previousReadAt, notificationId: notification.id}
    },
    onError: (error, _vars, context) => {
      if (context) {
        patchNotificationInCache(queryClient, context.notificationId, {
          readAt: context.previousReadAt,
        })
      }
      toast({
        description: getErrorMessage(error, 'Could not mark as read.'),
        title: 'Action failed',
        variant: 'error',
      })
    },
    onSettled: () => invalidateInboxCaches(queryClient),
  })
}

export function useMarkUnreadMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: (notification: NotificationRow) =>
      inboxRepository.markUnread(notification.id),
    onMutate: async (notification) => {
      await queryClient.cancelQueries({queryKey: inboxKeys.all})
      const previousReadAt = notification.readAt
      patchNotificationInCache(queryClient, notification.id, {readAt: null})
      return {previousReadAt, notificationId: notification.id}
    },
    onError: (error, _vars, context) => {
      if (context) {
        patchNotificationInCache(queryClient, context.notificationId, {
          readAt: context.previousReadAt,
        })
      }
      toast({
        description: getErrorMessage(error, 'Could not mark as unread.'),
        title: 'Action failed',
        variant: 'error',
      })
    },
    onSettled: () => invalidateInboxCaches(queryClient),
  })
}

export function useArchiveMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: (notification: NotificationRow) =>
      inboxRepository.archive(notification.id),
    onMutate: async (notification) => {
      await queryClient.cancelQueries({queryKey: inboxKeys.all})
      // The list filters archived_at IS NULL, so optimistically remove the row.
      removeNotificationFromCache(queryClient, notification.id)
      return {notification}
    },
    onError: (error, _vars, _context) => {
      // Rollback isn't worth the complexity — the next invalidate refetches
      // with the canonical state. Surface the failure honestly.
      toast({
        description: getErrorMessage(error, 'Could not archive.'),
        title: 'Action failed',
        variant: 'error',
      })
    },
    onSettled: () => invalidateInboxCaches(queryClient),
  })
}

export function useMarkAllReadMutation() {
  const queryClient = useQueryClient()
  const {toast} = useToast()

  return useMutation({
    mutationFn: (input: {tab: InboxTabId; userId: string}) =>
      inboxRepository.markAllRead(input),
    onError: (error) => {
      toast({
        description: getErrorMessage(error, 'Could not mark all as read.'),
        title: 'Action failed',
        variant: 'error',
      })
    },
    onSettled: () => invalidateInboxCaches(queryClient),
  })
}
