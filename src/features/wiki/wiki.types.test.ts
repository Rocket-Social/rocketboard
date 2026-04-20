import {describe, expect, it} from 'vitest'
import {
  buildWikiPageBreadcrumbs,
  buildWikiPagePath,
  buildWikiPagePathFromMap,
  buildWikiPageTree,
  formatWikiPageDate,
  getWikiPageDisplayTitle,
  type WikiPageListItem,
} from './wiki.types'

const makePage = (overrides: Partial<WikiPageListItem>): WikiPageListItem => ({
  createdAt: '2026-04-07T00:00:00Z',
  createdByUserId: 'user-1',
  deletedAt: null,
  icon: null,
  id: overrides.id ?? 'page-1',
  organizationId: 'org-1',
  ownerUserId: 'user-1',
  parentPageId: overrides.parentPageId ?? null,
  position: overrides.position ?? 0,
  projectId: null,
  slug: overrides.slug ?? 'test-page',
  status: 'draft',
  title: overrides.title ?? 'Test Page',
  updatedAt: '2026-04-07T00:00:00Z',
  updatedByUserId: 'user-1',
  verifiedAt: null,
  verifiedByUserId: null,
  version: 1,
})

describe('buildWikiPageTree', () => {
  it('builds flat tree from root pages', () => {
    const pages = [
      makePage({id: 'a', title: 'A', position: 0}),
      makePage({id: 'b', title: 'B', position: 1}),
    ]
    const tree = buildWikiPageTree(pages)
    expect(tree).toHaveLength(2)
    expect(tree[0].title).toBe('A')
    expect(tree[1].title).toBe('B')
  })

  it('nests children under parents', () => {
    const pages = [
      makePage({id: 'parent', title: 'Parent', position: 0}),
      makePage({id: 'child-1', title: 'Child 1', parentPageId: 'parent', position: 0}),
      makePage({id: 'child-2', title: 'Child 2', parentPageId: 'parent', position: 1}),
    ]
    const tree = buildWikiPageTree(pages)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].title).toBe('Child 1')
    expect(tree[0].children[1].title).toBe('Child 2')
  })

  it('sorts children by position', () => {
    const pages = [
      makePage({id: 'parent', title: 'Parent'}),
      makePage({id: 'c', title: 'C', parentPageId: 'parent', position: 2}),
      makePage({id: 'a', title: 'A', parentPageId: 'parent', position: 0}),
      makePage({id: 'b', title: 'B', parentPageId: 'parent', position: 1}),
    ]
    const tree = buildWikiPageTree(pages)
    expect(tree[0].children.map((c) => c.title)).toEqual(['A', 'B', 'C'])
  })

  it('handles orphaned children gracefully', () => {
    const pages = [
      makePage({id: 'orphan', title: 'Orphan', parentPageId: 'missing-parent'}),
    ]
    const tree = buildWikiPageTree(pages)
    // Orphan should appear as root
    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('Orphan')
  })
})

describe('getWikiPageDisplayTitle', () => {
  it('returns title when present', () => {
    expect(getWikiPageDisplayTitle({title: 'Hello'})).toBe('Hello')
  })

  it('returns Untitled for empty title', () => {
    expect(getWikiPageDisplayTitle({title: ''})).toBe('Untitled')
  })

  it('returns Untitled for whitespace-only title', () => {
    expect(getWikiPageDisplayTitle({title: '   '})).toBe('Untitled')
  })
})

describe('buildWikiPagePath', () => {
  it('returns slug for root page', () => {
    const pages = [makePage({id: 'a', slug: 'deploy'})]
    expect(buildWikiPagePath({slug: 'deploy', parentPageId: null}, pages)).toBe('deploy')
  })

  it('builds nested path', () => {
    const pages = [
      makePage({id: 'parent', slug: 'engineering', parentPageId: null}),
      makePage({id: 'child', slug: 'deploy', parentPageId: 'parent'}),
    ]
    expect(buildWikiPagePath({slug: 'deploy', parentPageId: 'parent'}, pages)).toBe('engineering/deploy')
  })

  it('handles cycle without infinite loop', () => {
    const pages = [
      makePage({id: 'a', slug: 'a', parentPageId: 'b'}),
      makePage({id: 'b', slug: 'b', parentPageId: 'a'}),
    ]
    // Should not hang — visited set breaks the cycle
    const result = buildWikiPagePath({slug: 'a', parentPageId: 'b'}, pages)
    expect(typeof result).toBe('string')
  })
})

describe('buildWikiPagePathFromMap', () => {
  it('builds nested path from an indexed page map', () => {
    const pages = [
      makePage({id: 'root', slug: 'engineering', parentPageId: null}),
      makePage({id: 'child', slug: 'deploy', parentPageId: 'root'}),
      makePage({id: 'grandchild', slug: 'playbook', parentPageId: 'child'}),
    ]
    const pagesById = new Map(pages.map((page) => [page.id, page] as const))

    expect(
      buildWikiPagePathFromMap(
        {slug: 'playbook', parentPageId: 'child'},
        pagesById,
      ),
    ).toBe('engineering/deploy/playbook')
  })

  it('handles cycle without infinite loop', () => {
    const pages = [
      makePage({id: 'a', slug: 'a', parentPageId: 'b'}),
      makePage({id: 'b', slug: 'b', parentPageId: 'a'}),
    ]
    const pagesById = new Map(pages.map((page) => [page.id, page] as const))

    const result = buildWikiPagePathFromMap(
      {slug: 'a', parentPageId: 'b'},
      pagesById,
    )

    expect(typeof result).toBe('string')
  })
})

describe('buildWikiPageBreadcrumbs', () => {
  it('returns empty for root page', () => {
    const pages = [makePage({id: 'a', slug: 'deploy'})]
    const crumbs = buildWikiPageBreadcrumbs(
      {id: 'a', title: 'Deploy', parentPageId: null},
      pages,
    )
    expect(crumbs).toHaveLength(0)
  })

  it('returns parent chain', () => {
    const pages = [
      makePage({id: 'root', slug: 'eng', title: 'Engineering'}),
      makePage({id: 'child', slug: 'deploy', title: 'Deploy', parentPageId: 'root'}),
    ]
    const crumbs = buildWikiPageBreadcrumbs(
      {id: 'child', title: 'Deploy', parentPageId: 'root'},
      pages,
    )
    expect(crumbs).toHaveLength(1)
    expect(crumbs[0].title).toBe('Engineering')
  })
})

describe('formatWikiPageDate', () => {
  it('returns Just now for recent dates', () => {
    const now = new Date().toISOString()
    expect(formatWikiPageDate(now)).toBe('Just now')
  })

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatWikiPageDate(fiveMinAgo)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(formatWikiPageDate(twoHoursAgo)).toBe('2h ago')
  })

  it('returns days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatWikiPageDate(threeDaysAgo)).toBe('3d ago')
  })
})
