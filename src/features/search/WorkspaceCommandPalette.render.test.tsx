/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "../projects/project-shell.types";
import {
  WorkspaceCommandPalette,
  type WorkspacePaletteCommand,
} from "./WorkspaceCommandPalette";

const workspaceSearchQueryState: {
  data: { cards: unknown[]; documents: unknown[] } | undefined;
  error: Error | null;
  isFetching: boolean;
} = {
  data: { cards: [], documents: [] },
  error: null,
  isFetching: false,
};

vi.mock("./workspace-search.queries", () => ({
  useWorkspaceSearchQuery: () => workspaceSearchQueryState,
}));

vi.mock("./my-notes-search.queries", () => ({
  useMyNotesSearchQuery: () => ({ data: { notes: [] }, error: null, isFetching: false }),
}));

vi.mock("../wiki/wiki.queries", () => ({
  useSearchWikiPagesQuery: () => ({ data: [], error: null, isFetching: false }),
}));

function makeProject(
  overrides: Partial<WorkspaceProjectSummary> = {},
): WorkspaceProjectSummary {
  return {
    access: "open",
    builtinFieldLabels: {},
    builtinOptionLabels: {},
    defaultProjectViewId: "view-table",
    icon: "P",
    id: "project-1",
    lastUpdatedLabel: "now",
    memberCount: 2,
    name: "Product Team",
    priorityOptions: [],
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
    slug: "product-team",
    statusOptions: [],
    taskCount: 4,
    ...overrides,
  };
}

function makeWorkspace(
  overrides: Partial<WorkspaceSummary> = {},
): WorkspaceSummary {
  return {
    canManageWorkspace: true,
    colorToken: "slate",
    defaultProjectSlug: "product-team",
    icon: "R",
    id: "workspace-1",
    name: "Rocketboard",
    organizationId: "org-1",
    organizationName: "Rocketboard",
    organizationSlug: "rocketboard-org",
    projects: [makeProject()],
    slug: "rocketboard",
    timezone: "America/Los_Angeles",
    ...overrides,
  };
}

function renderPalette({
  activeViewId,
  commands = [],
  currentProject,
}: {
  activeViewId?: string;
  commands?: WorkspacePaletteCommand[];
  currentProject?: WorkspaceProjectSummary | null;
} = {}) {
  const workspace = makeWorkspace();

  return render(
    <WorkspaceCommandPalette
      activeViewId={activeViewId}
      commands={commands}
      currentProject={currentProject}
      currentWorkspace={workspace}
      isOpen
      onClose={vi.fn()}
      onOpenProject={vi.fn(() => true)}
      onOpenSearchCard={vi.fn(() => true)}
      onOpenSearchDocument={vi.fn(() => true)}
      onOpenWorkspace={vi.fn(() => true)}
      workspaces={[workspace]}
    />,
  );
}

afterEach(() => {
  cleanup();
  workspaceSearchQueryState.data = { cards: [], documents: [] };
  workspaceSearchQueryState.error = null;
  workspaceSearchQueryState.isFetching = false;
});

describe("WorkspaceCommandPalette rendering", () => {
  it("omits current-project boards in workspace-only contexts", () => {
    renderPalette();

    expect(
      screen.queryByText("Current Project Boards"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/for commands/)).not.toBeInTheDocument();
  });

  it("shows current-project boards when a project context exists", () => {
    renderPalette({
      activeViewId: "view-table",
      currentProject: makeProject(),
    });

    expect(screen.getByText("Current Project Boards")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it("shows the empty command-mode message when no commands exist", async () => {
    const user = userEvent.setup();

    renderPalette();

    await user.type(screen.getByRole("textbox"), ">");

    await waitFor(() => {
      expect(
        screen.getByText("No commands available in this context."),
      ).toBeInTheDocument();
    });
  });

  it("shows the command helper only when commands are configured", () => {
    renderPalette({
      commands: [
        {
          description: "Create a new task.",
          icon: Plus,
          id: "create-task",
          keywords: ["task"],
          label: "Create task",
          onSelect: vi.fn(() => true),
        },
      ],
    });

    expect(screen.getByText(/for commands/)).toBeInTheDocument();
  });
});
