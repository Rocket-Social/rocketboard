import type {QueryClient} from '@tanstack/react-query'

import {noteFoldersQueryOptions, noteQueryOptions, notesQueryOptions} from './note.queries'
import {
  buildMyNotesFallbackSnapshot,
  type MyNotesStartupSnapshot,
  warmMyNotesStartupSnapshot,
} from './my-notes.startup'
import {buildMyNotesSearch, myNotesRoutePath} from './notes.routes'
import {resolveActiveNoteId, type NoteListItem, type NoteRecord} from './note.types'

type MyNotesRouter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preloadRoute: (location: any) => Promise<unknown>
}

type WarmMyNotesNavigationArgs = {
  queryClient: QueryClient
  requestedNoteId?: string | null
  router: MyNotesRouter
  userId: string
  workspaceSlug?: string | null
}

function getCachedNotes(queryClient: QueryClient, userId: string) {
  return queryClient.getQueryData<NoteListItem[]>(notesQueryOptions(userId).queryKey)
}

export function getCachedMyNotesInitialNoteId(
  queryClient: QueryClient,
  userId: string,
  requestedNoteId?: string | null,
) {
  const notes = getCachedNotes(queryClient, userId)

  if (!notes) {
    return null
  }

  return resolveActiveNoteId(notes, null, requestedNoteId)
}

export function prefetchCachedMyNotesInitialNote(
  queryClient: QueryClient,
  userId: string,
  requestedNoteId?: string | null,
) {
  const initialNoteId = getCachedMyNotesInitialNoteId(queryClient, userId, requestedNoteId)

  if (initialNoteId) {
    void queryClient.prefetchQuery(noteQueryOptions(initialNoteId))
  }

  return initialNoteId
}

async function buildLegacyMyNotesStartupSnapshot(
  queryClient: QueryClient,
  userId: string,
  requestedNoteId?: string | null,
): Promise<MyNotesStartupSnapshot> {
  const [notes, folders] = await Promise.all([
    queryClient.ensureQueryData(notesQueryOptions(userId)),
    queryClient.ensureQueryData(noteFoldersQueryOptions(userId)),
  ])

  const resolvedNoteId = prefetchCachedMyNotesInitialNote(
    queryClient,
    userId,
    requestedNoteId,
  )

  const initialNote = resolvedNoteId
    ? ((await queryClient.ensureQueryData(noteQueryOptions(resolvedNoteId))) as NoteRecord | null)
    : null

  return buildMyNotesFallbackSnapshot(
    folders ?? [],
    notes ?? [],
    initialNote,
    resolvedNoteId,
  )
}

export async function warmMyNotesRouteData({
  queryClient,
  requestedNoteId,
  userId,
}: Omit<WarmMyNotesNavigationArgs, "router" | "workspaceSlug">) {
  const snapshot =
    (await warmMyNotesStartupSnapshot(queryClient, userId, requestedNoteId))
    ?? (await buildLegacyMyNotesStartupSnapshot(queryClient, userId, requestedNoteId))

  return {
    resolvedNoteId: snapshot.resolvedNoteId,
    source: snapshot.initialNote || snapshot.notes.length > 0 ? "ready" : "empty",
  } as const
}

export function warmMyNotesNavigation({
  router,
  workspaceSlug,
  requestedNoteId,
}: WarmMyNotesNavigationArgs) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void router.preloadRoute({search: buildMyNotesSearch(workspaceSlug, requestedNoteId), to: myNotesRoutePath} as any).catch(() => {})
}
