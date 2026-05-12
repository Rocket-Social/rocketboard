import {type QueryClient, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import type {AttachmentRecord} from '../attachments/attachment.types'
import {
  documentRepository,
  type DocumentRepository,
} from './document.repository'
import type {
  AddDocumentCommentInput,
  DeleteDocumentVersionInput,
  DocumentCommentRecord,
  DocumentMutationResult,
  DocumentPresenceRecord,
  ProjectDocumentSnapshot,
  RestoreDocumentVersionInput,
  SaveDocumentInput,
  ToggleCommentReactionInput,
  UploadAttachmentInput,
} from './document.types'

export function projectDocumentQueryOptions(projectViewId: string, initialData?: ProjectDocumentSnapshot | null) {
  return {
    initialData: initialData ?? undefined,
    queryFn: () => documentRepository.getProjectDocumentSnapshot(projectViewId),
    queryKey: ['project-document', projectViewId] as const,
  }
}

export function documentPresenceQueryOptions(documentId: string) {
  return {
    queryFn: () => documentRepository.getDocumentPresence(documentId),
    queryKey: ['document-presence', documentId] as const,
  }
}

export function useProjectDocumentQuery(
  projectViewId: string | null,
  initialData?: ProjectDocumentSnapshot | null,
  options?: {enabled?: boolean},
) {
  return useQuery({
    ...projectDocumentQueryOptions(projectViewId ?? 'missing-project-view', initialData),
    enabled: Boolean(projectViewId) && (options?.enabled ?? true),
  })
}

export function useDocumentPresenceQuery(documentId: string | null) {
  return useQuery({
    ...documentPresenceQueryOptions(documentId ?? 'missing-document'),
    enabled: Boolean(documentId),
  })
}

function sortPresenceEntries(entries: DocumentPresenceRecord[]) {
  return [...entries].sort((left, right) => {
    const timeDifference = new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()

    if (timeDifference !== 0) {
      return timeDifference
    }

    return left.userId.localeCompare(right.userId)
  })
}

function updateDocumentPresenceCache(
  queryClient: QueryClient,
  documentId: string,
  updater: (current: DocumentPresenceRecord[] | undefined) => DocumentPresenceRecord[] | undefined,
) {
  queryClient.setQueryData(documentPresenceQueryOptions(documentId).queryKey, updater)
}

function upsertPresenceEntry(
  current: DocumentPresenceRecord[] | undefined,
  entry: DocumentPresenceRecord,
) {
  return sortPresenceEntries([
    entry,
    ...(current ?? []).filter((existing) => existing.userId !== entry.userId),
  ])
}

function updateDocumentSnapshotCache(
  queryClient: QueryClient,
  projectViewId: string,
  updater: (current: ProjectDocumentSnapshot | undefined) => ProjectDocumentSnapshot | undefined,
) {
  queryClient.setQueryData(projectDocumentQueryOptions(projectViewId).queryKey, updater)
}

async function invalidateProjectSearchCache(queryClient: QueryClient, projectId: string) {
  await queryClient.invalidateQueries({queryKey: ['project-search', projectId]})
}

async function invalidateWorkspaceSearchCache(queryClient: QueryClient) {
  await queryClient.invalidateQueries({queryKey: ['workspace-search']})
}

function applyDocumentMutation(
  current: ProjectDocumentSnapshot | undefined,
  result: DocumentMutationResult,
): ProjectDocumentSnapshot | undefined {
  if (!current) {
    return current
  }

  return {
    ...current,
    document: result.document,
    versions: [result.versionEntry, ...current.versions.filter((entry) => entry.id !== result.versionEntry.id)],
  }
}

function appendComment(
  current: ProjectDocumentSnapshot | undefined,
  comment: DocumentCommentRecord,
): ProjectDocumentSnapshot | undefined {
  if (!current) {
    return current
  }

  // Reply — nest under parent comment
  if (comment.parentCommentId) {
    return {
      ...current,
      comments: current.comments.map((c) =>
        c.id === comment.parentCommentId
          ? {...c, replies: [...c.replies, comment]}
          : c,
      ),
    }
  }

  // Top-level comment — prepend (newest first)
  return {
    ...current,
    comments: [comment, ...current.comments],
  }
}

function updateCommentReactions(
  current: ProjectDocumentSnapshot | undefined,
  commentId: string,
  reactions: Record<string, string[]>,
): ProjectDocumentSnapshot | undefined {
  if (!current) {
    return current
  }

  return {
    ...current,
    comments: current.comments.map((c) => {
      if (c.id === commentId) {
        return {...c, reactions}
      }
      // Check replies
      if (c.replies.some((r) => r.id === commentId)) {
        return {
          ...c,
          replies: c.replies.map((r) =>
            r.id === commentId ? {...r, reactions} : r,
          ),
        }
      }
      return c
    }),
  }
}

function prependAttachment(
  current: ProjectDocumentSnapshot | undefined,
  attachment: AttachmentRecord,
): ProjectDocumentSnapshot | undefined {
  if (!current) {
    return current
  }

  return {
    ...current,
    attachments: [attachment, ...current.attachments.filter((entry) => entry.id !== attachment.id)],
  }
}

export function useSaveDocumentMutation(projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveDocumentInput) => documentRepository.saveDocument(input),
    onSuccess: async (result) => {
      const applyMutation = (current: ProjectDocumentSnapshot | undefined) => applyDocumentMutation(current, result)
      updateDocumentSnapshotCache(queryClient, projectViewId, applyMutation)
      await Promise.all([
        invalidateProjectSearchCache(queryClient, projectId),
        invalidateWorkspaceSearchCache(queryClient),
      ])
    },
  })
}

export function useRestoreDocumentVersionMutation(projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RestoreDocumentVersionInput) => documentRepository.restoreDocumentVersion(input),
    onSuccess: async (result) => {
      const applyMutation = (current: ProjectDocumentSnapshot | undefined) => applyDocumentMutation(current, result)
      updateDocumentSnapshotCache(queryClient, projectViewId, applyMutation)
      await Promise.all([
        queryClient.invalidateQueries({queryKey: documentPresenceQueryOptions(result.document.id).queryKey}),
        invalidateProjectSearchCache(queryClient, projectId),
        invalidateWorkspaceSearchCache(queryClient),
      ])
    },
  })
}

export function useDeleteDocumentVersionMutation(_projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeleteDocumentVersionInput) => documentRepository.deleteDocumentVersion(input),
    onSuccess: (_result, input) => {
      updateDocumentSnapshotCache(queryClient, projectViewId, (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          versions: current.versions.filter((entry) => entry.id !== input.versionId),
        }
      })
    },
  })
}

export function useAddDocumentCommentMutation(projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AddDocumentCommentInput) => documentRepository.addComment(input),
    onSuccess: async (comment) => {
      const appendNextComment = (current: ProjectDocumentSnapshot | undefined) => appendComment(current, comment)
      updateDocumentSnapshotCache(queryClient, projectViewId, appendNextComment)
      await Promise.all([
        invalidateProjectSearchCache(queryClient, projectId),
        invalidateWorkspaceSearchCache(queryClient),
      ])
    },
  })
}

export function useToggleCommentReactionMutation(projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ToggleCommentReactionInput) => documentRepository.toggleCommentReaction(input),
    onSuccess: (reactions, input) => {
      updateDocumentSnapshotCache(queryClient, projectViewId, (current) =>
        updateCommentReactions(current, input.commentId, reactions),
      )
    },
  })
}

export function useUploadAttachmentMutation(_projectId: string, projectViewId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UploadAttachmentInput) => documentRepository.uploadAttachment(input),
    onSuccess: async (attachment) => {
      const prependNextAttachment = (current: ProjectDocumentSnapshot | undefined) => prependAttachment(current, attachment)
      updateDocumentSnapshotCache(queryClient, projectViewId, prependNextAttachment)
    },
  })
}

export function useDocumentPresenceHeartbeatMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({documentId, state}: {documentId: string; state?: string}) =>
      documentRepository.updatePresence(documentId, state),
    onSuccess: (presence, input) => {
      updateDocumentPresenceCache(queryClient, input.documentId, (current) => upsertPresenceEntry(current, presence))
    },
  })
}

export function patchKnownDocumentPresence(
  queryClient: QueryClient,
  documentId: string,
  patch: Pick<DocumentPresenceRecord, 'lastSeenAt' | 'state' | 'userId'>,
) {
  let didPatch = false

  updateDocumentPresenceCache(queryClient, documentId, (current) => {
    if (!current) {
      return current
    }

    const existing = current.find((entry) => entry.userId === patch.userId)

    if (!existing) {
      return current
    }

    didPatch = true

    return sortPresenceEntries(
      current.map((entry) =>
        entry.userId === patch.userId
          ? {
              ...entry,
              lastSeenAt: patch.lastSeenAt,
              state: patch.state,
            }
          : entry,
      ),
    )
  })

  return didPatch
}

export function removeKnownDocumentPresence(
  queryClient: QueryClient,
  documentId: string,
  userId: string,
) {
  let didRemove = false

  updateDocumentPresenceCache(queryClient, documentId, (current) => {
    if (!current || !current.some((entry) => entry.userId === userId)) {
      return current
    }

    didRemove = true
    return current.filter((entry) => entry.userId !== userId)
  })

  return didRemove
}

export type {DocumentRepository}
