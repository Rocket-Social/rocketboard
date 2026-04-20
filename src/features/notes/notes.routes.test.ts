import { describe, expect, it } from "vitest";

import {
  buildMyNotesSearch,
  resolveMyNotesWorkspace,
  validateMyNotesSearch,
} from "./notes.routes";
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "../projects/project-shell.types";

function makeProject(
  overrides: Partial<WorkspaceProjectSummary> = {},
): WorkspaceProjectSummary {
  return {
    access: "open",
    builtinOptionLabels: {},
    builtinFieldLabels: {},
    defaultProjectViewId: "view-table",
    icon: "P",
    id: "project-1",
    lastUpdatedLabel: "1m ago",
    memberCount: 1,
    name: "Project",
    projectViews: [
      {
        id: "view-table",
        isDefault: true,
        isHidden: false,
        name: "Table",
        position: 0,
        viewType: "table",
      },
    ],
    slug: "project",
    priorityOptions: [],
    statusOptions: [],
    taskCount: 3,
    ...overrides,
  };
}

function makeWorkspace(
  overrides: Partial<WorkspaceSummary> = {},
): WorkspaceSummary {
  return {
    canManageWorkspace: false,
    colorToken: "slate",
    defaultProjectSlug: "project",
    icon: "W",
    id: "workspace-1",
    name: "Workspace",
    organizationId: "org-1",
    organizationName: "Test Org",
    organizationSlug: "test-org",
    projects: [makeProject()],
    slug: "workspace",
    timezone: null,
    ...overrides,
  };
}

describe("notes routes", () => {
  it("builds notes search from the current workspace slug", () => {
    expect(buildMyNotesSearch("main-workspace", "note-1")).toEqual({
      noteId: "note-1",
      workspaceSlug: "main-workspace",
    });
    expect(buildMyNotesSearch("")).toEqual({});
    expect(buildMyNotesSearch(null)).toEqual({});
  });

  it("validates the workspace slug and note id search parameters", () => {
    expect(
      validateMyNotesSearch({
        noteId: "note-1",
        workspaceSlug: "main-workspace",
      }),
    ).toEqual({
      noteId: "note-1",
      workspaceSlug: "main-workspace",
    });
    expect(
      validateMyNotesSearch({
        noteId: ["note-1", "note-2"],
        workspaceSlug: ["main-workspace", "realtime-qa"],
      }),
    ).toEqual({
      noteId: "note-1",
      workspaceSlug: "main-workspace",
    });
    expect(validateMyNotesSearch({ workspaceSlug: 123 })).toEqual({});
  });

  it("resolves the notes workspace from search before falling back to the first workspace", () => {
    const workspaces = [
      makeWorkspace({
        id: "workspace-1",
        name: "Realtime QA Workspace",
        slug: "realtime-qa",
      }),
      makeWorkspace({
        id: "workspace-2",
        name: "Main Workspace",
        slug: "main-workspace",
      }),
    ];

    expect(resolveMyNotesWorkspace(workspaces, "main-workspace")?.name).toBe(
      "Main Workspace",
    );
    expect(resolveMyNotesWorkspace(workspaces, "missing-workspace")?.name).toBe(
      "Realtime QA Workspace",
    );
  });
});
