/** @vitest-environment jsdom */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  addRecentView,
  clearRecentViews,
  getRecentViews,
  pruneRecentViews,
  removeRecentViews,
} from './wiki-recent-viewed'

const ORG_ID = 'org-test-1'
const STORAGE_KEY = `wiki-recent-viewed-${ORG_ID}`

const makePage = (id: string, title = `Page ${id}`) => ({
  fullPath: `page-${id}`,
  icon: null,
  id,
  title,
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('addRecentView', () => {
  it('adds a page to empty storage', () => {
    addRecentView(ORG_ID, makePage('1'))
    const entries = getRecentViews(ORG_ID)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('1')
    expect(entries[0].title).toBe('Page 1')
    expect(entries[0].fullPath).toBe('page-1')
    expect(typeof entries[0].viewedAt).toBe('number')
  })

  it('prepends new entries (most recent first)', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    addRecentView(ORG_ID, makePage('3'))
    const entries = getRecentViews(ORG_ID)
    expect(entries.map((e) => e.id)).toEqual(['3', '2', '1'])
  })

  it('moves re-viewed page to front without duplicating', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    addRecentView(ORG_ID, makePage('3'))
    // Re-view page 1
    addRecentView(ORG_ID, makePage('1'))
    const entries = getRecentViews(ORG_ID)
    expect(entries.map((e) => e.id)).toEqual(['1', '3', '2'])
    expect(entries).toHaveLength(3)
  })

  it('caps at 5 entries', () => {
    for (let i = 1; i <= 7; i++) {
      addRecentView(ORG_ID, makePage(String(i)))
    }
    const entries = getRecentViews(ORG_ID)
    expect(entries).toHaveLength(5)
    // Most recent 5: 7, 6, 5, 4, 3
    expect(entries.map((e) => e.id)).toEqual(['7', '6', '5', '4', '3'])
  })

  it('preserves icon field', () => {
    addRecentView(ORG_ID, {fullPath: 'test', icon: '📘', id: '1', title: 'Test'})
    const entries = getRecentViews(ORG_ID)
    expect(entries[0].icon).toBe('📘')
  })

  it('updates title and full path when re-viewing a renamed page', () => {
    addRecentView(ORG_ID, makePage('1', 'Old Title'))
    addRecentView(ORG_ID, {fullPath: 'new-slug', icon: null, id: '1', title: 'New Title'})
    const entries = getRecentViews(ORG_ID)
    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('New Title')
    expect(entries[0].fullPath).toBe('new-slug')
  })
})

describe('getRecentViews', () => {
  it('returns empty array when nothing stored', () => {
    expect(getRecentViews(ORG_ID)).toEqual([])
  })

  it('filters out excluded IDs', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    addRecentView(ORG_ID, makePage('3'))
    const entries = getRecentViews(ORG_ID, ['2'])
    expect(entries.map((e) => e.id)).toEqual(['3', '1'])
  })

  it('handles excluding all entries', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    const entries = getRecentViews(ORG_ID, ['1', '2'])
    expect(entries).toEqual([])
  })

  it('handles empty excludeIds gracefully', () => {
    addRecentView(ORG_ID, makePage('1'))
    const entries = getRecentViews(ORG_ID, [])
    expect(entries).toHaveLength(1)
  })
})

describe('org scoping', () => {
  it('scopes entries by orgId', () => {
    addRecentView('org-a', makePage('1', 'From Org A'))
    addRecentView('org-b', makePage('2', 'From Org B'))
    expect(getRecentViews('org-a').map((e) => e.title)).toEqual(['From Org A'])
    expect(getRecentViews('org-b').map((e) => e.title)).toEqual(['From Org B'])
  })
})

describe('corrupt data handling', () => {
  it('returns empty array for corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{')
    expect(getRecentViews(ORG_ID)).toEqual([])
  })

  it('returns empty array for non-array JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{"object": true}')
    expect(getRecentViews(ORG_ID)).toEqual([])
  })

  it('filters out entries with missing required fields', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {id: '1', fullPath: 'good', title: 'Good', icon: null, viewedAt: 1},
        {id: '2', fullPath: 'missing-title', icon: null, viewedAt: 2},
        {id: '3', title: 'missing-path', icon: null, viewedAt: 3},
        'not-an-object',
        null,
      ]),
    )
    const entries = getRecentViews(ORG_ID)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('1')
  })

  it('recovers after corrupt data by writing valid data', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage')
    addRecentView(ORG_ID, makePage('1'))
    const entries = getRecentViews(ORG_ID)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('1')
  })

  it('normalizes legacy slug-only entries to full paths', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {id: '1', slug: 'parent/child', title: 'Child', icon: null, viewedAt: 1},
      ]),
    )

    const entries = getRecentViews(ORG_ID)

    expect(entries).toHaveLength(1)
    expect(entries[0].fullPath).toBe('parent/child')
  })
})

describe('clearRecentViews', () => {
  it('removes all entries for an org', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    clearRecentViews(ORG_ID)
    expect(getRecentViews(ORG_ID)).toEqual([])
  })

  it('does not affect other orgs', () => {
    addRecentView('org-a', makePage('1'))
    addRecentView('org-b', makePage('2'))
    clearRecentViews('org-a')
    expect(getRecentViews('org-a')).toEqual([])
    expect(getRecentViews('org-b')).toHaveLength(1)
  })
})

describe('pruneRecentViews', () => {
  it('removes entries that are no longer accessible', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    addRecentView(ORG_ID, makePage('3'))

    const entries = pruneRecentViews(ORG_ID, ['3', '1'])

    expect(entries.map((entry) => entry.id)).toEqual(['3', '1'])
    expect(getRecentViews(ORG_ID).map((entry) => entry.id)).toEqual(['3', '1'])
  })

  it('leaves storage unchanged when every entry is still accessible', () => {
    addRecentView(ORG_ID, makePage('1'))

    const before = localStorage.getItem(STORAGE_KEY)
    const entries = pruneRecentViews(ORG_ID, ['1'])
    const after = localStorage.getItem(STORAGE_KEY)

    expect(entries.map((entry) => entry.id)).toEqual(['1'])
    expect(after).toBe(before)
  })
})

describe('removeRecentViews', () => {
  it('removes explicitly deleted entries from storage', () => {
    addRecentView(ORG_ID, makePage('1'))
    addRecentView(ORG_ID, makePage('2'))
    addRecentView(ORG_ID, makePage('3'))

    const entries = removeRecentViews(ORG_ID, ['2', '3'])

    expect(entries.map((entry) => entry.id)).toEqual(['1'])
    expect(getRecentViews(ORG_ID).map((entry) => entry.id)).toEqual(['1'])
  })

  it('leaves storage unchanged when no removed ids are present', () => {
    addRecentView(ORG_ID, makePage('1'))

    const before = localStorage.getItem(STORAGE_KEY)
    const entries = removeRecentViews(ORG_ID, ['missing'])
    const after = localStorage.getItem(STORAGE_KEY)

    expect(entries.map((entry) => entry.id)).toEqual(['1'])
    expect(after).toBe(before)
  })
})

describe('localStorage unavailable', () => {
  it('handles getItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(getRecentViews(ORG_ID)).toEqual([])
    vi.restoreAllMocks()
  })

  it('handles setItem throwing (quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    // Should not throw
    expect(() => addRecentView(ORG_ID, makePage('1'))).not.toThrow()
    vi.restoreAllMocks()
  })
})
