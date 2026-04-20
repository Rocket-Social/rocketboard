export type WorkspaceSearchCardHit = {
  cardId: string
  cardRef: string | null
  orgSlug: string
  priorityOptionId: string | null
  projectId: string
  projectName: string
  projectSlug: string
  rank: number
  snippet: string
  statusOptionId: string | null
  title: string
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
}

export type WorkspaceSearchDocumentHit = {
  documentId: string
  orgSlug: string
  projectId: string
  projectName: string
  projectSlug: string
  projectViewId: string
  rank: number
  snippet: string
  source: 'comment' | 'document'
  title: string
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
}

export type WorkspaceSearchSnapshot = {
  cards: WorkspaceSearchCardHit[]
  documents: WorkspaceSearchDocumentHit[]
}
