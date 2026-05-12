import {useNavigate, useSearch} from '@tanstack/react-router'
import {Inbox, ListIcon} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'

import {PillTabs, type PillTab} from '../../components/ui/pill-tabs'
import {useToast} from '../../components/ui/toast'
import {workspaceSummariesQueryOptions} from '../projects/project-shell.queries'
import {useQuery} from '@tanstack/react-query'
import {buildProjectBaseHref} from '../shell/route-helpers'
import {useSignedInAppFrame} from '../shell/SignedInAppFrame'
import {InboxBulkActions} from './components/InboxBulkActions'
import {InboxEmptyState} from './components/InboxEmptyState'
import {NotificationListItem} from './components/NotificationListItem'
import {
  groupNotifications,
  NotificationGroup,
} from './components/NotificationGroup'
import {
  useArchiveMutation,
  useInboxNotificationsQuery,
  useMarkAllReadMutation,
  useMarkReadMutation,
  useMarkUnreadMutation,
  useUnreadCountQuery,
} from './inbox.queries'
import {parseNotificationLink} from './parse-notification-link'
import type {InboxTabId, NotificationRow} from './inbox.types'

const TABS: PillTab[] = [
  {icon: Inbox, id: 'inbox', label: 'Inbox'},
  {icon: ListIcon, id: 'all', label: 'All'},
]

function parseTabFromSearch(value: unknown): InboxTabId {
  return value === 'all' ? 'all' : 'inbox'
}

export function InboxPage() {
  const search = useSearch({strict: false}) as {tab?: string}
  const rawNavigate = useNavigate()
  const {toast} = useToast()
  const {currentUser, workspaces} = useSignedInAppFrame()
  const workspaceSummariesQuery = useQuery(workspaceSummariesQueryOptions())

  const [activeTab, setActiveTab] = useState<InboxTabId>(() =>
    parseTabFromSearch(search.tab),
  )

  useEffect(() => {
    setActiveTab(parseTabFromSearch(search.tab))
  }, [search.tab])

  const handleTabChange = (next: InboxTabId) => {
    setActiveTab(next)
    void rawNavigate({
      replace: true,
      search: () => (next === 'inbox' ? {} : {tab: next}),
    } as never)
  }

  const notificationsQuery = useInboxNotificationsQuery(activeTab)
  const unreadCountQuery = useUnreadCountQuery(currentUser.id)

  const markReadMutation = useMarkReadMutation()
  const markUnreadMutation = useMarkUnreadMutation()
  const archiveMutation = useArchiveMutation()
  const markAllReadMutation = useMarkAllReadMutation()

  const allNotifications = useMemo<NotificationRow[]>(() => {
    return notificationsQuery.data?.pages.flatMap((page) => page.rows) ?? []
  }, [notificationsQuery.data])

  // Org-chip label resolution. If the user is in only one org, suppress
  // the chip entirely; otherwise resolve via workspace summaries since
  // notifications carry organization_id but not name.
  const organizationNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const ws of workspaces) {
      if (!map.has(ws.organizationId)) {
        map.set(ws.organizationId, ws.organizationName)
      }
    }
    return map
  }, [workspaces])

  const showOrgChip = organizationNames.size > 1

  const groups = useMemo(() => groupNotifications(allNotifications), [allNotifications])

  const handleClick = (notification: NotificationRow) => {
    const target = parseNotificationLink(notification.link)
    if (!target) return

    // Mark-read on click is the canonical behavior across inbox surfaces;
    // fire optimistically alongside navigation so the unread badge updates
    // even if the user backgrounds the destination tab.
    if (notification.readAt === null) {
      markReadMutation.mutate(notification)
    }

    if (target.type === 'internal-path') {
      void rawNavigate({to: target.path} as never)
      return
    }

    // type === 'card': resolve project_id → orgSlug/workspaceSlug/projectSlug.
    // notification.projectId may be set by the sender; if not, the user
    // sees a "(no longer available)" toast since v1 doesn't fetch the
    // card detail to find the project on click.
    if (!notification.projectId) {
      toast({
        description: 'The linked card may have been moved or deleted.',
        title: 'Card unavailable',
        variant: 'info',
      })
      return
    }

    const summaries = workspaceSummariesQuery.data ?? []
    for (const ws of summaries) {
      const project = ws.projects.find((p) => p.id === notification.projectId)
      if (project) {
        const href = `${buildProjectBaseHref(ws.organizationSlug, ws.slug, project.slug)}/board?card=${target.cardId}`
        void rawNavigate({href} as never)
        return
      }
    }

    toast({
      description: 'You may have lost access to the linked project.',
      title: 'Card unavailable',
      variant: 'info',
    })
  }

  const handleToggleRead = (notification: NotificationRow) => {
    if (notification.readAt === null) {
      markReadMutation.mutate(notification)
    } else {
      markUnreadMutation.mutate(notification)
    }
  }

  const handleArchive = (notification: NotificationRow) => {
    archiveMutation.mutate(notification)
  }

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate({tab: activeTab, userId: currentUser.id})
  }

  const isLoading = notificationsQuery.isPending && allNotifications.length === 0
  const isError = notificationsQuery.isError
  const isEmpty = !isLoading && !isError && allNotifications.length === 0

  return (
    <div className='w-full px-6 py-8'>
      <header className='mb-6'>
        <div className='flex items-center gap-3'>
          <Inbox className='h-6 w-6 text-primary'/>
          <h1 className='font-display text-2xl font-semibold text-text-strong'>Inbox</h1>
        </div>
        <p className='mt-1 text-sm text-text-muted'>Notifications and updates</p>
      </header>

      <div className='mb-6'>
        <PillTabs
          activeTab={activeTab}
          ariaLabel='Inbox sections'
          onTabChange={(id) => handleTabChange(id as InboxTabId)}
          tabs={TABS}
        />
      </div>

      <div className='rounded-2xl border border-border-subtle bg-surface-elevated'>
        <InboxBulkActions
          isPending={markAllReadMutation.isPending}
          onMarkAllRead={handleMarkAllRead}
          tab={activeTab}
          unreadCount={unreadCountQuery.data ?? 0}
        />

        {isLoading ? (
          <div className='space-y-2 p-4'>
            {[0, 1, 2].map((i) => (
              <div
                className='h-12 animate-pulse rounded-lg bg-canvas-accent'
                key={i}
              />
            ))}
          </div>
        ) : isError ? (
          <div className='flex flex-col items-center gap-3 px-6 py-12 text-center'>
            <p className='text-sm text-text-muted'>Could not load notifications.</p>
            <button
              className='inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover'
              onClick={() => notificationsQuery.refetch()}
              type='button'
            >
              Retry
            </button>
          </div>
        ) : isEmpty ? (
          <div className='p-4'>
            <InboxEmptyState tab={activeTab}/>
          </div>
        ) : (
          <div className='divide-y divide-border-subtle'>
            {groups.map((group) => (
              <div className='p-2' key={group.bucket}>
                <NotificationGroup bucket={group.bucket}>
                  {group.rows.map((notification) => (
                    <NotificationListItem
                      key={notification.id}
                      notification={notification}
                      onArchive={handleArchive}
                      onClick={handleClick}
                      onToggleRead={handleToggleRead}
                      organizationLabel={
                        showOrgChip
                          ? organizationNames.get(notification.organizationId) ?? null
                          : null
                      }
                    />
                  ))}
                </NotificationGroup>
              </div>
            ))}

            {notificationsQuery.hasNextPage ? (
              <div className='flex justify-center p-3'>
                <button
                  className='rounded-md px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong disabled:opacity-50'
                  disabled={notificationsQuery.isFetchingNextPage}
                  onClick={() => notificationsQuery.fetchNextPage()}
                  type='button'
                >
                  {notificationsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
