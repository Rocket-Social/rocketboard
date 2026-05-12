import {useEffect, useMemo, useState} from 'react'
import {ExternalLink, Loader2, Plus, RefreshCw, Save} from 'lucide-react'

import {Button} from '../../../components/ui/button'
import type {ProjectMember} from '../../access/access.types'
import type {
  JiraConnectionSource,
  JiraContributorStatsRow,
} from '../../jira/jira.types'
import type {GitHubPullRequest} from '../github.types'
import {
  ALL_STATS_CONTRIBUTORS,
  buildGitHubStatsSummary,
  buildGitHubStatsTeamRows,
  filterGitHubStatsPullRequests,
  getGitHubStatsContributors,
  getGitHubStatsTopPullRequests,
  type GitHubStatsSummary,
} from '../github.stats'

type StatsViewProps = {
  canManageJira?: boolean
  hasJiraConnection?: boolean
  isLoading: boolean
  isJiraLoading?: boolean
  isSavingJiraSettings?: boolean
  isSyncingJira?: boolean
  jiraProjectKey?: string
  jiraSources?: JiraConnectionSource[]
  jiraStatsRows?: JiraContributorStatsRow[]
  onAddJiraConnection?: () => void
  onSaveJiraSettings?: (input: {
    connectionSourceId: string
    jiraProjectKey: string
  }) => void
  onSyncJira?: () => void
  projectMembers: ProjectMember[]
  pullRequests: GitHubPullRequest[]
  selectedJiraSourceId?: string | null
  selectedSprintRange: StatsSprintRangeValue
  sprintRangeLabel: string
  sprintRangeOptions: StatsSprintRangeOption[]
  onSprintRangeChange: (value: StatsSprintRangeValue) => void
}

export type StatsSprintRangeValue = 'current' | 'last' | '3' | '6' | '9' | '12'

export type StatsSprintRangeOption = {
  label: string
  value: StatsSprintRangeValue
}

const SUMMARY_ROWS: {
  format: 'decimal' | 'integer'
  key: keyof GitHubStatsSummary
  label: string
}[] = [
  {format: 'integer', key: 'prsOpened', label: 'PRs opened'},
  {
    format: 'decimal',
    key: 'averageDurationHours',
    label: 'Avg PR duration (hours)',
  },
  {
    format: 'decimal',
    key: 'averageCommentsPerPr',
    label: 'Avg comments per PR',
  },
  {format: 'integer', key: 'totalAdditions', label: 'Total additions'},
  {format: 'integer', key: 'totalDeletions', label: 'Total deletions'},
  {format: 'integer', key: 'netLines', label: 'Net lines'},
  {format: 'integer', key: 'filesTouched', label: 'Files touched'},
]

export function StatsView({
  canManageJira = false,
  hasJiraConnection = false,
  isLoading,
  isJiraLoading = false,
  isSavingJiraSettings = false,
  isSyncingJira = false,
  jiraProjectKey = '',
  jiraSources = [],
  jiraStatsRows = [],
  onAddJiraConnection,
  onSaveJiraSettings,
  onSyncJira,
  projectMembers,
  pullRequests,
  selectedJiraSourceId = null,
  selectedSprintRange,
  sprintRangeLabel,
  sprintRangeOptions,
  onSprintRangeChange,
}: StatsViewProps) {
  const [selectedContributor, setSelectedContributor] = useState(
    ALL_STATS_CONTRIBUTORS,
  )
  const [jiraSourceInput, setJiraSourceInput] = useState(selectedJiraSourceId ?? '')
  const [jiraProjectKeyInput, setJiraProjectKeyInput] = useState(jiraProjectKey)
  const contributors = useMemo(
    () => getGitHubStatsContributors({projectMembers, pullRequests}),
    [projectMembers, pullRequests],
  )
  const contributorExists = contributors.some(
    (contributor) => contributor.value === selectedContributor,
  )
  const effectiveContributor =
    selectedContributor === ALL_STATS_CONTRIBUTORS || contributorExists
      ? selectedContributor
      : ALL_STATS_CONTRIBUTORS
  const selectedPullRequests = useMemo(
    () => filterGitHubStatsPullRequests(pullRequests, effectiveContributor),
    [effectiveContributor, pullRequests],
  )
  const summary = useMemo(
    () => buildGitHubStatsSummary(selectedPullRequests),
    [selectedPullRequests],
  )
  const topPullRequests = useMemo(
    () => getGitHubStatsTopPullRequests(selectedPullRequests),
    [selectedPullRequests],
  )
  const teamRows = useMemo(
    () => buildGitHubStatsTeamRows(contributors, jiraStatsRows),
    [contributors, jiraStatsRows],
  )
  const hasSavedJiraScope = Boolean(selectedJiraSourceId && jiraProjectKey.trim())
  const jiraStatusLabel = getJiraStatusLabel({
    hasJiraScope: hasSavedJiraScope,
    hasJiraConnection,
    isJiraLoading,
    jiraStatsRows,
  })
  const jiraDescription = getJiraDescription({
    canManageJira,
    hasJiraScope: hasSavedJiraScope,
    hasJiraConnection,
    isJiraLoading,
    jiraStatsRows,
  })
  const normalizedJiraProjectKey = jiraProjectKeyInput.trim().toUpperCase()
  const savedJiraProjectKey = jiraProjectKey.trim().toUpperCase()
  const canSaveJiraSettings =
    canManageJira &&
    Boolean(jiraSourceInput) &&
    /^[A-Z][A-Z0-9_]{1,31}$/.test(normalizedJiraProjectKey) &&
    (
      jiraSourceInput !== (selectedJiraSourceId ?? '') ||
      normalizedJiraProjectKey !== savedJiraProjectKey
    )
  const selectedLabel =
    effectiveContributor === ALL_STATS_CONTRIBUTORS
      ? 'All contributors'
      : (contributors.find((contributor) => contributor.value === effectiveContributor)
          ?.label ?? 'Selected contributor')

  useEffect(() => {
    if (selectedContributor !== effectiveContributor) {
      setSelectedContributor(effectiveContributor)
    }
  }, [effectiveContributor, selectedContributor])

  useEffect(() => {
    setJiraSourceInput(selectedJiraSourceId ?? '')
  }, [selectedJiraSourceId])

  useEffect(() => {
    setJiraProjectKeyInput(jiraProjectKey)
  }, [jiraProjectKey])

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-12 animate-pulse rounded-lg bg-canvas-accent" />
        <div className="h-56 animate-pulse rounded-lg bg-canvas-accent" />
        <div className="h-72 animate-pulse rounded-lg bg-canvas-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="text-sm font-medium text-text-medium"
          htmlFor="github-stats-sprint-range"
        >
          Timeframe
        </label>
        <select
          className="min-w-44 rounded-sm border border-border-subtle bg-surface-base px-2 py-1.5 text-sm text-text-strong focus:outline-none focus:ring-1 focus:ring-secondary-accent"
          id="github-stats-sprint-range"
          onChange={(event) => onSprintRangeChange(event.target.value as StatsSprintRangeValue)}
          value={selectedSprintRange}
        >
          {sprintRangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label
          className="text-sm font-medium text-text-medium"
          htmlFor="github-stats-contributor"
        >
          Contributor
        </label>
        <select
          className="min-w-56 rounded-sm border border-border-subtle bg-surface-base px-2 py-1.5 text-sm text-text-strong focus:outline-none focus:ring-1 focus:ring-secondary-accent"
          id="github-stats-contributor"
          onChange={(event) => setSelectedContributor(event.target.value)}
          value={effectiveContributor}
        >
          <option value={ALL_STATS_CONTRIBUTORS}>All</option>
          {contributors.map((contributor) => (
            <option key={contributor.value} value={contributor.value}>
              {contributor.label}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-lg border border-border-subtle bg-surface-base">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-strong">
              Team Stats
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              {jiraDescription}
            </p>
            <p className="mt-1 text-xs text-text-muted">{sprintRangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-sm bg-canvas-accent px-2 py-1 text-xs text-text-muted">
              {jiraStatusLabel}
            </span>
            {canManageJira && !hasJiraConnection ? (
              <Button
                disabled={isJiraLoading || !onAddJiraConnection}
                onClick={onAddJiraConnection}
                size="compact"
                type="button"
                variant="secondary"
              >
                <Plus className="h-3.5 w-3.5"/>
                Add Jira Connection
              </Button>
            ) : canManageJira ? (
              <Button
                disabled={isSyncingJira || !onSyncJira || !hasSavedJiraScope}
                onClick={onSyncJira}
                size="compact"
                title={hasSavedJiraScope ? undefined : 'Save a Jira project key before syncing.'}
                type="button"
                variant="secondary"
              >
                {isSyncingJira ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                ) : (
                  <RefreshCw className="h-3.5 w-3.5"/>
                )}
                Sync Jira
              </Button>
            ) : null}
          </div>
        </div>
        {hasJiraConnection ? (
          <div className="grid gap-3 border-b border-border-subtle px-4 py-3 md:grid-cols-[minmax(160px,1fr)_minmax(140px,220px)_auto] md:items-end">
            <label className="grid gap-1 text-xs font-medium text-text-muted">
              Jira site
              <select
                className="rounded-sm border border-border-subtle bg-surface-base px-2 py-1.5 text-sm font-normal text-text-strong focus:outline-none focus:ring-1 focus:ring-secondary-accent"
                disabled={!canManageJira || jiraSources.length === 0}
                onChange={(event) => setJiraSourceInput(event.target.value)}
                value={jiraSourceInput}
              >
                {jiraSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.siteName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-text-muted">
              Project key
              <input
                className="rounded-sm border border-border-subtle bg-surface-base px-2 py-1.5 font-mono text-sm font-normal uppercase text-text-strong focus:outline-none focus:ring-1 focus:ring-secondary-accent"
                disabled={!canManageJira}
                onChange={(event) => setJiraProjectKeyInput(event.target.value)}
                placeholder="PROJ"
                value={jiraProjectKeyInput}
              />
            </label>
            {canManageJira ? (
              <Button
                disabled={!canSaveJiraSettings || isSavingJiraSettings || !onSaveJiraSettings}
                onClick={() => {
                  if (!onSaveJiraSettings || !jiraSourceInput) return
                  onSaveJiraSettings({
                    connectionSourceId: jiraSourceInput,
                    jiraProjectKey: normalizedJiraProjectKey,
                  })
                }}
                size="compact"
                type="button"
                variant="secondary"
              >
                {isSavingJiraSettings ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                ) : (
                  <Save className="h-3.5 w-3.5"/>
                )}
                Save
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-text-muted">
                <th className="px-4 py-2 font-medium">Contributor</th>
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Reopened bugs</th>
                <th className="px-4 py-2 font-medium">Resolved bugs</th>
                <th className="px-4 py-2 font-medium">Logged hours</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.length > 0 ? (
                teamRows.map((row) => (
                  <tr
                    className="border-b border-border-subtle last:border-0"
                    key={row.contributorId}
                  >
                    <td className="px-4 py-2 text-text-strong">
                      {row.contributorName}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-text-muted">
                      {row.contributorId}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {formatOptionalNumber(row.reopenedBugs)}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {formatOptionalNumber(row.resolvedBugs)}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {formatOptionalDecimal(row.loggedHours)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-sm text-text-muted"
                    colSpan={5}
                  >
                    No contributors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-base">
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-strong">
            Contributor Stats
          </h2>
          <p className="mt-1 text-xs text-text-muted">{selectedLabel}</p>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,420px)_1fr]">
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-canvas-accent text-left text-text-muted">
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_ROWS.map((row) => (
                  <tr
                    className="border-b border-border-subtle last:border-0"
                    key={row.key}
                  >
                    <td className="px-3 py-2 text-text-medium">
                      {row.label}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-strong">
                      {formatSummaryValue(summary[row.key], row.format)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-lg border border-border-subtle">
            <div className="border-b border-border-subtle bg-canvas-accent px-3 py-2 text-sm font-medium text-text-muted">
              Top 5 PRs
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-text-muted">
                    <th className="px-3 py-2 font-medium">PR #</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Additions
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Deletions
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Churn
                    </th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">URL link</th>
                  </tr>
                </thead>
                <tbody>
                  {topPullRequests.length > 0 ? (
                    topPullRequests.map((pr) => (
                      <tr
                        className="border-b border-border-subtle last:border-0"
                        key={pr.htmlUrl}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-text-muted">
                          #{pr.number}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-text-medium">
                          {formatInteger(pr.additions)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-text-medium">
                          {formatInteger(pr.deletions)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-text-strong">
                          {formatInteger(pr.churn)}
                        </td>
                        <td className="max-w-md px-3 py-2 text-text-strong">
                          <span className="line-clamp-2">{pr.title}</span>
                        </td>
                        <td className="px-3 py-2">
                          <a
                            className="inline-flex items-center gap-1 text-text-medium hover:text-text-strong hover:underline"
                            href={pr.htmlUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Open
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-3 py-6 text-center text-sm text-text-muted"
                        colSpan={6}
                      >
                        No pull requests for this contributor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function formatSummaryValue(
  value: GitHubStatsSummary[keyof GitHubStatsSummary],
  format: 'decimal' | 'integer',
) {
  if (value === null) return 'Not tracked'
  return format === 'decimal' ? formatDecimal(value) : formatInteger(value)
}

function formatOptionalNumber(value: number | null) {
  return value === null ? 'Not tracked' : formatInteger(value)
}

function formatOptionalDecimal(value: number | null) {
  return value === null ? 'Not tracked' : formatDecimal(value)
}

function formatInteger(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)
}

function getJiraStatusLabel(input: {
  hasJiraScope: boolean
  hasJiraConnection: boolean
  isJiraLoading: boolean
  jiraStatsRows: JiraContributorStatsRow[]
}) {
  if (input.isJiraLoading) return 'Loading Jira'
  if (!input.hasJiraConnection) return 'Jira not connected'
  if (!input.hasJiraScope) return 'Jira project needed'
  if (input.jiraStatsRows.length === 0) return 'Jira connected'
  return 'Jira synced'
}

function getJiraDescription(input: {
  canManageJira: boolean
  hasJiraScope: boolean
  hasJiraConnection: boolean
  isJiraLoading: boolean
  jiraStatsRows: JiraContributorStatsRow[]
}) {
  if (input.isJiraLoading) {
    return 'Loading Jira bug and worklog metrics.'
  }

  if (!input.hasJiraConnection) {
    return 'Connect Jira to show reopened bugs, resolved bugs, and logged hours.'
  }

  if (!input.hasJiraScope) {
    return input.canManageJira
      ? 'Choose a Jira site and project key before syncing Jira metrics.'
      : 'A project admin needs to choose a Jira site and project key before metrics can sync.'
  }

  if (input.jiraStatsRows.length === 0) {
    return 'Jira is connected. Sync Jira to populate bug and worklog metrics.'
  }

  const latest = input.jiraStatsRows
    .map((row) => row.computedAt)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]

  return latest ? `Jira metrics last synced ${new Date(latest).toLocaleString()}.` : 'Jira metrics are available.'
}
