import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  warmMyNotesStartupSnapshot,
} from "./my-notes.startup";
import { noteFoldersQueryOptions, noteQueryOptions, notesQueryOptions } from "./note.queries";

const getStartupSnapshotMock = vi.fn();

vi.mock("./note.repository", () => ({
  noteRepository: {
    getStartupSnapshot: (...args: unknown[]) => getStartupSnapshotMock(...args),
  },
}));

describe("my notes startup snapshot", () => {
  beforeEach(() => {
    getStartupSnapshotMock.mockReset();
  });

  it("hydrates notes, folders, and the initial note from a valid snapshot", async () => {
    getStartupSnapshotMock.mockResolvedValueOnce({
      folders: [
        {
          createdAt: "2026-04-11T00:00:00Z",
          id: "folder-1",
          name: "Notes",
          parentId: null,
          position: 0,
          updatedAt: "2026-04-11T00:00:00Z",
          userId: "user-1",
        },
      ],
      initialNote: {
        contentJson: { type: "doc", content: [] },
        contentMd: "",
        createdAt: "2026-04-11T00:00:00Z",
        deletedAt: null,
        displayTitle: "Weekly Notes",
        folderId: "folder-1",
        id: "note-1",
        position: 0,
        previewText: "",
        sourceConnectionId: null,
        sourceCreatedAt: null,
        sourceDetached: false,
        sourceId: null,
        sourceMetadata: {},
        sourceProvider: null,
        sourceUpdatedAt: null,
        title: "Weekly Notes",
        updatedAt: "2026-04-11T00:00:00Z",
        userId: "user-1",
      },
      notes: [
        {
          createdAt: "2026-04-11T00:00:00Z",
          deletedAt: null,
          displayTitle: "Weekly Notes",
          folderId: "folder-1",
          id: "note-1",
          position: 0,
          previewText: "",
          sourceConnectionId: null,
          sourceCreatedAt: null,
          sourceDetached: false,
          sourceId: null,
          sourceMetadata: {},
          sourceProvider: null,
          sourceUpdatedAt: null,
          title: "Weekly Notes",
          updatedAt: "2026-04-11T00:00:00Z",
          userId: "user-1",
        },
      ],
      resolvedNoteId: "note-1",
    });

    const queryClient = new QueryClient();
    const snapshot = await warmMyNotesStartupSnapshot(
      queryClient,
      "user-1",
      "note-1",
    );

    expect(snapshot?.resolvedNoteId).toBe("note-1");
    expect(queryClient.getQueryData(notesQueryOptions("user-1").queryKey)).toEqual(
      snapshot?.notes,
    );
    expect(
      queryClient.getQueryData(noteFoldersQueryOptions("user-1").queryKey),
    ).toEqual(snapshot?.folders);
    expect(queryClient.getQueryData(noteQueryOptions("note-1").queryKey)).toEqual(
      snapshot?.initialNote,
    );
  });

  it("rejects invalid snapshots without partially hydrating the cache", async () => {
    getStartupSnapshotMock.mockResolvedValueOnce({
      folders: [],
      initialNote: null,
      notes: [],
      resolvedNoteId: "missing-note",
    });

    const queryClient = new QueryClient();
    const snapshot = await warmMyNotesStartupSnapshot(queryClient, "user-1");

    expect(snapshot).toBeNull();
    expect(queryClient.getQueryData(notesQueryOptions("user-1").queryKey)).toBeUndefined();
    expect(
      queryClient.getQueryData(noteFoldersQueryOptions("user-1").queryKey),
    ).toBeUndefined();
  });
});
