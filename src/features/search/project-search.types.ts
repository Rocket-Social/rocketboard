export type ProjectSearchCardHit = {
  cardId: string
  cardRef: string | null
  priorityOptionId: string | null
  rank: number
  snippet: string
  statusOptionId: string | null
  title: string
}

export type ProjectSearchDocumentHit = {
  documentId: string
  projectViewId: string
  rank: number
  snippet: string
  source: 'comment' | 'document'
  title: string
}

export type ProjectSearchSnapshot = {
  cards: ProjectSearchCardHit[]
  documents: ProjectSearchDocumentHit[]
}
