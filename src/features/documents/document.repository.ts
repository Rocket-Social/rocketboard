import {blobStore} from '../../platform/blob/blob-store'
import {getErrorMessage, rpcAdapter} from '../../platform/data/rpc-adapter'
import {getSession} from '../auth/data'
import type {AttachmentRecord} from '../attachments/attachment.types'
import type {
  AddDocumentCommentInput,
  CommentReactions,
  DeleteDocumentVersionInput,
  DocumentCommentRecord,
  DocumentMutationResult,
  DocumentPresenceRecord,
  DocumentRecord,
  DocumentVersionContent,
  GetDocumentVersionContentInput,
  ProjectDocumentSnapshot,
  RestoreDocumentVersionInput,
  SaveDocumentInput,
  ToggleCommentReactionInput,
  UploadAttachmentInput,
} from './document.types'

export const DOCUMENT_CONFLICT = 'DOCUMENT_CONFLICT'
export const DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND'
export const DOCUMENT_TITLE_REQUIRED = 'DOCUMENT_TITLE_REQUIRED'

export type DocumentRepository = {
  addComment(input: AddDocumentCommentInput): Promise<DocumentCommentRecord>
  deleteDocumentVersion(input: DeleteDocumentVersionInput): Promise<void>
  getDocumentPresence(documentId: string): Promise<DocumentPresenceRecord[]>
  getDocumentVersionContent(input: GetDocumentVersionContentInput): Promise<DocumentVersionContent>
  getProjectDocumentSnapshot(projectViewId: string): Promise<ProjectDocumentSnapshot>
  restoreDocumentVersion(input: RestoreDocumentVersionInput): Promise<DocumentMutationResult>
  saveDocument(input: SaveDocumentInput): Promise<DocumentMutationResult>
  toggleCommentReaction(input: ToggleCommentReactionInput): Promise<CommentReactions>
  updatePresence(documentId: string, state?: string): Promise<DocumentPresenceRecord>
  uploadAttachment(input: UploadAttachmentInput): Promise<AttachmentRecord>
}

async function requireAuthenticatedSession() {
  const session = await getSession()

  if (session.status !== 'authenticated') {
    throw new Error('You must be signed in to edit documents.')
  }

  return session.user
}

export function getDocumentErrorCode(error: unknown) {
  return getErrorMessage(error, 'Unknown document error.')
}

// ── Flat row types for returns table(...) RPCs ──────────────

type FlatDocumentSnapshotRow = {
  attachments: ProjectDocumentSnapshot['attachments']
  comments: ProjectDocumentSnapshot['comments']
  contentJson: DocumentRecord['contentJson']
  contentMd: string
  id: string
  projectId: string
  projectKey: string
  projectName: string
  projectSlug: string
  projectViewId: string
  title: string
  updatedAt: string
  updatedByName: string
  version: number
  versions: ProjectDocumentSnapshot['versions']
}

function reshapeDocumentSnapshot(row: FlatDocumentSnapshotRow): ProjectDocumentSnapshot {
  return {
    attachments: row.attachments,
    comments: row.comments,
    document: {
      contentJson: row.contentJson,
      contentMd: row.contentMd,
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      updatedAt: row.updatedAt,
      updatedByName: row.updatedByName,
      version: row.version,
    },
    versions: row.versions,
  }
}

type FlatDocumentMutationRow = {
  documentContentJson: DocumentRecord['contentJson']
  documentContentText: string
  documentId: string
  documentProjectId: string
  documentTitle: string
  documentUpdatedAt: string
  documentUpdatedByName: string
  documentVersion: number
  versionEntryAuthorName: string
  versionEntryCreatedAt: string
  versionEntryId: string
  versionEntryTitle: string
  versionEntryVersion: number
}

function reshapeDocumentMutation(row: FlatDocumentMutationRow): DocumentMutationResult {
  return {
    document: {
      contentJson: row.documentContentJson,
      contentMd: row.documentContentText,
      id: row.documentId,
      projectId: row.documentProjectId,
      title: row.documentTitle,
      updatedAt: row.documentUpdatedAt,
      updatedByName: row.documentUpdatedByName,
      version: row.documentVersion,
    },
    versionEntry: {
      authorName: row.versionEntryAuthorName,
      createdAt: row.versionEntryCreatedAt,
      id: row.versionEntryId,
      title: row.versionEntryTitle,
      version: row.versionEntryVersion,
    },
  }
}

// ── Exported loaders ────────────────────────────────────────

export async function loadSupabaseProjectDocumentSnapshot(projectViewId: string): Promise<ProjectDocumentSnapshot> {
  const row = await rpcAdapter.callSingle<FlatDocumentSnapshotRow | null>('get_project_document_snapshot', {
    target_project_view_id: projectViewId,
  })

  if (!row) {
    throw new Error(DOCUMENT_NOT_FOUND)
  }

  return reshapeDocumentSnapshot(row)
}

export const documentRepository: DocumentRepository = {
  async addComment(input) {
    const row = await rpcAdapter.callSingle<Omit<DocumentCommentRecord, 'replies'>>('add_document_comment', {
      target_body_text: input.bodyText,
      target_document_id: input.documentId,
      target_parent_comment_id: input.parentCommentId ?? null,
    })

    return {...row, replies: []}
  },
  async deleteDocumentVersion(input) {
    await rpcAdapter.call<null>('delete_document_version', {
      target_document_id: input.documentId,
      target_version_id: input.versionId,
    })
  },
  async getDocumentPresence(documentId) {
    return rpcAdapter.callAndTransform<DocumentPresenceRecord[]>('get_document_presence', {
      target_document_id: documentId,
    })
  },
  async getDocumentVersionContent(input) {
    const data = await rpcAdapter.callSingle<DocumentVersionContent | null>('get_document_version_content', {
      target_document_id: input.documentId,
      target_version_id: input.versionId,
    })

    if (!data) {
      throw new Error('Version not found')
    }

    return data
  },
  async getProjectDocumentSnapshot(projectViewId) {
    return loadSupabaseProjectDocumentSnapshot(projectViewId)
  },
  async restoreDocumentVersion(input) {
    const row = await rpcAdapter.callSingle<FlatDocumentMutationRow>('restore_document_version', {
      expected_version: input.expectedVersion,
      target_document_id: input.documentId,
      target_version_id: input.versionId,
    })

    return reshapeDocumentMutation(row)
  },
  async saveDocument(input) {
    const row = await rpcAdapter.callSingle<FlatDocumentMutationRow>('save_document', {
      expected_version: input.expectedVersion,
      target_content_json: input.contentJson,
      target_content_md: input.contentMd,
      target_create_version: input.createVersion ?? true,
      target_document_id: input.documentId,
      target_title: input.title,
    })

    return reshapeDocumentMutation(row)
  },
  async toggleCommentReaction(input) {
    const row = await rpcAdapter.callSingle<{reactions: CommentReactions}>('toggle_comment_reaction', {
      target_comment_id: input.commentId,
      target_emoji: input.emoji,
    })

    return row?.reactions ?? {}
  },
  async updatePresence(documentId, state = 'editing') {
    const currentUser = await requireAuthenticatedSession()
    const payload = await rpcAdapter.callSingle<{documentId: string; lastSeenAt: string; state: string; userId: string}>('upsert_document_presence', {
      target_document_id: documentId,
      target_state: state,
    })

    return {
      lastSeenAt: payload.lastSeenAt,
      name: currentUser.name,
      state: payload.state,
      userId: payload.userId,
    }
  },
  async uploadAttachment(input) {
    const storagePath = await blobStore.uploadProjectAttachment({
      file: input.file,
      parentId: input.documentId,
      projectId: input.projectId,
    })

    try {
      return rpcAdapter.callSingle<AttachmentRecord>('create_attachment', {
        target_content_type: input.file.type || null,
        target_document_id: input.documentId,
        target_file_name: input.file.name,
        target_project_id: input.projectId,
        target_size_bytes: input.file.size,
        target_storage_path: storagePath,
      })
    } catch (error) {
      await blobStore.remove([storagePath])
      throw error
    }
  },
}

export function toDocumentErrorMessage(error: unknown) {
  const message = getDocumentErrorCode(error)

  if (message === DOCUMENT_CONFLICT) {
    return 'This document was updated somewhere else. Reload the latest version before saving again.'
  }

  if (message === DOCUMENT_NOT_FOUND) {
    return 'This document project could not be loaded.'
  }

  if (message === DOCUMENT_TITLE_REQUIRED) {
    return 'Add a title before saving this document.'
  }

  if (message === 'AUTHENTICATION_REQUIRED') {
    return 'You must be signed in to edit documents.'
  }

  if (message === 'Access denied') {
    return 'You no longer have permission to edit this document.'
  }

  return message
}
