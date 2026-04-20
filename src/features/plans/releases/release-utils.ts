import type {ReleaseHealth, ReleaseRecord, ReleaseStatus} from '../plan.types'

export type ReleaseSortKey = 'actualDate' | 'name' | 'plannedDate' | 'position'
export type ReleaseGroupBy = 'health' | 'none' | 'status'
export type ReleaseColumnId =
  | 'actualDate'
  | 'buildNumber'
  | 'checklist'
  | 'drift'
  | 'forceUpgrade'
  | 'health'
  | 'linkedCards'
  | 'linkedSprints'
  | 'plannedDate'
  | 'status'

export type ReleaseViewMode = 'table' | 'timeline'
export type ReleaseTimelineScale = 'month' | 'quarter' | 'week'

export const defaultVisibleReleaseColumns: ReleaseColumnId[] = [
  'status',
  'buildNumber',
  'plannedDate',
  'actualDate',
  'drift',
  'linkedCards',
  'linkedSprints',
  'checklist',
  'health',
  'forceUpgrade',
]

export const releaseStatusLabels: Record<ReleaseStatus, string> = {
  archived: 'Archived',
  draft: 'Draft',
  in_progress: 'In Progress',
  planned: 'Planned',
  released: 'Released',
}

export const releaseHealthLabels: Record<ReleaseHealth, string> = {
  at_risk: 'At Risk',
  blocked: 'Blocked',
  on_track: 'On Track',
}

export function getNextReleaseStatuses(status: ReleaseStatus): ReleaseStatus[] {
  switch (status) {
    case 'draft':
      return ['planned', 'archived']
    case 'planned':
      return ['in_progress', 'draft', 'archived']
    case 'in_progress':
      return ['released', 'planned', 'archived']
    case 'released':
      return ['in_progress', 'archived']
    case 'archived':
      return ['draft', 'planned', 'in_progress', 'released']
  }
}

export function getReleaseStatusChipClasses(status: ReleaseStatus) {
  switch (status) {
    case 'in_progress':
      return 'border-primary/20 bg-primary/10 text-primary'
    case 'released':
      return 'border-success/20 bg-success/10 text-success'
    case 'archived':
      return 'border-border-subtle bg-surface-muted text-text-muted'
    case 'draft':
      return 'border-border-subtle bg-surface-base text-text-muted'
    case 'planned':
    default:
      return 'border-secondary/20 bg-secondary/10 text-secondary'
  }
}

export function getReleaseHealthChipClasses(health: ReleaseHealth) {
  switch (health) {
    case 'on_track':
      return 'border-success/20 bg-success/10 text-success'
    case 'at_risk':
      return 'border-warning/20 bg-warning/10 text-warning'
    case 'blocked':
      return 'border-error/20 bg-error/10 text-error'
  }
}

function parseDateOnly(dateString: string | null) {
  if (!dateString) return null
  return new Date(`${dateString}T00:00:00Z`)
}

export function computeReleaseDriftDays(release: Pick<ReleaseRecord, 'actualDate' | 'drift' | 'plannedDate'>) {
  if (release.drift != null) return release.drift
  if (!release.actualDate || !release.plannedDate) return null

  const actualDate = parseDateOnly(release.actualDate)
  const plannedDate = parseDateOnly(release.plannedDate)
  if (!actualDate || !plannedDate) return null

  return Math.round((actualDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatReleaseDrift(release: Pick<ReleaseRecord, 'actualDate' | 'drift' | 'plannedDate'>) {
  const drift = computeReleaseDriftDays(release)
  if (drift == null) {
    return {label: '—', tone: 'muted' as const}
  }

  if (drift === 0) {
    return {label: 'On time', tone: 'success' as const}
  }

  if (drift < 0) {
    const daysEarly = Math.abs(drift)
    return {
      label: `${daysEarly} day${daysEarly === 1 ? '' : 's'} early`,
      tone: 'success' as const,
    }
  }

  return {
    label: `+${drift} day${drift === 1 ? '' : 's'}`,
    tone: drift <= 3 ? ('warning' as const) : ('error' as const),
  }
}

export function formatReleaseDate(dateString: string | null) {
  if (!dateString) return '—'
  const date = parseDateOnly(dateString)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

export function formatReleaseChecklistProgress(release: Pick<ReleaseRecord, 'checklistCompletedCount' | 'checklistTotalCount'>) {
  if (release.checklistTotalCount === 0) {
    return '—'
  }

  return `${release.checklistCompletedCount}/${release.checklistTotalCount}`
}

export function isReleaseOverdue(release: ReleaseRecord, today = new Date()) {
  if (!release.plannedDate || release.actualDate || release.status === 'released' || release.status === 'archived') {
    return false
  }

  const plannedDate = parseDateOnly(release.plannedDate)
  if (!plannedDate) return false

  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  return plannedDate.getTime() < todayUtc.getTime()
}

export function computeReleasesSummary(releases: ReleaseRecord[], today = new Date()) {
  const withDrift = releases
    .map((release) => computeReleaseDriftDays(release))
    .filter((drift): drift is number => drift != null)

  const shippedWithPlan = releases.filter((release) => release.actualDate && release.plannedDate)
  const onTimeCount = shippedWithPlan.filter((release) => (computeReleaseDriftDays(release) ?? 0) <= 0).length

  return {
    averageDrift: withDrift.length > 0 ? withDrift.reduce((sum, drift) => sum + drift, 0) / withDrift.length : null,
    inProgressCount: releases.filter((release) => release.status === 'in_progress').length,
    onTimeCount,
    overdueCount: releases.filter((release) => isReleaseOverdue(release, today)).length,
    shippedWithPlanCount: shippedWithPlan.length,
  }
}

function compareNullableDates(left: string | null, right: string | null) {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return left.localeCompare(right)
}

export function sortReleases(releases: ReleaseRecord[], sortKey: ReleaseSortKey) {
  const sorted = [...releases]

  sorted.sort((left, right) => {
    switch (sortKey) {
      case 'name':
        return left.name.localeCompare(right.name)
      case 'plannedDate': {
        const dateComparison = compareNullableDates(left.plannedDate, right.plannedDate)
        return dateComparison !== 0 ? dateComparison : left.position - right.position
      }
      case 'actualDate': {
        const dateComparison = compareNullableDates(left.actualDate, right.actualDate)
        return dateComparison !== 0 ? dateComparison : left.position - right.position
      }
      case 'position':
      default:
        return left.position - right.position
    }
  })

  return sorted
}

export function groupReleases(releases: ReleaseRecord[], groupBy: ReleaseGroupBy) {
  if (groupBy === 'none') {
    return [{id: 'all', label: '', releases}]
  }

  if (groupBy === 'status') {
    const order: ReleaseStatus[] = ['draft', 'planned', 'in_progress', 'released', 'archived']
    return order
      .map((status) => ({
        id: status,
        label: releaseStatusLabels[status],
        releases: releases.filter((release) => release.status === status),
      }))
      .filter((group) => group.releases.length > 0)
  }

  const order: ReleaseHealth[] = ['blocked', 'at_risk', 'on_track']
  return order
    .map((health) => ({
      id: health,
      label: releaseHealthLabels[health],
      releases: releases.filter((release) => release.health === health),
    }))
    .filter((group) => group.releases.length > 0)
}
