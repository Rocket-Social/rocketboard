import {describe, expect, it} from 'vitest'

import {
  buildFolderChildrenMap,
  buildManagedFolderIdSet,
  getFolderIdsToExpandForActiveFolder,
} from '../note-folder-tree'
import type {NoteFolderRecord} from '../note.types'

function makeFolder(overrides: Partial<NoteFolderRecord>): NoteFolderRecord {
  return {
    createdAt: '2026-04-08T00:00:00Z',
    id: 'folder-1',
    name: 'Folder',
    parentId: null,
    position: 0,
    updatedAt: '2026-04-08T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

describe('buildFolderChildrenMap', () => {
  it('groups folders by parent and preserves position order', () => {
    const folders = [
      makeFolder({id: 'child-2', name: 'Child 2', parentId: 'root', position: 2}),
      makeFolder({id: 'root', name: 'Root', parentId: null, position: 1}),
      makeFolder({id: 'child-1', name: 'Child 1', parentId: 'root', position: 1}),
      makeFolder({id: 'root-2', name: 'Root 2', parentId: null, position: 0}),
    ]

    const byParent = buildFolderChildrenMap(folders)

    expect(byParent.get(null)?.map((folder) => folder.id)).toEqual(['root-2', 'root'])
    expect(byParent.get('root')?.map((folder) => folder.id)).toEqual(['child-1', 'child-2'])
  })
})

describe('buildManagedFolderIdSet', () => {
  it('marks the Granola root and its direct children as managed', () => {
    const managedIds = buildManagedFolderIdSet([
      makeFolder({id: 'granola-root'}),
      makeFolder({id: 'gamemakers', parentId: 'granola-root'}),
      makeFolder({id: 'recruiting', parentId: 'granola-root'}),
      makeFolder({id: 'manual-root'}),
      makeFolder({id: 'manual-child', parentId: 'manual-root'}),
    ], 'granola-root')

    expect([...managedIds]).toEqual(['granola-root', 'gamemakers', 'recruiting'])
  })
})

describe('getFolderIdsToExpandForActiveFolder', () => {
  it('returns both the active child folder and its parent', () => {
    const folderIds = getFolderIdsToExpandForActiveFolder([
      makeFolder({id: 'granola-root'}),
      makeFolder({id: 'gamemakers', parentId: 'granola-root'}),
    ], 'gamemakers')

    expect(folderIds).toEqual(['gamemakers', 'granola-root'])
  })

  it('returns the full ancestor chain for deeply nested folders', () => {
    const folderIds = getFolderIdsToExpandForActiveFolder([
      makeFolder({id: 'granola-root'}),
      makeFolder({id: 'parent', parentId: 'granola-root'}),
      makeFolder({id: 'child', parentId: 'parent'}),
    ], 'child')

    expect(folderIds).toEqual(['child', 'parent', 'granola-root'])
  })

  it('returns an empty list when the active folder is unknown', () => {
    const folderIds = getFolderIdsToExpandForActiveFolder([], 'missing-folder')

    expect(folderIds).toEqual([])
  })
})
