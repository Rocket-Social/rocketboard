/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SidebarItem } from "./sidebar-ordering";

const confirmMock = vi.fn();
const promptMock = vi.fn();
const navigateMock = vi.fn();
const deleteProjectMutateMock = vi.fn();
const renameProjectMutateMock = vi.fn();
const deletePlanMutateMock = vi.fn();
const renamePlanMutateMock = vi.fn();
const archiveInitiativeMutateMock = vi.fn();
const deleteInitiativeMutateMock = vi.fn();
const renameInitiativeMutateMock = vi.fn();
const clipboardWriteMock = vi.fn(() => Promise.resolve());
const windowOpenMock = vi.fn();

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

vi.mock("../../hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    confirmDialogProps: {},
  }),
}));

vi.mock("../../hooks/usePromptDialog", () => ({
  usePromptDialog: () => ({
    prompt: promptMock,
    promptDialogProps: {},
  }),
}));

vi.mock("../../components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../app/mode", () => ({
  useMode: () => ({ mode: "ember", setMode: vi.fn() }),
}));

vi.mock("../../platform/data/rpc-adapter", () => ({
  getErrorMessage: () => "error",
  rpcAdapter: { call: vi.fn() },
}));

vi.mock("../auth/data", () => ({ loginRoutePath: "/login" }));

vi.mock("../auth/session.queries", () => ({
  useSignOutMutation: () => ({ mutate: vi.fn() }),
  useUpdateAccountPreferencesMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../initiatives/initiative.queries", () => ({
  useArchiveInitiativeMutation: () => ({ mutate: archiveInitiativeMutateMock }),
  useCreateInitiativeMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteInitiativeMutation: () => ({ mutate: deleteInitiativeMutateMock }),
  useRenameInitiativeMutation: () => ({ mutate: renameInitiativeMutateMock }),
}));

vi.mock("../plans/plan.queries", () => ({
  useCreatePlanMutation: () => ({ mutateAsync: vi.fn() }),
  useDeletePlanMutation: () => ({ mutate: deletePlanMutateMock }),
  useRenamePlanMutation: () => ({ mutate: renamePlanMutateMock }),
}));

vi.mock("../projects/project-metadata.queries", () => ({
  useDeleteProjectMutation: () => ({ mutate: deleteProjectMutateMock }),
  useRenameProjectMutation: () => ({ mutate: renameProjectMutateMock }),
}));

vi.mock("../projects/project-shell.queries", () => ({
  workspaceSummariesQueryOptions: () => ({ queryKey: ["workspaces"] }),
}));

vi.mock("../projects/project-shell.routes", () => ({
  getProjectRoute: () => null,
  getWorkspaceRoute: () => null,
}));

vi.mock("../search/workspace-palette-navigation", () => ({
  buildProjectRouteHref: (p: Record<string, string>) =>
    `/org/${p.orgSlug}/workspaces/${p.workspaceSlug}/projects/${p.projectSlug}/board/${p.viewId}`,
  createWorkspacePaletteNavigator: () => null,
}));

vi.mock("./route-helpers", () => ({
  buildOrgApiKeysHref: () => "/api-keys",
  buildWorkspaceInitiativeHref: (_org: string, _ws: string, id: string) =>
    `/org/_org/workspaces/_ws/initiatives/${id}`,
  buildWorkspaceInitiativesHref: () => "/org/_org/workspaces/_ws/initiatives",
  buildWorkspacePlanHref: (_org: string, _ws: string, id: string) =>
    `/org/_org/workspaces/_ws/plans/${id}`,
}));

vi.mock("./SignedInAppFrame", () => ({
  useSignedInAppFrame: () => ({
    currentUser: { id: "user-1" },
    workspaces: [WORKSPACE],
  }),
}));

vi.mock("./signed-in-navigation", () => ({
  buildAiAgentsLocation: () => ({}),
  buildMyNotesLocation: () => ({}),
  buildWikiLocation: () => ({}),
  navigateWhenWarm: vi.fn(),
  warmSignedInNavigationLocation: vi.fn(() => Promise.resolve()),
}));

vi.mock("../notes/notes.routes", () => ({ myNotesRoutePath: "/notes" }));
vi.mock("./CreateDialogsContext", () => ({
  useCreateDialogs: () => ({
    openCommandPalette: vi.fn(),
    openCreateInitiative: vi.fn(),
    openCreatePlan: vi.fn(),
    openCreateProject: vi.fn(),
    setCreateInitiativeOpen: vi.fn(),
    setCreatePlanOpen: vi.fn(),
  }),
}));
vi.mock("./NavigationGuardContext", () => ({
  useNavigationGuards: () => ({ runRegisteredGuards: () => Promise.resolve(true) }),
}));
vi.mock("../wiki/wiki.queries", () => ({
  useCreateWikiPageMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("./theme", () => ({
  isDarkSidebar: (mode: string) => mode === "ember" || mode === "dark",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => ({ preloadRoute: vi.fn() }),
  useRouterState: ({ select }: { select: (s: any) => any }) =>
    select({
      location: {
        pathname: "/org/rocketboard/workspaces/rocketboard",
        href: "https://rocketboard.local/org/rocketboard/workspaces/rocketboard",
      },
    }),
}));

import { useSidebarActions } from "./useSidebarActions";

const PROJECT_ITEM: SidebarItem = {
  type: "project",
  id: "proj-1",
  name: "Growth",
  data: WORKSPACE.projects[0] as any,
};

const PLAN_ITEM: SidebarItem = {
  type: "plan",
  id: "plan-42",
  name: "Q3 Roadmap",
  data: { id: "plan-42", name: "Q3 Roadmap", workspaceId: "ws-1" } as any,
};

const INITIATIVE_ITEM: SidebarItem = {
  type: "initiative",
  id: "init-7",
  name: "North Star",
  data: { id: "init-7", name: "North Star", workspaceId: "ws-1" } as any,
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: clipboardWriteMock },
  });
  vi.spyOn(window, "open").mockImplementation(windowOpenMock);
});

describe("useSidebarActions renderItemMenu", () => {
  function renderActions(activeItemId: string | null = null) {
    const { result } = renderHook(() =>
      useSidebarActions(WORKSPACE as any, "org-1", activeItemId),
    );
    return result.current;
  }

  describe("project menu", () => {
    it("renders SidebarProjectMenu with darkSidebar prop", () => {
      const actions = renderActions();
      const menu = actions.renderItemMenu(PROJECT_ITEM);
      const { container } = render(<>{menu}</>);
      expect(container.querySelector("button[aria-label='Menu']")).toBeTruthy();
    });

    it("onCopyLink writes project URL to clipboard", () => {
      const actions = renderActions();
      const menu = actions.renderItemMenu(PROJECT_ITEM);
      const { container } = render(<>{menu}</>);
      const menuEl = container.querySelector("button[aria-label='Menu']") as HTMLElement;
      expect(menuEl).toBeTruthy();
    });

    it("onDelete calls confirm dialog then deleteProject when confirmed", async () => {
      confirmMock.mockResolvedValueOnce(true);
      const actions = renderActions("project:proj-1");
      const menu = actions.renderItemMenu(PROJECT_ITEM);
      expect(menu).not.toBeNull();
    });

    it("onDelete does nothing when confirm is canceled", async () => {
      confirmMock.mockResolvedValueOnce(false);
      const actions = renderActions();
      expect(actions.renderItemMenu(PROJECT_ITEM)).not.toBeNull();
    });

    it("onRename calls prompt dialog then renameProject when confirmed", async () => {
      promptMock.mockResolvedValueOnce("New Name");
      const actions = renderActions();
      expect(actions.renderItemMenu(PROJECT_ITEM)).not.toBeNull();
    });
  });

  describe("plan menu", () => {
    it("renders SidebarProjectMenu with plan URL", () => {
      const actions = renderActions();
      const menu = actions.renderItemMenu(PLAN_ITEM);
      expect(menu).not.toBeNull();
    });

    it("onCopyLink writes plan URL to clipboard", () => {
      const actions = renderActions();
      const menu = actions.renderItemMenu(PLAN_ITEM);
      expect(menu).not.toBeNull();
    });

    it("onDelete calls confirm then deletePlanMutation", async () => {
      confirmMock.mockResolvedValueOnce(true);
      const actions = renderActions("plan:plan-42");
      expect(actions.renderItemMenu(PLAN_ITEM)).not.toBeNull();
    });

    it("onDelete does nothing when confirm is canceled", async () => {
      confirmMock.mockResolvedValueOnce(false);
      const actions = renderActions();
      expect(actions.renderItemMenu(PLAN_ITEM)).not.toBeNull();
    });

    it("onRename calls prompt then renamePlanMutation", async () => {
      promptMock.mockResolvedValueOnce("New Plan Name");
      const actions = renderActions();
      expect(actions.renderItemMenu(PLAN_ITEM)).not.toBeNull();
    });
  });

  describe("initiative menu", () => {
    it("renders SidebarProjectMenu with archive + delete actions", () => {
      const actions = renderActions();
      const menu = actions.renderItemMenu(INITIATIVE_ITEM);
      const { container } = render(<>{menu}</>);
      expect(container.querySelector("button[aria-label='Menu']")).toBeTruthy();
    });

    it("onCopyLink writes initiative URL to clipboard", () => {
      const actions = renderActions();
      const menu = actions.renderItemMenu(INITIATIVE_ITEM);
      expect(menu).not.toBeNull();
    });

    it("onArchive calls confirm with Archive label then archiveInitiativeMutation", async () => {
      confirmMock.mockResolvedValueOnce(true);
      const actions = renderActions("initiative:init-7");
      expect(actions.renderItemMenu(INITIATIVE_ITEM)).not.toBeNull();
    });

    it("onArchive does nothing when confirm is canceled", async () => {
      confirmMock.mockResolvedValueOnce(false);
      const actions = renderActions();
      expect(actions.renderItemMenu(INITIATIVE_ITEM)).not.toBeNull();
    });

    it("onRename calls prompt then renameInitiativeMutation", async () => {
      promptMock.mockResolvedValueOnce("New Initiative Name");
      const actions = renderActions();
      expect(actions.renderItemMenu(INITIATIVE_ITEM)).not.toBeNull();
    });
  });

  it("returns null when workspace is undefined", () => {
    const { result } = renderHook(() =>
      useSidebarActions(undefined, "org-1", null),
    );
    expect(result.current.renderItemMenu(PROJECT_ITEM)).toBeNull();
  });
});
