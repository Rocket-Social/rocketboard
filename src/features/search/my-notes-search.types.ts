export type MyNotesSearchHit = {
  folderId: string | null
  folderName: string
  noteId: string
  rank: number
  snippet: string
  title: string
  updatedAt: string
}

export type MyNotesSearchSnapshot = {
  notes: MyNotesSearchHit[]
}
