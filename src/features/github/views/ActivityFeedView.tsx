import {useQuery} from '@tanstack/react-query'
import {useMemo} from 'react'

import {projectGitHubEventsQueryOptions} from '../github.queries'
import type {GitHubEvent, GitHubEventType} from '../github.types'

type ActivityFeedViewProps = {
  eventType?: string | null
  projectId: string
  repoId?: string | null
}

export function ActivityFeedView({eventType, projectId, repoId}: ActivityFeedViewProps) {
  const eventsQuery = useQuery(projectGitHubEventsQueryOptions(projectId))
  const events = useMemo(() => {
    return (eventsQuery.data ?? []).filter((event) => {
      if (repoId && event.repoId !== repoId) return false
      if (eventType && event.eventType !== eventType) return false
      return true
    })
  }, [eventType, eventsQuery.data, repoId])

  const groupedEvents = useMemo(() => groupEventsByDay(events), [events])

  if (eventsQuery.isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({length: 5}).map((_, i) => (
          <div key={i} className="h-8 bg-canvas-accent rounded-sm animate-pulse" />
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-text-muted">
          No activity yet. Push a commit or open a PR to see activity here.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4">
      {groupedEvents.map((group) => (
        <div key={group.label} className="mb-6">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            {group.label}
          </h3>
          <div className="space-y-1">
            {group.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EventRow({event}: {event: GitHubEvent}) {
  const icon = EVENT_ICONS[event.eventType] ?? '•'
  const description = formatEventDescription(event)
  const relativeTime = formatRelativeTime(new Date(event.githubCreatedAt))

  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span className="flex-shrink-0 w-5 text-center">{icon}</span>
      <span className="flex-1 text-text-medium min-w-0">
        {event.actorLogin && (
          <span className="font-medium text-text-strong">{event.actorLogin}</span>
        )}{' '}
        {description}
      </span>
      <span className="flex-shrink-0 text-xs text-text-muted font-mono">
        {relativeTime}
      </span>
    </div>
  )
}

const EVENT_ICONS: Record<GitHubEventType, string> = {
  pr_opened: '🔀',
  pr_merged: '🚀',
  pr_closed: '⊘',
  pr_edited: '✏️',
  pr_draft: '📝',
  pr_ready: '🔀',
  review_submitted: '✅',
  push: '⬆️',
}

function formatEventDescription(event: GitHubEvent): string {
  const prTitle = (event.payload.pr_title as string) ?? ''
  const prNumber = (event.payload.pr_number as number) ?? ''
  const repoName = (event.payload.repo_name as string) ?? ''
  const prRef = prNumber ? `#${prNumber}` : ''

  switch (event.eventType) {
    case 'pr_opened':
      return `opened PR ${prRef} "${prTitle}" in ${repoName}`
    case 'pr_merged':
      return `merged PR ${prRef} "${prTitle}" in ${repoName}`
    case 'pr_closed':
      return `closed PR ${prRef} in ${repoName}`
    case 'pr_edited':
      return `updated PR ${prRef} in ${repoName}`
    case 'pr_draft':
      return `converted PR ${prRef} to draft in ${repoName}`
    case 'pr_ready':
      return `marked PR ${prRef} ready for review in ${repoName}`
    case 'review_submitted': {
      const reviewState = (event.payload.review_state as string) ?? 'reviewed'
      return `${reviewState} PR ${prRef} in ${repoName}`
    }
    case 'push': {
      const commitCount = (event.payload.commit_count as number) ?? 1
      const branch = (event.payload.branch as string) ?? 'main'
      return `pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${branch} in ${repoName}`
    }
    default:
      return `activity in ${repoName}`
  }
}

type EventGroup = {
  label: string
  events: GitHubEvent[]
}

function groupEventsByDay(events: GitHubEvent[]): EventGroup[] {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay())

  const groups: Record<string, GitHubEvent[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  }

  for (const event of events) {
    const eventDate = new Date(event.githubCreatedAt)
    if (eventDate >= today) {
      groups.Today.push(event)
    } else if (eventDate >= yesterday) {
      groups.Yesterday.push(event)
    } else if (eventDate >= thisWeekStart) {
      groups['This Week'].push(event)
    } else {
      groups.Older.push(event)
    }
  }

  return Object.entries(groups)
    .filter(([, events]) => events.length > 0)
    .map(([label, events]) => ({label, events}))
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
