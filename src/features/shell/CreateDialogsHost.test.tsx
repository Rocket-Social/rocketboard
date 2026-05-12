/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildProjectRouteHrefMock,
  getProjectRouteMock,
  getQueryDataMock,
  navigateMock,
  navigateWhenWarmMock,
  routerMock,
  setCreateWorkspaceOpenMock,
  toastMock,
} = vi.hoisted(() => ({
  buildProjectRouteHrefMock: vi.fn(),
  getProjectRouteMock: vi.fn(),
  getQueryDataMock: vi.fn(),
  navigateMock: vi.fn(),
  navigateWhenWarmMock: vi.fn(),
  routerMock: { preloadRoute: vi.fn() },
  setCreateWorkspaceOpenMock: vi.fn(),
  toastMock: vi.fn(),
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
  useQueryClient: () => ({
    getQueryData: getQueryDataMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => routerMock,
}));

vi.mock("../../app/lazyWithRetry", () => ({
  lazyWithRetry: () => () => <div data-testid="lazy-dialog" />,
}));

vi.mock("../../components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  PromptDialog: () => <div data-testid="prompt-dialog" />,
}));

vi.mock("../../components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("./CreateDialogsContext", () => ({
  useCreateDialogs: () => ({
    accountSettingsOpen: false,
    createInitiativeOpen: false,
    createPlanDefaultViewType: undefined,
    createPlanOpen: false,
    createProjectOpen: false,
    createWorkspaceOpen: true,
    setAccountSettingsOpen: vi.fn(),
    setCreateInitiativeOpen: vi.fn(),
    setCreatePlanOpen: vi.fn(),
    setCreateProjectOpen: vi.fn(),
    setCreateWorkspaceOpen: setCreateWorkspaceOpenMock,
  }),
}));

vi.mock("./LazySurfaceBoundary", () => ({
  LazySurfaceBoundary: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./SignedInAppFrame", () => ({
  useSignedInAppFrame: () => ({
    currentUser: { id: "user-1", name: "Test User" },
    workspaces: [WORKSPACE],
  }),
}));

vi.mock("./useResolvedWorkspace", () => ({
  useResolvedWorkspace: () => WORKSPACE,
}));

vi.mock("../access/access.queries", () => ({
  useWorkspaceAccessQuery: () => ({
    data: {
      currentOrgRole: "admin",
    },
  }),
}));

vi.mock("../projects/project-shell.queries", () => ({
  workspaceSummariesQueryOptions: () => ({ queryKey: ["workspaces"] }),
}));

vi.mock("../projects/project-shell.routes", () => ({
  getProjectRoute: getProjectRouteMock,
}));

vi.mock("../search/workspace-palette-navigation", () => ({
  buildProjectRouteHref: buildProjectRouteHrefMock,
}));

vi.mock("./signed-in-navigation", () => ({
  navigateWhenWarm: navigateWhenWarmMock,
}));

vi.mock("../setup/CreateInitiativeDialog", () => ({
  CreateInitiativeDialog: () => <div data-testid="create-initiative-dialog" />,
}));

vi.mock("../setup/CreatePlanDialog", () => ({
  CreatePlanDialog: () => <div data-testid="create-plan-dialog" />,
}));

vi.mock("../setup/CreateProjectDialog", () => ({
  CreateProjectDialog: () => <div data-testid="create-project-dialog" />,
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

import { CreateDialogsHost } from "./CreateDialogsHost";

describe("CreateDialogsHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getQueryDataMock.mockReturnValue([WORKSPACE]);
    getProjectRouteMock.mockReturnValue(RESOLVED_ROUTE);
    buildProjectRouteHrefMock.mockReturnValue(
      "/org/rocketboard/main/projects/getting-started/table/view-1",
    );
  });

  it("renders the workspace creation dialog from shared shell state", () => {
    render(
      <CreateDialogsHost
        actions={{
          confirm: { confirmDialogProps: null },
          handleCreateInitiative: vi.fn(),
          handleCreatePlan: vi.fn(),
          promptDialog: { promptDialogProps: null },
        } as any}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Complete workspace creation" }),
    ).toBeInTheDocument();
  });

  it("navigates to the created workspace route when creation succeeds", async () => {
    const user = userEvent.setup();

    render(
      <CreateDialogsHost
        actions={{
          confirm: { confirmDialogProps: null },
          handleCreateInitiative: vi.fn(),
          handleCreatePlan: vi.fn(),
          promptDialog: { promptDialogProps: null },
        } as any}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Complete workspace creation" }),
    );

    expect(setCreateWorkspaceOpenMock).toHaveBeenCalledWith(false);
    expect(getProjectRouteMock).toHaveBeenCalledWith(
      [WORKSPACE],
      "rocketboard",
      "main",
      "getting-started",
      "view-1",
    );
    expect(buildProjectRouteHrefMock).toHaveBeenCalledWith(RESOLVED_ROUTE);
    expect(navigateWhenWarmMock).toHaveBeenCalledWith({
      location: {
        href: "/org/rocketboard/main/projects/getting-started/table/view-1",
      },
      navigate: navigateMock,
      router: routerMock,
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("shows a workspace-specific toast when the created route cannot be resolved", async () => {
    const user = userEvent.setup();
    getProjectRouteMock.mockReturnValue(null);

    render(
      <CreateDialogsHost
        actions={{
          confirm: { confirmDialogProps: null },
          handleCreateInitiative: vi.fn(),
          handleCreatePlan: vi.fn(),
          promptDialog: { promptDialogProps: null },
        } as any}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Complete workspace creation" }),
    );

    expect(navigateWhenWarmMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      description:
        "We couldn't open the new workspace automatically. Refresh to find it in the sidebar.",
      title: "Workspace created",
    });
  });
});
