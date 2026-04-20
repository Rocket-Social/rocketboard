/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = {
  canManageWorkspace: true,
  colorToken: "slate",
  defaultProjectSlug: "growth",
  icon: "R",
  id: "ws-1",
  name: "Rocketboard",
  organizationId: "org-1",
  organizationName: "Rocketboard Inc.",
  organizationSlug: "rocketboard",
  projects: [
    {
      access: "open" as const,
      builtinOptionLabels: {},
      builtinFieldLabels: {},
      defaultProjectViewId: "view-1",
      id: "proj-1",
      icon: "P",
      lastUpdatedLabel: "",
      memberCount: 1,
      name: "Growth",
      projectViews: [{ id: "view-1", name: "Board", viewType: "kanban" }],
      slug: "growth",
      priorityOptions: [],
      statusOptions: [],
      taskCount: 0,
    },
  ],
  slug: "rocketboard",
  timezone: "America/Los_Angeles",
};

let mockParams: Record<string, string | undefined> = {};
const { useWikiOrgPagesQueryMock } = vi.hoisted(() => ({
  useWikiOrgPagesQueryMock: vi.fn(() => ({ data: [], isSuccess: true })),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: () => ({ data: undefined }),
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => mockParams,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; href: string } }) => unknown }) =>
    select({ location: { pathname: "/org/rocketboard/workspaces/rocketboard", href: "https://rocketboard.local/" } }),
}));

vi.mock("./SignedInAppFrame", () => ({
  useSignedInAppFrame: () => ({
    currentUser: { id: "user-1" },
    workspaces: [WORKSPACE],
  }),
}));

vi.mock("../wiki/wiki.queries", () => ({
  useWikiOrgPagesQuery: useWikiOrgPagesQueryMock,
  useWikiPinnedPagesWithMetadataQuery: () => ({ data: [] }),
}));

vi.mock("../wiki/wiki.preload", () => ({
  resolveWikiPageIdFromPath: () => null,
}));

vi.mock("../org-settings/org-route.queries", () => ({
  organizationRouteContextQueryOptions: () => ({ queryKey: ["org-context"], queryFn: () => null }),
}));

vi.mock("../initiatives/initiative.queries", () => ({
  workspaceInitiativesQueryOptions: () => ({ queryKey: ["initiatives"], queryFn: () => [] }),
}));

vi.mock("../plans/plan.queries", () => ({
  workspacePlansQueryOptions: () => ({ queryKey: ["plans"], queryFn: () => [] }),
}));

import { useSidebarData } from "./useSidebarData";

describe("useSidebarData activeSidebarItemId resolution", () => {
  beforeEach(() => {
    useWikiOrgPagesQueryMock.mockClear();
  });

  it("loads wiki pages for the current workspace org so sidebar state can filter stale links", () => {
    mockParams = { orgSlug: "rocketboard" };
    renderHook(() => useSidebarData(WORKSPACE as any));
    expect(useWikiOrgPagesQueryMock).toHaveBeenCalledWith("org-1");
  });

  it("resolves projectSlug to project:id when slug matches a workspace project", () => {
    mockParams = { orgSlug: "rocketboard", projectSlug: "growth" };
    const { result } = renderHook(() => useSidebarData(WORKSPACE as any));
    expect(result.current.activeSidebarItemId).toBe("project:proj-1");
  });

  it("resolves planId to plan:id", () => {
    mockParams = { orgSlug: "rocketboard", planId: "plan-42" };
    const { result } = renderHook(() => useSidebarData(WORKSPACE as any));
    expect(result.current.activeSidebarItemId).toBe("plan:plan-42");
  });

  it("resolves initiativeId to initiative:id", () => {
    mockParams = { orgSlug: "rocketboard", initiativeId: "init-7" };
    const { result } = renderHook(() => useSidebarData(WORKSPACE as any));
    expect(result.current.activeSidebarItemId).toBe("initiative:init-7");
  });

  it("returns null when no relevant route params are present", () => {
    mockParams = { orgSlug: "rocketboard" };
    const { result } = renderHook(() => useSidebarData(WORKSPACE as any));
    expect(result.current.activeSidebarItemId).toBeNull();
  });

  it("returns null when projectSlug does not match any workspace project", () => {
    mockParams = { orgSlug: "rocketboard", projectSlug: "nonexistent" };
    const { result } = renderHook(() => useSidebarData(WORKSPACE as any));
    expect(result.current.activeSidebarItemId).toBeNull();
  });
});
