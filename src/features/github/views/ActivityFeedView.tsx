import {useQuery} from '@tanstack/react-query'
import {ExternalLink} from 'lucide-react'
import {useMemo} from 'react'

import {projectGitHubEventsQueryOptions} from '../github.queries'
import type {GitHubEvent} from '../github.types'

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
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full table-fixed text-sm">
              <colgroup>
                <col className="w-20" />
                <col className="w-44" />
                <col className="w-40" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-y border-border-subtle text-left text-xs text-text-muted">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Contributor</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {group.events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function EventRow({event}: {event: GitHubEvent}) {
  const action = formatEventAction(event)
  const exactTime = formatExactTime(new Date(event.githubCreatedAt))
  const relativeTime = formatRelativeTime(new Date(event.githubCreatedAt))

  return (
    <tr className="border-b border-border-subtle/50 align-top hover:bg-surface-elevated/50">
      <td className="py-2.5 pr-3 font-mono text-xs text-text-muted whitespace-nowrap" title={exactTime}>
        {relativeTime}
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex min-w-0 items-center gap-2">
          {event.actorAvatarUrl ? (
            <img
              alt=""
              className="h-5 w-5 shrink-0 rounded-full"
              src={event.actorAvatarUrl}
            />
          ) : null}
          <span className="truncate font-medium text-text-strong">
            {event.actorLogin ?? 'Unknown contributor'}
          </span>
        </div>
      </td>
      <td className="py-2.5 pr-3 text-text-medium">
        {action}
      </td>
      <td className="py-2.5 text-text-medium">
        <EventDetails event={event} />
      </td>
    </tr>
  )
}

function EventDetails({event}: {event: GitHubEvent}) {
  const repoName = getRepoName(event)
  const prNumber = getPullRequestNumber(event)
  const prTitle = getPullRequestTitle(event)
  const prHref = getPullRequestHref(event)

  if (event.eventType === 'push') {
    const commitCount = getCommitCount(event)
    const branch = stringPayload(event.payload.branch) ?? 'main'
    const repoHref = getRepositoryHref(event)
    return (
      <div className="min-w-0 truncate">
        <span>{commitCount} commit{commitCount !== 1 ? 's' : ''} to {branch}</span>
        {repoName ? (
          <>
            <span className="text-text-muted"> in </span>
            {repoHref ? (
              <a
                className="font-medium text-text-strong hover:underline"
                href={repoHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                {repoName}
                <ExternalLink className="ml-1 inline h-3 w-3 text-text-muted" />
              </a>
            ) : (
              <span>{repoName}</span>
            )}
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-w-0 truncate">
      {prNumber ? (
        prHref ? (
          <a
            className="font-medium text-text-strong hover:underline"
            href={prHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            PR #{prNumber}
            <ExternalLink className="ml-1 inline h-3 w-3 text-text-muted" />
          </a>
        ) : (
          <span className="font-medium text-text-strong">PR #{prNumber}</span>
        )
      ) : (
        <span className="font-medium text-text-strong">Pull request</span>
      )}
      {prTitle ? (
        <span className="text-text-muted"> · {prTitle}</span>
      ) : null}
      {repoName ? (
        <span className="text-text-muted"> · {repoName}</span>
      ) : null}
    </div>
  )
}

function formatEventAction(event: GitHubEvent): string {
  switch (event.eventType) {
    case 'pr_opened':
      return 'Opened PR'
    case 'pr_merged':
      return 'Merged PR'
    case 'pr_closed':
      return 'Closed PR'
    case 'pr_edited':
      return 'Updated PR'
    case 'pr_draft':
      return 'Marked Draft'
    case 'pr_ready':
      return 'Ready for Review'
    case 'review_submitted':
      return formatReviewAction(stringPayload(event.payload.review_state))
    case 'push': {
      const commitCount = getCommitCount(event)
      return commitCount === 1 ? 'Pushed Commit' : 'Pushed Commits'
    }
    default:
      return 'GitHub Activity'
  }
}

function formatReviewAction(state: string | null): string {
  switch (state?.toLowerCase()) {
    case 'approved':
      return 'Approved PR'
    case 'commented':
      return 'Commented PR'
    case 'changes_requested':
      return 'Requested Changes'
    case 'dismissed':
      return 'Dismissed Review'
    default:
      return 'Reviewed PR'
  }
}

function getPullRequestHref(event: GitHubEvent): string | null {
  const prNumber = getPullRequestNumber(event)
  const storedHref = getSafeGitHubPullRequestHref(event.pullRequestHtmlUrl, prNumber)
  if (storedHref) return storedHref

  const repoFullName = getSafeGitHubRepoFullName(event.repoFullName)
  if (!repoFullName || !prNumber) return null
  return `https://github.com/${repoFullName}/pull/${prNumber}`
}

function getRepositoryHref(event: GitHubEvent): string | null {
  const repoFullName = getSafeGitHubRepoFullName(event.repoFullName)
  return repoFullName ? `https://github.com/${repoFullName}` : null
}

function getPullRequestNumber(event: GitHubEvent): number | null {
  return getPositiveInteger(event.payload.pr_number) ?? getPositiveInteger(event.pullRequestNumber)
}

function getCommitCount(event: GitHubEvent): number {
  return getPositiveInteger(event.payload.commit_count) ?? 1
}

function getPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

const GITHUB_PATH_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/

function getSafeGitHubPullRequestHref(
  href: string | null,
  expectedPullRequestNumber: number | null,
): string | null {
  if (!href || !expectedPullRequestNumber) return null

  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null
  }

  const [owner, repo, resource, pullRequestNumber, extra] = url.pathname.split('/').filter(Boolean)
  if (
    extra ||
    !owner ||
    !repo ||
    resource !== 'pull' ||
    !GITHUB_PATH_SEGMENT_RE.test(owner) ||
    !GITHUB_PATH_SEGMENT_RE.test(repo)
  ) {
    return null
  }

  const parsedPullRequestNumber = getPositiveInteger(pullRequestNumber)
  if (parsedPullRequestNumber !== expectedPullRequestNumber) return null

  return `https://github.com/${owner}/${repo}/pull/${parsedPullRequestNumber}`
}

function getSafeGitHubRepoFullName(repoFullName: string | null): string | null {
  if (!repoFullName) return null
  const [owner, repo, extra] = repoFullName.split('/')
  if (
    extra ||
    !owner ||
    !repo ||
    !GITHUB_PATH_SEGMENT_RE.test(owner) ||
    !GITHUB_PATH_SEGMENT_RE.test(repo)
  ) {
    return null
  }
  return `${owner}/${repo}`
}

function getPullRequestTitle(event: GitHubEvent): string | null {
  return stringPayload(event.payload.pr_title) ?? event.pullRequestTitle
}

function getRepoName(event: GitHubEvent): string | null {
  return stringPayload(event.payload.repo_name) ?? event.repoFullName?.split('/').pop() ?? null
}

function stringPayload(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
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

function formatExactTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
