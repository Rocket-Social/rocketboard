import type {AttachmentRecord} from '../attachments/attachment.types'
import type {ContentDocument} from '../rich-text/content.types'

export type DocumentRecord = ContentDocument & {
  id: string
  projectId: string
  title: string
  updatedAt: string
  updatedByName: string
  version: number
}

export type DocumentVersionRecord = {
  authorName: string
  createdAt: string
  id: string
  title: string
  version: number
}

export type CommentReactions = Record<string, string[]>

export type DocumentCommentRecord = {
  authorName: string
  authorUserId: string
  bodyText: string
  createdAt: string
  id: string
  parentCommentId: string | null
  reactions: CommentReactions
  replies: DocumentCommentRecord[]
}

export type DocumentPresenceRecord = {
  lastSeenAt: string
  name: string
  state: string
  userId: string
}

export type ProjectDocumentSnapshot = {
  attachments: AttachmentRecord[]
  comments: DocumentCommentRecord[]
  document: DocumentRecord
  versions: DocumentVersionRecord[]
}

export type DocumentMutationResult = {
  document: DocumentRecord
  versionEntry: DocumentVersionRecord
}

export type SaveDocumentInput = ContentDocument & {
  createVersion?: boolean
  documentId: string
  expectedVersion: number
  title: string
}

export type RestoreDocumentVersionInput = {
  documentId: string
  expectedVersion: number
  versionId: string
}

export type AddDocumentCommentInput = {
  bodyText: string
  documentId: string
  parentCommentId?: string | null
}

export type ToggleCommentReactionInput = {
  commentId: string
  emoji: string
}

export type DeleteDocumentVersionInput = {
  documentId: string
  versionId: string
}

export type GetDocumentVersionContentInput = {
  documentId: string
  versionId: string
}

export type DocumentVersionContent = ContentDocument & {
  authorName: string
  createdAt: string
  id: string
  title: string
  version: number
}

export type UploadAttachmentInput = {
  documentId: string
  file: File
  projectId: string
}
