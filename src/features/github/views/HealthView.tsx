import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCcw, Settings2 } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { GitHubSparkline } from '../components/GitHubSparkline'
import type {
  GitHubHealthMetricKey,
  GitHubHealthSnapshot,
  GitHubRepository,
} from '../github.types'

type HealthViewProps = {
  canEditProject: boolean
  isLoading: boolean
  isSyncing: boolean
  onOpenBoardSettings: () => void
  onSyncNow: () => void
  organizationId: string
  repositories: GitHubRepository[]
  snapshot: GitHubHealthSnapshot
}

export function HealthView({
  canEditProject,
  isLoading,
  isSyncing,
  onOpenBoardSettings,
  onSyncNow,
  organizationId,
  repositories,
  snapshot,
}: HealthViewProps) {
  const [selectedMetricKey, setSelectedMetricKey] =
    useState<GitHubHealthMetricKey>('review_turnaround')

  const selectedMetric = useMemo(() => {
    return (
      snapshot.metrics.find((metric) => metric.key === selectedMetricKey) ??
      snapshot.metrics[0] ??
      null
    )
  }, [selectedMetricKey, snapshot.metrics])

  if (!snapshot.isReady) {
    const title = isLoading
      ? 'Loading GitHub health'
      : snapshot.readinessReason?.includes('Backfill')
        ? 'Finishing PR history backfill'
        : 'More history needed before health can score the board'

    return (
      <div className="p-4">
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-text-strong">
                {title}
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                {isLoading
                  ? 'Rocketboard is loading the PR history needed to compute health metrics for this board.'
                  : (snapshot.readinessReason ??
                    'Backfill is still in progress.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onSyncNow}
                size="compact"
                type="button"
                variant="secondary"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                {isSyncing ? 'Syncing…' : 'Sync now'}
              </Button>
              {canEditProject ? (
                <Button
                  onClick={onOpenBoardSettings}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  <Settings2 className="h-4 w-4" />
                  Board settings
                </Button>
              ) : null}
            </div>
          </div>

          <p className="mt-2 text-sm text-text-muted">
            Health needs every repo on this board to sync PR history and at
            least 14 days of data before the metrics become meaningful.
          </p>
          {snapshot.earliestHistoryAt ? (
            <p className="mt-2 text-xs text-text-muted">
              Earliest synced PR history:{' '}
              {formatDate(snapshot.earliestHistoryAt)}
            </p>
          ) : null}

          <div className="mt-5 rounded-2xl border border-border-subtle bg-canvas-accent p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Repo readiness
            </div>
            <div className="mt-3 space-y-3">
              {repositories.map((repository) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0"
                  key={repository.id}
                >
                  <div>
                    <div className="text-sm font-medium text-text-strong">
                      {repository.fullName}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      {repository.lastSyncedAt
                        ? `Last synced ${formatRelativeTime(repository.lastSyncedAt)}`
                        : 'Never synced yet'}
                    </div>
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      repository.historyBackfilledAt
                        ? 'bg-[#335c8f]/10 text-[#335c8f]'
                        : 'bg-[#a86c0f]/10 text-[#8a5b10]'
                    }`}
                  >
                    {repository.historyBackfilledAt
                      ? 'Backfill complete'
                      : 'Backfill in progress'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs text-text-muted">
            Contributor mapping also affects the final breakdown. Review GitHub
            identity mapping in{' '}
            <a
              className="font-medium underline underline-offset-2 hover:text-text-strong"
              href={`/org/${organizationId}/settings?tab=github`}
            >
              organization GitHub settings
            </a>
            .
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {snapshot.unmappedContributors.length > 0 ? (
        <div className="rounded-2xl border border-[#a86c0f]/30 bg-[#a86c0f]/5 p-4 text-sm text-[#8a5b10]">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Unmapped contributors are grouped together
          </div>
          <div className="mt-2">
            {snapshot.unmappedContributors
              .map((candidate) => `@${candidate.githubLogin}`)
              .join(', ')}{' '}
            are included in the shared “Unmapped contributors” bucket until they
            are mapped in{' '}
            <a
              className="font-medium underline underline-offset-2 hover:text-[#6b450b]"
              href={`/org/${organizationId}/settings?tab=github`}
            >
              organization GitHub settings
            </a>
            .
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {snapshot.metrics.map((metric) => (
          <button
            className={`rounded-2xl border p-4 text-left transition-colors ${
              selectedMetric?.key === metric.key
                ? 'border-[#335c8f]/40 bg-[#335c8f]/5'
                : 'border-border-subtle bg-surface-base hover:bg-canvas-accent'
            }`}
            key={metric.key}
            onClick={() => setSelectedMetricKey(metric.key)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-text-muted">
                  {metric.label}
                </div>
                {metric.isInsufficient ? (
                  <div className="mt-3 text-sm text-text-muted">
                    Insufficient data
                  </div>
                ) : (
                  <div className="mt-3 text-2xl font-semibold text-text-strong">
                    {formatMetricValue(metric.key, metric.currentValue)}
                  </div>
                )}
                <div className="mt-2 text-xs text-text-muted">
                  {metric.summary}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {formatDelta(metric.key, metric.delta)} · {metric.sampleCount}{' '}
                  sample{metric.sampleCount === 1 ? '' : 's'}
                </div>
              </div>

              <div className="w-28 shrink-0">
                <GitHubSparkline points={metric.series} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedMetric ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-4">
          <div className="text-sm font-medium text-text-strong">
            {selectedMetric.label} breakdown
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {selectedMetric.summary}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-text-muted">
                  <th className="pb-2 font-medium">Contributor</th>
                  <th className="pb-2 font-medium">Value</th>
                  <th className="pb-2 font-medium">Samples</th>
                </tr>
              </thead>
              <tbody>
                {selectedMetric.detailRows.length === 0 ? (
                  <tr>
                    <td className="py-3 text-text-muted" colSpan={3}>
                      No contributor breakdown yet.
                    </td>
                  </tr>
                ) : (
                  selectedMetric.detailRows.map((row) => (
                    <tr
                      className="border-b border-border-subtle last:border-b-0"
                      key={`${selectedMetric.key}:${row.label}:${row.githubLogin ?? 'unmapped'}`}
                    >
                      <td className="py-3 pr-4 text-text-strong">
                        {row.label}
                        {row.githubLogin ? (
                          <span className="ml-2 text-xs text-text-muted">
                            @{row.githubLogin}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-text-medium">
                        {formatMetricValue(selectedMetric.key, row.value)}
                      </td>
                      <td className="py-3 text-text-muted">
                        {row.sampleCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function formatMetricValue(
  metricKey: GitHubHealthMetricKey,
  value: number | null,
) {
  if (value === null) return '—'
  if (metricKey === 'throughput' || metricKey === 'stale_work') {
    return `${Math.round(value)}`
  }
  if (value >= 24) {
    return `${(value / 24).toFixed(1)}d`
  }
  return `${value.toFixed(1)}h`
}

function formatDelta(metricKey: GitHubHealthMetricKey, value: number | null) {
  if (value === null) return 'No prior baseline'
  if (value === 0) return 'Flat vs previous 6 weeks'

  if (metricKey === 'throughput') {
    return `${value > 0 ? '+' : ''}${Math.round(value)} vs previous 6 weeks`
  }

  if (metricKey === 'stale_work') {
    return `${value > 0 ? '+' : ''}${Math.round(value)} stale incidents vs previous 6 weeks`
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}h vs previous 6 weeks`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatRelativeTime(value: string) {
  const ageMs = Date.now() - new Date(value).getTime()
  const ageMinutes = Math.floor(ageMs / (1000 * 60))
  if (ageMinutes < 1) return 'just now'
  if (ageMinutes < 60) return `${ageMinutes}m ago`
  const ageHours = Math.floor(ageMinutes / 60)
  if (ageHours < 24) return `${ageHours}h ago`
  return `${Math.floor(ageHours / 24)}d ago`
}
