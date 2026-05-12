import {describe, expect, it} from 'vitest'

import type {NotificationRow} from '../inbox.types'
import {classifyNotificationBucket, groupNotifications} from './NotificationGroup'

function makeRow(createdAt: string, id = 'n'): NotificationRow {
  return {
    archivedAt: null,
    body: null,
    cardId: null,
    createdAt,
    id,
    kind: 'mention',
    link: null,
    organizationId: 'org',
    originRunId: null,
    originUserId: null,
    projectId: null,
    readAt: null,
    title: 't',
    userId: 'u',
  }
}

// Buckets are anchored on local-time midnight, so we anchor `now` and the
// candidate timestamps relative to it (in ms) to avoid timezone-dependent
// failures on machines outside UTC.
function offsetIso(baseMs: number, offsetMs: number): string {
  return new Date(baseMs + offsetMs).toISOString()
}

describe('classifyNotificationBucket', () => {
  const now = new Date('2026-05-08T12:00:00')
  const baseMs = now.getTime()

  it('classifies same-day notifications as today', () => {
    // 1 hour ago and 30 minutes ago are unambiguously "today" regardless of TZ.
    expect(
      classifyNotificationBucket(makeRow(offsetIso(baseMs, -60 * 60_000)), now),
    ).toBe('today')
    expect(
      classifyNotificationBucket(makeRow(offsetIso(baseMs, -30 * 60_000)), now),
    ).toBe('today')
  })

  it('classifies notifications within last 7 days as this-week', () => {
    // 2 days ago and 6 days ago are inside the rolling window.
    expect(
      classifyNotificationBucket(makeRow(offsetIso(baseMs, -2 * 24 * 60 * 60_000)), now),
    ).toBe('this-week')
    expect(
      classifyNotificationBucket(makeRow(offsetIso(baseMs, -5 * 24 * 60 * 60_000)), now),
    ).toBe('this-week')
  })

  it('classifies older notifications as earlier', () => {
    // 30 days ago is well past the 7-day boundary.
    expect(
      classifyNotificationBucket(makeRow(offsetIso(baseMs, -30 * 24 * 60 * 60_000)), now),
    ).toBe('earlier')
  })

  it('falls back to earlier for unparseable timestamps', () => {
    expect(classifyNotificationBucket(makeRow('not-a-date'), now)).toBe('earlier')
  })
})

describe('groupNotifications', () => {
  const now = new Date('2026-05-08T12:00:00')
  const baseMs = now.getTime()

  it('returns groups in display order with empty buckets skipped', () => {
    const rows = [
      makeRow(offsetIso(baseMs, -30 * 24 * 60 * 60_000), 'old'),
      makeRow(offsetIso(baseMs, -60 * 60_000), 'today'),
    ]
    const groups = groupNotifications(rows, now)
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'earlier'])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['today'])
    expect(groups[1].rows.map((r) => r.id)).toEqual(['old'])
  })

  it('returns empty array when no rows', () => {
    expect(groupNotifications([], now)).toEqual([])
  })
})
