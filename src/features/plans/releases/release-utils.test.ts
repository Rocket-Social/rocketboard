import {describe, expect, it} from 'vitest'

import {plainTextToRichTextDocument} from '../../rich-text/rich-text'
import type {ReleaseRecord} from '../plan.types'
import {
  computeReleasesSummary,
  formatReleaseChecklistProgress,
  formatReleaseDrift,
  getNextReleaseStatuses,
  groupReleases,
  sortReleases,
} from './release-utils'

function makeRelease(overrides: Partial<ReleaseRecord> = {}): ReleaseRecord {
  return {
    abVariations: null,
    actualDate: null,
    archivedAt: null,
    buildNumber: null,
    checklistCompletedCount: 0,
    checklistItems: [],
    checklistTotalCount: 0,
    createdAt: '2026-04-01T12:00:00Z',
    createdByUserId: 'user-1',
    drift: null,
    forceUpgrade: false,
    health: 'on_track',
    id: overrides.id ?? crypto.randomUUID(),
    linkedCardCount: 0,
    linkedSprintCount: 0,
    name: 'Release',
    noteSections: [{content: plainTextToRichTextDocument(''), label: 'General'}],
    plannedDate: null,
    planViewId: 'view-1',
    position: 0,
    releaseNotes: null,
    retroNotes: null,
    retroUrl: null,
    status: 'draft',
    updatedAt: '2026-04-01T12:00:00Z',
    ...overrides,
  }
}

describe('formatReleaseDrift', () => {
  it('returns an em dash when one of the dates is missing', () => {
    expect(formatReleaseDrift(makeRelease({plannedDate: '2026-04-10'}))).toEqual({
      label: '—',
      tone: 'muted',
    })
  })

  it('labels on-time releases correctly', () => {
    expect(formatReleaseDrift(makeRelease({actualDate: '2026-04-10', plannedDate: '2026-04-10'}))).toEqual({
      label: 'On time',
      tone: 'success',
    })
  })

  it('labels early releases correctly', () => {
    expect(formatReleaseDrift(makeRelease({actualDate: '2026-04-08', plannedDate: '2026-04-10'}))).toEqual({
      label: '2 days early',
      tone: 'success',
    })
  })

  it('uses warning and error tones for late releases', () => {
    expect(formatReleaseDrift(makeRelease({actualDate: '2026-04-12', plannedDate: '2026-04-10'}))).toEqual({
      label: '+2 days',
      tone: 'warning',
    })

    expect(formatReleaseDrift(makeRelease({actualDate: '2026-04-15', plannedDate: '2026-04-10'}))).toEqual({
      label: '+5 days',
      tone: 'error',
    })
  })
})

describe('formatReleaseChecklistProgress', () => {
  it('returns an em dash when there are no checklist items', () => {
    expect(formatReleaseChecklistProgress(makeRelease())).toBe('—')
  })

  it('formats completion counts', () => {
    expect(formatReleaseChecklistProgress(makeRelease({
      checklistCompletedCount: 3,
      checklistTotalCount: 5,
    }))).toBe('3/5')
  })
})

describe('getNextReleaseStatuses', () => {
  it('follows the PRD transition rules', () => {
    expect(getNextReleaseStatuses('draft')).toEqual(['planned', 'archived'])
    expect(getNextReleaseStatuses('planned')).toEqual(['in_progress', 'draft', 'archived'])
    expect(getNextReleaseStatuses('released')).toEqual(['in_progress', 'archived'])
    expect(getNextReleaseStatuses('archived')).toEqual(['draft', 'planned', 'in_progress', 'released'])
  })
})

describe('computeReleasesSummary', () => {
  it('computes in-progress, overdue, on-time, and average drift', () => {
    const releases = [
      makeRelease({actualDate: '2026-04-10', drift: 0, id: 'a', plannedDate: '2026-04-10', status: 'released'}),
      makeRelease({actualDate: '2026-04-14', drift: 4, id: 'b', plannedDate: '2026-04-10', status: 'released'}),
      makeRelease({health: 'at_risk', id: 'c', plannedDate: '2026-04-05', status: 'in_progress'}),
    ]

    expect(computeReleasesSummary(releases, new Date('2026-04-12T00:00:00Z'))).toEqual({
      averageDrift: 2,
      inProgressCount: 1,
      onTimeCount: 1,
      overdueCount: 1,
      shippedWithPlanCount: 2,
    })
  })
})

describe('sortReleases', () => {
  it('sorts by dates with nulls last', () => {
    const releases = [
      makeRelease({id: 'a', plannedDate: null, position: 2}),
      makeRelease({id: 'b', plannedDate: '2026-04-05', position: 1}),
      makeRelease({id: 'c', plannedDate: '2026-04-01', position: 0}),
    ]

    expect(sortReleases(releases, 'plannedDate').map((release) => release.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('groupReleases', () => {
  it('groups by health using the intended severity order', () => {
    const releases = [
      makeRelease({health: 'on_track', id: 'a'}),
      makeRelease({health: 'blocked', id: 'b'}),
      makeRelease({health: 'at_risk', id: 'c'}),
    ]

    expect(groupReleases(releases, 'health').map((group) => group.id)).toEqual(['blocked', 'at_risk', 'on_track'])
  })
})
