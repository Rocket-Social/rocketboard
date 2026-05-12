/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "../projects/project-shell.types";
import { consumeWorkspaceCommandOpenCardIntent } from "./workspace-command-intent";
import { createWorkspacePaletteNavigator } from "./workspace-palette-navigation";

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

describe("createWorkspacePaletteNavigator", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("opens same-project cards inline without storing intent", () => {
    const openCurrentCard = vi.fn(() => true);
    const navigateToRoute = vi.fn(() => true);
    const navigator = createWorkspacePaletteNavigator({
      currentOrgSlug: "rocketboard-org",
      currentProjectSlug: "product-team",
      currentWorkspaceSlug: "rocketboard",
      navigateToRoute,
      openCurrentCard,
      workspaces: [makeWorkspace()],
    });

    navigator.openSearchCard({
      cardId: "card-1",
      cardRef: "PROJ-1",
      priorityOptionId: null,
      projectId: "project-1",
      projectName: "Product Team",
      projectSlug: "product-team",
      rank: 1,
      snippet: "Fix the bug",
      statusOptionId: null,
      title: "Fix search",
      orgSlug: "rocketboard-org",
      workspaceId: "workspace-1",
      workspaceName: "Rocketboard",
      workspaceSlug: "rocketboard",
    });

    expect(openCurrentCard).toHaveBeenCalledWith("card-1");
    expect(navigateToRoute).not.toHaveBeenCalled();
    expect(
      consumeWorkspaceCommandOpenCardIntent({
        orgSlug: "rocketboard-org",
        projectSlug: "product-team",
        workspaceSlug: "rocketboard",
      }),
    ).toBeNull();
  });

  it("stores a card intent and navigates when the hit belongs to another route", () => {
    const navigateToRoute = vi.fn(() => true);
    const navigator = createWorkspacePaletteNavigator({
      currentOrgSlug: "rocketboard-org",
      currentWorkspaceSlug: "rocketboard",
      navigateToRoute,
      workspaces: [
        makeWorkspace({
          projects: [
            makeProject(),
            makeProject({
              defaultProjectViewId: "view-board",
              id: "project-2",
              projectViews: [
                {
                  id: "view-board",
                  isDefault: true,
                  isHidden: false,
                  name: "Board",
                  position: 0,
                  viewType: "kanban",
                },
              ],
              slug: "operations",
            }),
          ],
        }),
      ],
    });

    navigator.openSearchCard({
      cardId: "card-2",
      cardRef: "OPS-2",
      priorityOptionId: null,
      projectId: "project-2",
      projectName: "Operations",
      projectSlug: "operations",
      rank: 1,
      snippet: "Fix the bug",
      statusOptionId: null,
      title: "Fix search",
      orgSlug: "rocketboard-org",
      workspaceId: "workspace-1",
      workspaceName: "Rocketboard",
      workspaceSlug: "rocketboard",
    });

    expect(navigateToRoute).toHaveBeenCalledWith({
      orgSlug: "rocketboard-org",
      projectSlug: "operations",
      viewId: "view-board",
      viewType: "kanban",
      workspaceSlug: "rocketboard",
    });
    expect(
      consumeWorkspaceCommandOpenCardIntent({
        orgSlug: "rocketboard-org",
        projectSlug: "operations",
        workspaceSlug: "rocketboard",
      }),
    ).toMatchObject({
      cardId: "card-2",
      orgSlug: "rocketboard-org",
      projectSlug: "operations",
      workspaceSlug: "rocketboard",
    });
  });

  it("navigates document hits to their owning project view", () => {
    const navigateToRoute = vi.fn(() => true);
    const navigator = createWorkspacePaletteNavigator({
      currentOrgSlug: "rocketboard-org",
      currentWorkspaceSlug: "rocketboard",
      navigateToRoute,
      workspaces: [makeWorkspace()],
    });

    navigator.openSearchDocument({
      documentId: "doc-1",
      projectId: "project-1",
      projectName: "Product Team",
      projectSlug: "product-team",
      projectViewId: "view-table",
      rank: 1,
      snippet: "Search docs",
      source: "document",
      title: "Docs",
      orgSlug: "rocketboard-org",
      workspaceId: "workspace-1",
      workspaceName: "Rocketboard",
      workspaceSlug: "rocketboard",
    });

    expect(navigateToRoute).toHaveBeenCalledWith({
      orgSlug: "rocketboard-org",
      projectSlug: "product-team",
      viewId: "view-table",
      viewType: "table",
      workspaceSlug: "rocketboard",
    });
  });
});
