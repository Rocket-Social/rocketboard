import type {GitHubBoardSummary} from '../github.types'

type GitHubSummaryBarProps = {
  summary: GitHubBoardSummary
  lastSyncedAt: string | null
  isLoading: boolean
}

export function GitHubSummaryBar({summary, lastSyncedAt, isLoading}: GitHubSummaryBarProps) {
  const syncLabel = lastSyncedAt
    ? formatRelativeTime(new Date(lastSyncedAt))
    : null

  if (isLoading) {
    return (
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle text-sm text-text-muted">
        Syncing...
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle text-sm">
      <SummaryItem label="Open" value={summary.openCount} />
      <SummaryItem label="Need Review" value={summary.needsReviewCount} warn={summary.needsReviewCount > 0} />
      <SummaryItem label="Stale" value={summary.staleCount} warn={summary.staleCount > 0} />
      <SummaryItem label="Merged this week" value={summary.mergedThisWeek} />
      <SummaryItem label="Avg cycle" value={`${summary.avgReviewHours}h`} />
      {syncLabel && (
        <span className="ml-auto text-xs text-text-muted">
          Last synced: {syncLabel}
        </span>
      )}
    </div>
  )
}

function SummaryItem({label, value, warn}: {label: string; value: number | string; warn?: boolean}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono font-medium ${warn ? 'text-[#a86c0f]' : 'text-text-strong'}`}>
        {value}
      </span>
      <span className="text-text-muted">{label}</span>
    </div>
  )
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
