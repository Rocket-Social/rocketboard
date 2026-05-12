import { describe, expect, it } from "vitest";

import {
  getProjectRoute,
  getWorkspaceRoute,
  isProjectRouteTarget,
  resolveProjectRouteTarget,
} from "./project-shell.routes";
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "./project-shell.types";

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
        id: "view-overview",
        isDefault: false,
        isHidden: false,
        name: "Overview",
        position: 0,
        viewType: "overview",
      },
      {
        id: "view-table",
        isDefault: true,
        isHidden: false,
        name: "Table",
        position: 1,
        viewType: "table",
      },
      {
        id: "view-kanban",
        isDefault: false,
        isHidden: true,
        name: "Kanban",
        position: 2,
        viewType: "kanban",
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
  projects: WorkspaceProjectSummary[],
  overrides: Partial<WorkspaceSummary> = {},
): WorkspaceSummary {
  return {
    canManageWorkspace: false,
    colorToken: "slate",
    defaultProjectSlug: projects[0]?.slug ?? "project",
    icon: "W",
    id: "workspace-1",
    name: "Workspace",
    organizationId: "org-1",
    organizationName: "Test Org",
    organizationSlug: "test-org",
    projects,
    slug: "workspace",
    timezone: null,
    ...overrides,
  };
}

describe("project shell routes", () => {
  it("falls back to a visible view when the preferred type only exists as hidden", () => {
    const workspaces = [
      makeWorkspace(
        [
          makeProject({
            slug: "product-team-work",
          }),
        ],
        {
          slug: "main-workspace",
        },
      ),
    ];

    expect(getWorkspaceRoute(workspaces, "test-org", "main-workspace", "kanban")).toEqual({
      orgSlug: "test-org",
      projectSlug: "product-team-work",
      viewId: "view-table",
      viewType: "table",
      workspaceSlug: "main-workspace",
    });
  });

  it("preserves the preferred type when a visible matching view exists", () => {
    const workspaces = [
      makeWorkspace(
        [
          makeProject({
            projectViews: [
              {
                id: "view-overview",
                isDefault: false,
                isHidden: false,
                name: "Overview",
                position: 0,
                viewType: "overview",
              },
              {
                id: "view-table",
                isDefault: true,
                isHidden: false,
                name: "Table",
                position: 1,
                viewType: "table",
              },
              {
                id: "view-kanban",
                isDefault: false,
                isHidden: false,
                name: "Kanban",
                position: 2,
                viewType: "kanban",
              },
            ],
            slug: "product-team-work",
          }),
        ],
        {
          slug: "main-workspace",
        },
      ),
    ];

    expect(
      getProjectRoute(
        workspaces,
        "test-org",
        "main-workspace",
        "product-team-work",
        "kanban",
      ),
    ).toEqual({
      orgSlug: "test-org",
      projectSlug: "product-team-work",
      viewId: "view-kanban",
      viewType: "kanban",
      workspaceSlug: "main-workspace",
    });
  });

  it("uses the workspace default project slug before falling back to the first project", () => {
    const workspaces = [
      makeWorkspace(
        [
          makeProject({
            defaultProjectViewId: "view-table",
            id: "project-1",
            name: "Alpha",
            slug: "alpha",
          }),
          makeProject({
            defaultProjectViewId: "view-kanban",
            id: "project-2",
            name: "Gamma",
            projectViews: [
              {
                id: "view-overview",
                isDefault: false,
                isHidden: false,
                name: "Overview",
                position: 0,
                viewType: "overview",
              },
              {
                id: "view-table",
                isDefault: false,
                isHidden: false,
                name: "Table",
                position: 1,
                viewType: "table",
              },
              {
                id: "view-kanban",
                isDefault: true,
                isHidden: false,
                name: "Kanban",
                position: 2,
                viewType: "kanban",
              },
            ],
            slug: "gamma",
          }),
        ],
        {
          defaultProjectSlug: "gamma",
          slug: "main-workspace",
        },
      ),
    ];

    expect(getWorkspaceRoute(workspaces, "test-org", "main-workspace")).toEqual({
      orgSlug: "test-org",
      projectSlug: "gamma",
      viewId: "view-kanban",
      viewType: "kanban",
      workspaceSlug: "main-workspace",
    });
  });

  it("rejects raw route targets with missing segments instead of stringifying undefined", () => {
    expect(
      isProjectRouteTarget({
        orgSlug: "test-org",
        projectSlug: undefined,
        viewId: "view-table",
        workspaceSlug: "workspace",
      }),
    ).toBe(false);

    expect(
      isProjectRouteTarget({
        orgSlug: "undefined",
        projectSlug: "undefined",
        viewId: "view-table",
        workspaceSlug: "workspace",
      }),
    ).toBe(false);
  });

  it("resolves a raw project route target to a full view route", () => {
    const workspaces = [
      makeWorkspace(
        [
          makeProject({
            slug: "product-team-work",
          }),
        ],
        {
          slug: "main-workspace",
        },
      ),
    ];

    expect(
      resolveProjectRouteTarget(workspaces, {
        orgSlug: "test-org",
        projectSlug: "product-team-work",
        viewId: "view-table",
        workspaceSlug: "main-workspace",
      }),
    ).toEqual({
      orgSlug: "test-org",
      projectSlug: "product-team-work",
      viewId: "view-table",
      viewType: "table",
      workspaceSlug: "main-workspace",
    });
  });
});
