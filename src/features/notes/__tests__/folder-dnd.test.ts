import {describe, expect, it} from 'vitest'

import {moveTopLevelFolderRow, type TopLevelFolderDropItem} from '../folder-dnd'

describe('moveTopLevelFolderRow', () => {
  it('inserts a nested folder into the root rows before unfiled', () => {
    const items: TopLevelFolderDropItem[] = [
      {folderId: 'notes', kind: 'folder'},
      {kind: 'unfiled'},
      {folderId: 'archive', kind: 'folder'},
    ]

    expect(moveTopLevelFolderRow({
      activeFolderId: 'child',
      items,
      targetIndex: 1,
    })).toEqual({
      nextRootFolderIds: ['notes', 'child', 'archive'],
      nextUnfiledRowIndex: 2,
    })
  })

  it('reorders an existing root folder to the end when there is no unfiled row', () => {
    const items: TopLevelFolderDropItem[] = [
      {folderId: 'notes', kind: 'folder'},
      {folderId: 'archive', kind: 'folder'},
      {folderId: 'ideas', kind: 'folder'},
    ]

    expect(moveTopLevelFolderRow({
      activeFolderId: 'notes',
      items,
      targetIndex: 3,
    })).toEqual({
      nextRootFolderIds: ['archive', 'ideas', 'notes'],
      nextUnfiledRowIndex: null,
    })
  })

  it('keeps root slot placement stable when reordering across the unfiled row', () => {
    const items: TopLevelFolderDropItem[] = [
      {folderId: 'notes', kind: 'folder'},
      {kind: 'unfiled'},
      {folderId: 'archive', kind: 'folder'},
    ]

    expect(moveTopLevelFolderRow({
      activeFolderId: 'notes',
      items,
      targetIndex: 2,
    })).toEqual({
      nextRootFolderIds: ['notes', 'archive'],
      nextUnfiledRowIndex: 0,
    })
  })

  it('returns null when the top-level arrangement does not change', () => {
    const items: TopLevelFolderDropItem[] = [
      {folderId: 'notes', kind: 'folder'},
      {kind: 'unfiled'},
      {folderId: 'archive', kind: 'folder'},
    ]

    expect(moveTopLevelFolderRow({
      activeFolderId: 'notes',
      items,
      targetIndex: 0,
    })).toBeNull()
  })
})
