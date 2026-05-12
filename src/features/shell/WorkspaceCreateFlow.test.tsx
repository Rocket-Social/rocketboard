/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildProjectRouteHrefMock,
  getProjectRouteMock,
  getQueryDataMock,
  navigateMock,
  navigateWhenWarmMock,
  routerMock,
  toastMock,
  useWorkspaceCommandPaletteControllerMock,
} = vi.hoisted(() => ({
  buildProjectRouteHrefMock: vi.fn(),
  getProjectRouteMock: vi.fn(),
  getQueryDataMock: vi.fn(),
  navigateMock: vi.fn(),
  navigateWhenWarmMock: vi.fn(),
  routerMock: { preloadRoute: vi.fn() },
  toastMock: vi.fn(),
  useWorkspaceCommandPaletteControllerMock: vi.fn(),
}));

const WORKSPACE = {
  colorToken: "blue",
  defaultProjectSlug: "getting-started",
  icon: "L",
  id: "workspace-1",
  name: "Main",
  organizationId: "org-1",
  organizationName: "Rocketboard",
  organizationSlug: "rocketboard",
  projects: [],
  slug: "main",
  timezone: "America/Los_Angeles",
};

const CREATED_ROUTE = {
  orgSlug: "rocketboard",
  projectSlug: "getting-started",
  viewId: "view-1",
  workspaceSlug: "main",
};

const RESOLVED_ROUTE = {
  ...CREATED_ROUTE,
  viewType: "table",
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
  useQueryClient: () => ({
    getQueryData: getQueryDataMock,
  }),
}));

// Inbox unread badge query reaches into TanStack — stub it out so this
// test focuses on the workspace-create flow.
vi.mock("../inbox/inbox.unread", () => ({
  useUnreadCountQuery: () => ({ data: 0 }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => routerMock,
}));

vi.mock("../../app/lazyWithRetry", () => ({
  lazyWithRetry: () => () => <div data-testid="lazy-dialog" />,
}));

vi.mock("../../app/mode", () => ({
  useMode: () => ({ mode: "ember", setMode: vi.fn() }),
}));

vi.mock("../../components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  PromptDialog: () => <div data-testid="prompt-dialog" />,
}));

vi.mock("../../components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("../wiki/WikiSidebarSection", () => ({
  WikiSidebarSection: () => null,
}));

vi.mock("./SidebarFooter", () => ({
  SidebarFooter: () => null,
}));

vi.mock("./SidebarShellStateContext", () => ({
  useSidebarShellState: () => ({
    closeMobileSidebar: vi.fn(),
    handleResizeStart: vi.fn(),
    isDesktop: true,
    isResizingSidebar: false,
    mobileSidebarOpen: false,
    sidebarCollapsed: false,
    sidebarWidth: 320,
    toggleSidebarCollapsed: vi.fn(),
  }),
}));

vi.mock("./SidebarUnifiedList", () => ({
  SidebarUnifiedList: () => null,
}));

vi.mock("./SignedInAppFrame", () => ({
  useSignedInAppFrame: () => ({
    currentUser: {
      email: "user@example.com",
      id: "user-1",
      name: "Test User",
    },
    workspaces: [WORKSPACE],
  }),
}));

vi.mock("./WorkspaceSidebarChrome", () => ({
  WorkspaceSidebarChrome: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <div>
      {footer}
      {children}
    </div>
  ),
}));

vi.mock("./WorkspaceSidebarNav", () => ({
  WorkspaceSidebarNav: () => null,
}));

vi.mock("./useResolvedWorkspace", () => ({
  useResolvedWorkspace: () => WORKSPACE,
}));

vi.mock("../search/useWorkspaceCommandPaletteController", () => ({
  useWorkspaceCommandPaletteController: useWorkspaceCommandPaletteControllerMock,
}));

vi.mock("../projects/project-shell.queries", () => ({
  workspaceSummariesQueryOptions: () => ({ queryKey: ["workspaces"] }),
}));

vi.mock("../projects/project-shell.routes", () => ({
  getProjectRoute: getProjectRouteMock,
}));

vi.mock("../access/access.queries", () => ({
  useWorkspaceAccessQuery: () => ({
    data: {
      currentOrgRole: "admin",
    },
  }),
}));

vi.mock("../search/workspace-palette-navigation", () => ({
  buildProjectRouteHref: buildProjectRouteHrefMock,
}));

vi.mock("./signed-in-navigation", () => ({
  navigateWhenWarm: navigateWhenWarmMock,
}));

vi.mock("../setup/CreateInitiativeDialog", () => ({
  CreateInitiativeDialog: () => null,
}));

vi.mock("../setup/CreatePlanDialog", () => ({
  CreatePlanDialog: () => null,
}));

vi.mock("../setup/CreateProjectDialog", () => ({
  CreateProjectDialog: () => null,
}));

vi.mock("../setup/CreateWorkspaceDialog", () => ({
  CreateWorkspaceDialog: ({
    isOpen,
    onCreated,
  }: {
    isOpen: boolean;
    onCreated: (route: typeof CREATED_ROUTE) => void;
  }) =>
    isOpen ? (
      <button onClick={() => onCreated(CREATED_ROUTE)} type="button">
        Complete workspace creation
      </button>
    ) : null,
}));

import { BlockingUiProvider } from "./BlockingUiContext";
import { CanonicalSidebar } from "./CanonicalSidebar";
import { CreateDialogsProvider } from "./CreateDialogsContext";
import { CreateDialogsHost } from "./CreateDialogsHost";

describe("workspace create flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryDataMock.mockReturnValue([WORKSPACE]);
    getProjectRouteMock.mockReturnValue(RESOLVED_ROUTE);
    buildProjectRouteHrefMock.mockReturnValue(
      "/org/rocketboard/workspaces/main/projects/getting-started/table/view-1",
    );
  });

  it("opens the workspace dialog from the sidebar plus button and navigates after creation", async () => {
    const user = userEvent.setup();

    render(
      <BlockingUiProvider>
        <CreateDialogsProvider>
          <CanonicalSidebar
            actions={{
              deleteWorkspace: vi.fn(),
              openApiKeys: vi.fn(),
              prefetchInitiative: vi.fn(),
              prefetchNavItem: vi.fn(),
              prefetchPlan: vi.fn(),
              prefetchProject: vi.fn(),
              prefetchWorkspace: vi.fn(),
              renameWorkspace: vi.fn(),
              saveWeekStartsOn: vi.fn(),
              selectInitiative: vi.fn(),
              selectNavItem: vi.fn(),
              selectPlan: vi.fn(),
              selectProject: vi.fn(),
              selectWorkspace: vi.fn(),
              signOut: vi.fn(),
              confirm: { confirmDialogProps: null },
              handleCreateInitiative: vi.fn(),
              handleCreatePlan: vi.fn(),
              promptDialog: { promptDialogProps: null },
            } as any}
            sidebarData={{
              activeNavItem: "notes",
              activeSidebarItemId: null,
              activeWikiPageId: null,
              pinnedWikiPages: [],
              wikiOrgId: null,
              wikiPages: [],
              wikiPagesLoaded: true,
              workspaceId: WORKSPACE.id,
              workspaceInitiatives: [],
              workspacePlans: [],
              workspaceProjects: [],
              workspaces: [WORKSPACE],
            } as any}
            workspace={WORKSPACE as any}
          />
          <CreateDialogsHost
            actions={{
              confirm: { confirmDialogProps: null },
              handleCreateInitiative: vi.fn(),
              handleCreatePlan: vi.fn(),
              promptDialog: { promptDialogProps: null },
            } as any}
          />
        </CreateDialogsProvider>
      </BlockingUiProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Complete workspace creation" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      screen.getByRole("button", { name: "Complete workspace creation" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Complete workspace creation" }),
    );

    await waitFor(() => {
      expect(navigateWhenWarmMock).toHaveBeenCalledWith({
        location: {
          href: "/org/rocketboard/workspaces/main/projects/getting-started/table/view-1",
        },
        navigate: navigateMock,
        router: routerMock,
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Complete workspace creation" }),
      ).not.toBeInTheDocument();
    });

    expect(toastMock).not.toHaveBeenCalled();
  });
});
