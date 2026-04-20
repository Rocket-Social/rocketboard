import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import type { Json } from "../../platform/supabase/database.types";
import { normalizeRichTextDocument, type RichTextDocument } from "../rich-text/rich-text";
import { noteRepository } from "./note.repository";
import {
  noteFoldersQueryOptions,
  noteQueryOptions,
  notesQueryOptions,
} from "./note.queries";
import type {
  NoteFolderRecord,
  NoteListItem,
  NoteRecord,
} from "./note.types";

/*
route loader
   |
   v
single startup snapshot fetch
   |
   +--> valid: hydrate notes/folders/detail query keys
   |
   '--> invalid: skip writes, fall back to legacy queries
*/

const noteSummarySchema = z.object({
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  displayTitle: z.string(),
  folderId: z.string().nullable(),
  id: z.string(),
  position: z.number(),
  previewText: z.string(),
  sourceConnectionId: z.string().nullable(),
  sourceCreatedAt: z.string().nullable(),
  sourceDetached: z.boolean(),
  sourceId: z.string().nullable(),
  sourceMetadata: z.custom<Json>(() => true),
  sourceProvider: z.enum(["granola", "obsidian"]).nullable(),
  sourceUpdatedAt: z.string().nullable(),
  title: z.string(),
  updatedAt: z.string(),
  userId: z.string(),
});

const noteFolderSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  position: z.number(),
  updatedAt: z.string(),
  userId: z.string(),
});

const noteRecordSchema = noteSummarySchema
  .extend({
    contentJson: z.unknown(),
    contentMd: z.string(),
  })
  .transform((value) => ({
    ...value,
    contentJson: normalizeRichTextDocument(
      value.contentJson as RichTextDocument | null | undefined,
      value.contentMd,
    ),
  }) satisfies NoteRecord);

const myNotesStartupSnapshotSchema = z
  .object({
    folders: z.array(noteFolderSchema),
    initialNote: noteRecordSchema.nullable(),
    notes: z.array(noteSummarySchema),
    resolvedNoteId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.resolvedNoteId && !value.notes.some((note) => note.id === value.resolvedNoteId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolvedNoteId must exist in notes",
        path: ["resolvedNoteId"],
      });
    }

    if (value.initialNote && value.resolvedNoteId !== value.initialNote.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "initialNote must match resolvedNoteId",
        path: ["initialNote"],
      });
    }
  });

export type MyNotesStartupSnapshot = z.infer<typeof myNotesStartupSnapshotSchema>;

export function hydrateMyNotesStartupSnapshot(
  queryClient: QueryClient,
  userId: string,
  snapshot: MyNotesStartupSnapshot,
) {
  queryClient.setQueryData(notesQueryOptions(userId).queryKey, snapshot.notes);
  queryClient.setQueryData(noteFoldersQueryOptions(userId).queryKey, snapshot.folders);

  if (snapshot.initialNote) {
    queryClient.setQueryData(
      noteQueryOptions(snapshot.initialNote.id).queryKey,
      snapshot.initialNote,
    );
  }
}

export async function fetchMyNotesStartupSnapshot(
  requestedNoteId?: string | null,
): Promise<MyNotesStartupSnapshot | null> {
  const rawSnapshot = await noteRepository.getStartupSnapshot(requestedNoteId);

  if (!rawSnapshot) {
    return null;
  }

  const parsedSnapshot = myNotesStartupSnapshotSchema.safeParse(rawSnapshot);

  if (!parsedSnapshot.success) {
    return null;
  }

  return parsedSnapshot.data;
}

export async function warmMyNotesStartupSnapshot(
  queryClient: QueryClient,
  userId: string,
  requestedNoteId?: string | null,
) {
  try {
    const snapshot = await fetchMyNotesStartupSnapshot(requestedNoteId);

    if (!snapshot) {
      return null;
    }

    hydrateMyNotesStartupSnapshot(queryClient, userId, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function buildMyNotesFallbackSnapshot(
  folders: NoteFolderRecord[],
  notes: NoteListItem[],
  initialNote: NoteRecord | null,
  resolvedNoteId: string | null,
): MyNotesStartupSnapshot {
  return {
    folders,
    initialNote,
    notes,
    resolvedNoteId,
  };
}
