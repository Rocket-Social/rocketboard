import {useState} from 'react'
import {AlertTriangle, ChevronDown, ChevronRight, ExternalLink} from 'lucide-react'

import type {
  GitHubCommitDataPoint,
  GitHubHistoricalTeamSnapshot,
  GitHubSprintActivityBadge,
  GitHubSprintPR,
  GitHubSprintSummary,
  GitHubSprintWindow,
} from '../github.types'

type TeamViewProps = {
  isLoading: boolean
  organizationId: string
  snapshot: GitHubHistoricalTeamSnapshot | null
  sprintCount: number
  onSprintCountChange: (count: number) => void
}

const SPRINT_PRESETS = [3, 6, 9, 12]
const DEFAULT_PR_DISPLAY_LIMIT = 10

export function TeamView({
  isLoading,
  organizationId,
  snapshot,
  sprintCount,
  onSprintCountChange,
}: TeamViewProps) {
  const [expandedSprints, setExpandedSprints] = useState<Set<number>>(() => new Set([0, 1]))
  const [expandedPRTables, setExpandedPRTables] = useState<Set<number>>(new Set())

  function toggleSprint(index: number) {
    setExpandedSprints((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function togglePRTable(index: number) {
    setExpandedPRTables((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-[180px] animate-pulse rounded-lg bg-canvas-accent" />
        <div className="h-48 animate-pulse rounded-lg bg-canvas-accent" />
        <div className="h-48 animate-pulse rounded-lg bg-canvas-accent" />
      </div>
    )
  }

  if (!snapshot || snapshot.sprints.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-border-subtle bg-surface-base p-6">
          <h3 className="text-lg font-semibold text-text-strong">No sprint data available</h3>
          <p className="mt-2 text-sm text-text-muted">
            No sprint data available for this window. Try expanding the range or check that your repos are connected.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Unmapped contributors warning */}
      {snapshot.unmappedContributors.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-[#a86c0f]/30 bg-[#a86c0f]/5 p-4 text-sm text-[#8a5b10]">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Unmapped GitHub contributors
          </div>
          <div className="mt-2">
            {snapshot.unmappedContributors.map((c) => `@${c.githubLogin}`).join(', ')} are active in these sprints. Map them in{' '}
            <a
              className="font-medium underline underline-offset-2 hover:text-[#6b450b]"
              href={`/org/${organizationId}/settings?tab=github`}
            >
              organization GitHub settings
            </a>{' '}
            to attribute their work.
          </div>
        </div>
      ) : null}

      {/* Sprint range selector + commit chart */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-text-muted">Last {sprintCount} sprints</div>
          <div className="flex items-center gap-0.5 rounded-sm bg-canvas-accent p-0.5">
            {SPRINT_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`rounded-sm px-3 py-1 text-sm transition-colors ${
                  sprintCount === preset
                    ? 'bg-surface-elevated text-text-strong shadow-sm'
                    : 'text-text-muted hover:text-text-medium'
                }`}
                onClick={() => onSprintCountChange(preset)}
                type="button"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <CommitChart
          dataPoints={snapshot.commitSeries}
          sprintWindows={snapshot.sprintWindows}
        />
      </div>

      {/* Sprint sections */}
      <div>
        {snapshot.sprints.map((sprint, index) => {
          const isExpanded = expandedSprints.has(index)
          const showAllPRs = expandedPRTables.has(index)

          return (
            <SprintSection
              key={sprint.window.startDate}
              sprint={sprint}
              index={index}
              isExpanded={isExpanded}
              showAllPRs={showAllPRs}
              organizationId={organizationId}
              onToggle={() => toggleSprint(index)}
              onTogglePRs={() => togglePRTable(index)}
            />
          )
        })}
      </div>
    </div>
  )
}

// -- Commit Chart (SVG-based, no library dependency) --

function CommitChart({dataPoints, sprintWindows}: {dataPoints: GitHubCommitDataPoint[]; sprintWindows: GitHubSprintWindow[]}) {
  if (dataPoints.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-lg bg-canvas-accent text-sm text-text-muted">
        No commit history yet. Rocketboard is syncing your repos.
      </div>
    )
  }

  const width = 800
  const height = 160
  const padX = 40
  const padY = 20
  const chartW = width - padX * 2
  const chartH = height - padY * 2

  const maxCount = Math.max(...dataPoints.map((d) => d.count), 1)
  const xScale = (i: number) => padX + (i / Math.max(dataPoints.length - 1, 1)) * chartW
  const yScale = (v: number) => padY + chartH - (v / maxCount) * chartH

  // Build area path
  const linePath = dataPoints.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(d.count).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${xScale(dataPoints.length - 1).toFixed(1)} ${(padY + chartH).toFixed(1)} L ${padX.toFixed(1)} ${(padY + chartH).toFixed(1)} Z`

  // Sprint boundaries
  const sprintLines: {x: number; label: string}[] = []
  for (const sw of sprintWindows) {
    const idx = dataPoints.findIndex((d) => d.date === sw.startDate)
    if (idx >= 0) {
      sprintLines.push({x: xScale(idx), label: ''})
    }
  }

  // Y-axis ticks
  const yTicks = [0, Math.round(maxCount / 2), maxCount]

  return (
    <div
      className="h-[180px] w-full overflow-hidden rounded-lg bg-canvas-accent"
      role="img"
      aria-label={`Commit history for last ${sprintWindows.length} sprints`}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* Sprint boundary lines */}
        {sprintLines.map((line, i) => (
          <line
            key={i}
            x1={line.x}
            y1={padY}
            x2={line.x}
            y2={padY + chartH}
            stroke="var(--color-border-subtle, #d9d1c5)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Y-axis ticks */}
        {yTicks.map((tick) => (
          <text
            key={tick}
            x={padX - 6}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-text-muted"
            style={{fontSize: '10px', fontFamily: 'IBM Plex Mono, monospace'}}
          >
            {tick}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="#335c8f" fillOpacity="0.15" />

        {/* Line stroke */}
        <path d={linePath} fill="none" stroke="#335c8f" strokeOpacity="0.6" strokeWidth="2" />
      </svg>
    </div>
  )
}

// -- Sprint Section --

function SprintSection({
  sprint,
  index,
  isExpanded,
  showAllPRs,
  organizationId,
  onToggle,
  onTogglePRs,
}: {
  sprint: GitHubSprintSummary
  index: number
  isExpanded: boolean
  showAllPRs: boolean
  organizationId: string
  onToggle: () => void
  onTogglePRs: () => void
}) {
  const displayedPRs = showAllPRs ? sprint.pullRequests : sprint.pullRequests.slice(0, DEFAULT_PR_DISPLAY_LIMIT)
  const hasMorePRs = sprint.pullRequests.length > DEFAULT_PR_DISPLAY_LIMIT

  return (
    <div className="border-t border-border-subtle bg-surface-muted pb-6 pt-4">
      {/* Header - always visible, clickable */}
      <button
        className="flex w-full items-start justify-between gap-4 px-4 text-left"
        onClick={onToggle}
        type="button"
        aria-expanded={isExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isExpanded
              ? <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
            }
            <div className="text-base font-semibold text-text-strong">{sprint.window.label}</div>
          </div>
          {sprint.delta ? (
            <div className="ml-6 mt-1 text-sm text-text-medium">{sprint.delta.label}</div>
          ) : index === 0 ? null : (
            <div className="ml-6 mt-1 text-sm text-text-muted">First tracked sprint</div>
          )}
        </div>

        {/* Headline metric + secondary chips */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="font-display text-xl font-semibold text-text-strong">{sprint.prsMerged}</div>
            <div className="text-xs text-text-muted">merged</div>
          </div>
          <div className="hidden flex-wrap items-center gap-1.5 md:flex">
            <MetricChip label="commits" value={sprint.commits} />
            <MetricChip label="opened" value={sprint.prsOpened} />
            <MetricChip label="reviews" value={sprint.reviewsSubmitted} />
            {sprint.medianCycleTimeHours !== null ? (
              <MetricChip label="cycle" value={formatHoursCompact(sprint.medianCycleTimeHours)} />
            ) : null}
            <MetricChip label="contributors" value={sprint.activeContributors} />
            {sprint.carryOverCount > 0 ? (
              <MetricChip label="carry-over" value={sprint.carryOverCount} />
            ) : null}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded ? (
        <div className="mt-4 px-4">
          {/* Contributor bar chart */}
          {sprint.contributors.length > 0 ? (
            <div className="mb-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Contributors</div>
              <ContributorChart contributors={sprint.contributors} />
            </div>
          ) : (
            <div className="mb-4 text-sm text-text-muted">
              No mapped contributors.{' '}
              <a className="underline underline-offset-2" href={`/org/${organizationId}/settings?tab=github`}>
                Map GitHub identities
              </a>{' '}
              to see individual breakdowns.
            </div>
          )}

          {/* PR table */}
          {sprint.pullRequests.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Pull Requests ({sprint.pullRequests.length})
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-text-muted">
                      <th className="pb-2 pr-3 font-medium">PR</th>
                      <th className="pb-2 pr-3 font-medium">Author</th>
                      <th className="pb-2 pr-3 font-medium">Opened</th>
                      <th className="pb-2 pr-3 font-medium">Merged</th>
                      <th className="pb-2 pr-3 font-medium">Cycle</th>
                      <th className="pb-2 font-medium">Badges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPRs.map((pr) => (
                      <PRTableRow key={pr.id} pr={pr} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="space-y-2 lg:hidden">
                {displayedPRs.map((pr) => (
                  <PRCardItem key={pr.id} pr={pr} />
                ))}
              </div>

              {hasMorePRs ? (
                <button
                  className="mt-2 text-sm text-text-muted underline underline-offset-2 hover:text-text-medium"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTogglePRs()
                  }}
                  type="button"
                >
                  {showAllPRs ? 'Show fewer' : `Show all ${sprint.pullRequests.length} PRs`}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-text-muted">No PRs landed in this sprint.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

// -- Subcomponents --

function MetricChip({label, value}: {label: string; value: number | string}) {
  return (
    <span className="rounded-full bg-canvas-accent px-2 py-0.5 font-mono text-xs text-text-muted">
      {value} {label}
    </span>
  )
}

function ContributorChart({contributors}: {contributors: GitHubSprintSummary['contributors']}) {
  const maxValue = Math.max(...contributors.map((c) => c.prsMerged + c.reviewsSubmitted), 1)

  return (
    <div className="space-y-1.5">
      {contributors.slice(0, 10).map((contributor) => {
        const mergedWidth = (contributor.prsMerged / maxValue) * 100
        const reviewWidth = (contributor.reviewsSubmitted / maxValue) * 100

        return (
          <div key={contributor.login} className="flex items-center gap-2">
            <div className="w-24 truncate text-xs text-text-medium lg:w-32">
              {contributor.isUnmapped ? `${contributor.login} (unmapped)` : contributor.login}
            </div>
            <div className="flex flex-1 gap-0.5">
              {contributor.prsMerged > 0 ? (
                <div
                  className="h-4 rounded-sm bg-[#bf6224]"
                  style={{width: `${Math.max(mergedWidth, 2)}%`}}
                  title={`${contributor.prsMerged} PRs merged`}
                />
              ) : null}
              {contributor.reviewsSubmitted > 0 ? (
                <div
                  className="h-4 rounded-sm bg-[#335c8f]"
                  style={{width: `${Math.max(reviewWidth, 2)}%`}}
                  title={`${contributor.reviewsSubmitted} reviews`}
                />
              ) : null}
            </div>
            <div className="w-16 text-right font-mono text-xs text-text-muted">
              {contributor.prsMerged}m {contributor.reviewsSubmitted}r
            </div>
          </div>
        )
      })}
      <div className="flex gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#bf6224]" /> PRs merged
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#335c8f]" /> Reviews
        </span>
      </div>
    </div>
  )
}

function PRTableRow({pr}: {pr: GitHubSprintPR}) {
  return (
    <tr className="border-b border-border-subtle/50 hover:bg-surface-elevated/50">
      <td className="py-2 pr-3">
        <a
          className="text-sm font-medium text-text-strong hover:underline"
          href={pr.htmlUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          #{pr.number} {pr.title}
          <ExternalLink className="ml-1 inline h-3 w-3 text-text-muted" />
        </a>
        {pr.repoName ? <div className="text-xs text-text-muted">{pr.repoName}</div> : null}
      </td>
      <td className="py-2 pr-3 text-xs text-text-medium">{pr.authorLogin ?? '—'}</td>
      <td className="py-2 pr-3 text-xs text-text-muted">{formatShortDate(pr.createdAt)}</td>
      <td className="py-2 pr-3 text-xs text-text-muted">{pr.mergedAt ? formatShortDate(pr.mergedAt) : '—'}</td>
      <td className="py-2 pr-3 font-mono text-xs text-text-muted">{pr.cycleTimeHours !== null ? formatHoursCompact(pr.cycleTimeHours) : '—'}</td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1">
          {pr.badges.map((badge) => (
            <BadgePill key={badge} badge={badge} />
          ))}
        </div>
      </td>
    </tr>
  )
}

function PRCardItem({pr}: {pr: GitHubSprintPR}) {
  return (
    <a
      className="block rounded-lg border border-border-subtle/50 bg-surface-elevated/50 px-3 py-2 hover:bg-surface-elevated"
      href={pr.htmlUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="text-sm font-medium text-text-strong">#{pr.number} {pr.title}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
        <span>{pr.authorLogin ?? 'unknown'}</span>
        {pr.cycleTimeHours !== null ? <span>· {formatHoursCompact(pr.cycleTimeHours)}</span> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {pr.badges.map((badge) => (
          <BadgePill key={badge} badge={badge} />
        ))}
      </div>
    </a>
  )
}

const BADGE_STYLES: Record<GitHubSprintActivityBadge, string> = {
  'opened': 'bg-[#335c8f]/10 text-[#335c8f]',
  'reviewed': 'bg-[#667487]/10 text-[#667487]',
  'merged': 'bg-[#2f7a55]/10 text-[#2f7a55]',
  'closed': 'bg-[#a13d34]/10 text-[#a13d34]',
  'carry-over': 'bg-[#a86c0f]/10 text-[#a86c0f]',
}

function BadgePill({badge}: {badge: GitHubSprintActivityBadge}) {
  const label = badge === 'carry-over' ? 'Carry-over' : badge.charAt(0).toUpperCase() + badge.slice(1)
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${BADGE_STYLES[badge]}`}>
      {label}
    </span>
  )
}

// -- Formatters --

function formatHoursCompact(hours: number) {
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`
  return `${hours.toFixed(1)}h`
}

function formatShortDate(value: string) {
  const d = new Date(value)
  return new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric'}).format(d)
}
