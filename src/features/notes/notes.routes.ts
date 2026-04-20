import type { WorkspaceSummary } from "../projects/project-shell.types";

export const myNotesRoutePath = "/my-notes" as const;

export type MyNotesRouteSearch = {
  noteId?: string;
  workspaceSlug?: string;
};

function readSearchString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

export function buildMyNotesSearch(
  workspaceSlug?: string | null,
  noteId?: string | null,
): MyNotesRouteSearch {
  const normalizedWorkspaceSlug = workspaceSlug?.trim();
  const normalizedNoteId = noteId?.trim();

  return {
    ...(normalizedNoteId ? { noteId: normalizedNoteId } : {}),
    ...(normalizedWorkspaceSlug ? { workspaceSlug: normalizedWorkspaceSlug } : {}),
  };
}

export function validateMyNotesSearch(
  search: Record<string, unknown>,
): MyNotesRouteSearch {
  return buildMyNotesSearch(
    readSearchString(search.workspaceSlug),
    readSearchString(search.noteId),
  );
}

export function resolveMyNotesWorkspace(
  workspaces: WorkspaceSummary[] | undefined,
  workspaceSlug?: string,
): WorkspaceSummary | undefined {
  if (!workspaces?.length) {
    return undefined;
  }

  return (
    workspaces.find((workspace) => workspace.slug === workspaceSlug) ??
    workspaces[0]
  );
}
