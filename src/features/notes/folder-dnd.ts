export type TopLevelFolderDropItem =
  | {folderId: string; kind: 'folder'}
  | {kind: 'unfiled'}

export type TopLevelFolderMoveResult = {
  nextRootFolderIds: string[]
  nextUnfiledRowIndex: number | null
}

export function moveTopLevelFolderRow(params: {
  activeFolderId: string
  items: TopLevelFolderDropItem[]
  targetIndex: number
}): TopLevelFolderMoveResult | null {
  const activeItem: TopLevelFolderDropItem = {
    folderId: params.activeFolderId,
    kind: 'folder',
  }
  const activeIndex = params.items.findIndex(
    (item) => item.kind === 'folder' && item.folderId === params.activeFolderId,
  )
  const itemsWithoutActive = params.items.filter(
    (item) => item.kind !== 'folder' || item.folderId !== params.activeFolderId,
  )
  const unclampedTargetIndex = activeIndex !== -1 && activeIndex < params.targetIndex
    ? params.targetIndex - 1
    : params.targetIndex
  const nextIndex = Math.min(Math.max(unclampedTargetIndex, 0), itemsWithoutActive.length)
  const nextItems = [...itemsWithoutActive]

  nextItems.splice(nextIndex, 0, activeItem)

  const nextRootFolderIds = nextItems.flatMap((item) => item.kind === 'folder' ? [item.folderId] : [])
  const nextUnfiledRowIndex = nextItems.findIndex((item) => item.kind === 'unfiled')
  const previousRootFolderIds = params.items.flatMap((item) => item.kind === 'folder' ? [item.folderId] : [])
  const previousUnfiledRowIndex = params.items.findIndex((item) => item.kind === 'unfiled')

  const sameRootOrder =
    previousRootFolderIds.length === nextRootFolderIds.length
    && previousRootFolderIds.every((folderId, index) => folderId === nextRootFolderIds[index])
  const sameUnfiledRowIndex = previousUnfiledRowIndex === nextUnfiledRowIndex

  if (sameRootOrder && sameUnfiledRowIndex) {
    return null
  }

  return {
    nextRootFolderIds,
    nextUnfiledRowIndex: nextUnfiledRowIndex === -1 ? null : nextUnfiledRowIndex,
  }
}
