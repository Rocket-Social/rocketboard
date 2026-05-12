import {queryOptions, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {noteRepository, noteFolderRepository} from './note.repository'
import type {
  CreateFolderInput,
  CreateNoteInput,
  NoteRecord,
  UpdateFolderInput,
  UpdateNoteInput,
} from './note.types'

// ============================================================
// Query keys
// ============================================================

const noteKeys = {
  all: ['notes'] as const,
  list: (userId: string) => ['notes', 'list', userId] as const,
  detail: (noteId: string) => ['notes', 'detail', noteId] as const,
  folders: (userId: string) => ['notes', 'folders', userId] as const,
}

// ============================================================
// Queries
// ============================================================

export function notesQueryOptions(userId: string) {
  return queryOptions({
    queryFn: () => noteRepository.listNotes(userId),
    queryKey: noteKeys.list(userId),
    staleTime: 30_000,
  })
}

export function noteQueryOptions(noteId: string) {
  return queryOptions({
    queryFn: () => noteRepository.getNote(noteId),
    queryKey: noteKeys.detail(noteId),
    staleTime: 30_000,
  })
}

export function noteFoldersQueryOptions(userId: string) {
  return queryOptions({
    queryFn: () => noteFolderRepository.listFolders(userId),
    queryKey: noteKeys.folders(userId),
    staleTime: 5 * 60_000,
  })
}

export function useNotesQuery(userId: string | undefined) {
  return useQuery({
    ...notesQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  })
}

export function useNoteQuery(noteId: string | null) {
  return useQuery({
    ...noteQueryOptions(noteId ?? ''),
    enabled: Boolean(noteId),
  })
}

export function useFoldersQuery(userId: string | undefined) {
  return useQuery({
    ...noteFoldersQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  })
}

// ============================================================
// Note mutations
// ============================================================

export function useCreateNoteMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateNoteInput) => noteRepository.createNote(userId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: noteKeys.list(userId)})
    },
  })
}

export function useUpdateNoteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({noteId, patch}: {noteId: string; patch: UpdateNoteInput}) =>
      noteRepository.updateNote(noteId, patch),
    onSuccess: (updatedNote: NoteRecord) => {
      // Update detail cache metadata but preserve content — the editor owns
      // content while active. Writing the server's (stale) content back would
      // trigger a sync-back setContent() that destroys in-flight keystrokes.
      queryClient.setQueryData(noteKeys.detail(updatedNote.id), (old: NoteRecord | undefined) => {
        if (!old) return updatedNote
        return {...updatedNote, contentJson: old.contentJson}
      })
      // Invalidate list to pick up refreshed summary metadata.
      void queryClient.invalidateQueries({queryKey: noteKeys.list(updatedNote.userId)})
    },
  })
}

export function useDeleteNoteMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (noteId: string) => noteRepository.deleteNote(noteId),
    onSuccess: (_result, noteId) => {
      // Remove from detail cache
      queryClient.removeQueries({queryKey: noteKeys.detail(noteId)})
      // Refresh list
      void queryClient.invalidateQueries({queryKey: noteKeys.list(userId)})
    },
  })
}

export function useDuplicateNoteAsEditableMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (noteId: string) => noteRepository.duplicateNoteAsEditable(userId, noteId),
    onSuccess: (duplicatedNote) => {
      void queryClient.invalidateQueries({queryKey: noteKeys.list(userId)})
      queryClient.setQueryData(noteKeys.detail(duplicatedNote.id), duplicatedNote)
    },
  })
}

// ============================================================
// Folder mutations
// ============================================================

export function useCreateFolderMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateFolderInput) => noteFolderRepository.createFolder(userId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: noteKeys.folders(userId)})
    },
  })
}

export function useUpdateFolderMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({folderId, patch}: {folderId: string; patch: UpdateFolderInput}) =>
      noteFolderRepository.updateFolder(folderId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: noteKeys.folders(userId)})
    },
  })
}

export function useReorderNotesMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: {noteId: string; folderId: string | null; position: number}[]) =>
      noteRepository.reorderNotes(updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: noteKeys.list(userId)})
    },
  })
}

export function useReorderFoldersMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: {folderId: string; position: number}[]) =>
      noteFolderRepository.reorderFolders(updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: noteKeys.folders(userId)})
    },
  })
}

export function useDeleteFolderMutation(userId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (folderId: string) => noteFolderRepository.deleteFolder(folderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: noteKeys.folders(userId)})
      // Notes in deleted folder become unfiled — refresh the list
      void queryClient.invalidateQueries({queryKey: noteKeys.list(userId)})
    },
  })
}

// ============================================================
// Initialize
// ============================================================

export function useInitializeNotesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => noteFolderRepository.initializeDefaults(userId),
    onSuccess: (_result, userId) => {
      void queryClient.invalidateQueries({queryKey: noteKeys.folders(userId)})
      void queryClient.invalidateQueries({queryKey: noteKeys.list(userId)})
    },
  })
}
