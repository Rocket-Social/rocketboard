import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcCallMock } = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
}));

vi.mock("../../platform/data/rpc-adapter", () => ({
  rpcAdapter: {
    call: rpcCallMock,
  },
}));

import { projectShellRepository } from "./project-shell.repository";

describe("projectShellRepository.listWorkspaces", () => {
  beforeEach(() => {
    rpcCallMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T05:10:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires the v2 shell RPC and rethrows missing-function errors", async () => {
    const missingFunctionError = {
      code: "PGRST202",
      message:
        "Could not find the function public.get_shell_summary_rows_v2 without parameters in the schema cache",
    };

    rpcCallMock.mockRejectedValueOnce(missingFunctionError);

    await expect(projectShellRepository.listWorkspaces()).rejects.toEqual(
      missingFunctionError,
    );
    expect(rpcCallMock).toHaveBeenCalledTimes(1);
    expect(rpcCallMock).toHaveBeenCalledWith("get_shell_summary_rows_v2");
  });

  it("rethrows non-schema-cache failures from the shell RPC", async () => {
    rpcCallMock.mockRejectedValueOnce(new Error("network down"));

    await expect(projectShellRepository.listWorkspaces()).rejects.toThrow(
      "network down",
    );
    expect(rpcCallMock).toHaveBeenCalledTimes(1);
    expect(rpcCallMock).toHaveBeenCalledWith("get_shell_summary_rows_v2");
  });

  it("preserves the shell summary project order and uses the first returned project as the default slug", async () => {
    rpcCallMock.mockResolvedValueOnce([
      {
        default_project_view_id: "view-2",
        member_count: 2,
        project_access: "open",
        project_builtin_field_labels: null,
        project_created_at: "2026-04-01T00:00:00.000Z",
        project_icon: "B",
        project_id: "project-2",
        project_name: "Beta",
        project_position: 1,
        project_slug: "beta",
        project_updated_at: "2026-04-05T05:09:00.000Z",
        project_views: [],
        task_count: 2,
        workspace_can_manage: true,
        workspace_color_token: "slate",
        workspace_icon: "A",
        workspace_id: "workspace-1",
        workspace_name: "Acme",
        workspace_organization_id: "org-1",
        workspace_organization_name: "Acme Org",
        workspace_organization_slug: "acme-org",
        workspace_slug: "acme",
        workspace_timezone: "America/Los_Angeles",
      },
      {
        default_project_view_id: "view-1",
        member_count: 1,
        project_access: "open",
        project_builtin_field_labels: null,
        project_created_at: "2026-04-02T00:00:00.000Z",
        project_icon: "A",
        project_id: "project-1",
        project_name: "Alpha",
        project_position: 0,
        project_slug: "alpha",
        project_updated_at: "2026-04-05T05:08:00.000Z",
        project_views: [],
        task_count: 1,
        workspace_can_manage: true,
        workspace_color_token: "slate",
        workspace_icon: "A",
        workspace_id: "workspace-1",
        workspace_name: "Acme",
        workspace_organization_id: "org-1",
        workspace_organization_name: "Acme Org",
        workspace_organization_slug: "acme-org",
        workspace_slug: "acme",
        workspace_timezone: "America/Los_Angeles",
      },
    ]);

    const [workspace] = await projectShellRepository.listWorkspaces();

    expect(workspace.defaultProjectSlug).toBe("beta");
    expect(workspace.organizationSlug).toBe("acme-org");
    expect(workspace.projects.map((project) => project.slug)).toEqual([
      "beta",
      "alpha",
    ]);
  });
});

describe("projectShellRepository.getProjectSprints", () => {
  beforeEach(() => {
    rpcCallMock.mockReset();
  });

  it("rethrows sprint RPC failures instead of pretending the project has no sprints", async () => {
    rpcCallMock.mockRejectedValueOnce(new Error("auth lock timed out"));

    await expect(projectShellRepository.getProjectSprints("project-1")).rejects.toThrow(
      "auth lock timed out",
    );
    expect(rpcCallMock).toHaveBeenCalledWith("get_project_sprints", {
      target_project_id: "project-1",
    });
  });

  it("maps sprint rows from the RPC payload", async () => {
    rpcCallMock.mockResolvedValueOnce([
      {
        completed_at: "2026-04-19T16:00:00.000Z",
        created_at: "2026-04-05T12:00:00.000Z",
        end_date: "2026-04-19",
        goal: "Finish cleanup",
        id: "sprint-1",
        name: "Sprint 7",
        position: 7,
        project_id: "project-1",
        start_date: "2026-04-13",
        status: "completed",
        updated_at: "2026-04-19T16:00:00.000Z",
      },
    ]);

    await expect(projectShellRepository.getProjectSprints("project-1")).resolves.toEqual([
      {
        completedAt: "2026-04-19T16:00:00.000Z",
        createdAt: "2026-04-05T12:00:00.000Z",
        endDate: "2026-04-19",
        goal: "Finish cleanup",
        id: "sprint-1",
        name: "Sprint 7",
        position: 7,
        projectId: "project-1",
        startDate: "2026-04-13",
        status: "completed",
        updatedAt: "2026-04-19T16:00:00.000Z",
      },
    ]);
    expect(rpcCallMock).toHaveBeenCalledWith("get_project_sprints", {
      target_project_id: "project-1",
    });
  });
});
