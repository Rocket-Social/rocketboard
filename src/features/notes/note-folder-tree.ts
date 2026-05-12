import type {NoteFolderRecord} from './note.types'

export function buildFolderChildrenMap(folders: NoteFolderRecord[]): Map<string | null, NoteFolderRecord[]> {
  const byParent = new Map<string | null, NoteFolderRecord[]>()

  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? []
    siblings.push(folder)
    byParent.set(folder.parentId, siblings)
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.position - b.position)
  }

  return byParent
}

export function buildManagedFolderIdSet(
  folders: Pick<NoteFolderRecord, 'id' | 'parentId'>[],
  managedRootFolderId: string | null,
): Set<string> {
  if (!managedRootFolderId) {
    return new Set()
  }

  return new Set(
    folders
      .filter((folder) => folder.id === managedRootFolderId || folder.parentId === managedRootFolderId)
      .map((folder) => folder.id),
  )
}

export function getFolderIdsToExpandForActiveFolder(
  folders: Pick<NoteFolderRecord, 'id' | 'parentId'>[],
  activeFolderId: string | null,
): string[] {
  if (!activeFolderId) {
    return []
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  const activeFolder = folderById.get(activeFolderId)

  if (!activeFolder) {
    return []
  }

  const folderIds: string[] = []
  let cursor: Pick<NoteFolderRecord, 'id' | 'parentId'> | undefined = activeFolder

  while (cursor) {
    folderIds.push(cursor.id)
    cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined
  }

  return folderIds
}
