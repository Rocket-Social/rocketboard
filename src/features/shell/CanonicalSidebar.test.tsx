/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  openCreateProjectMock,
  openCreateWorkspaceMock,
  useWorkspaceAccessQueryMock,
} = vi.hoisted(() => ({
  openCreateProjectMock: vi.fn(),
  openCreateWorkspaceMock: vi.fn(),
  useWorkspaceAccessQueryMock: vi.fn(),
}));

vi.mock("../../app/mode", () => ({
  useMode: () => ({ mode: "ember", setMode: vi.fn() }),
}));

vi.mock("../wiki/WikiSidebarSection", () => ({
  WikiSidebarSection: ({
    headerRef,
    headerStickyTop,
  }: {
    headerRef?: (node: HTMLDivElement | null) => void;
    headerStickyTop?: number;
  }) => (
    <div
      data-measured-section="wiki"
      data-sticky-top={headerStickyTop}
      data-testid="wiki-sidebar-section"
      ref={headerRef}
    />
  ),
}));

vi.mock("./CreateDialogsContext", () => ({
  useCreateDialogs: () => ({
    openAccountSettings: vi.fn(),
    openCommandPalette: vi.fn(),
    openCreateInitiative: vi.fn(),
    openCreatePlan: vi.fn(),
    openCreateProject: openCreateProjectMock,
    openCreateWorkspace: openCreateWorkspaceMock,
  }),
}));

vi.mock("../access/access.queries", () => ({
  useWorkspaceAccessQuery: useWorkspaceAccessQueryMock,
}));

// Inbox unread badge query is a TanStack useQuery; the tests in this file
// don't wrap with QueryClientProvider, so stub the hook out.
vi.mock("../inbox/inbox.unread", () => ({
  useUnreadCountQuery: () => ({ data: 0 }),
}));

vi.mock("./SidebarFooter", () => ({
  SidebarFooter: ({
    onOpenCreateWorkspace,
  }: {
    onOpenCreateWorkspace?: () => void;
  }) =>
    onOpenCreateWorkspace ? (
      <button onClick={() => onOpenCreateWorkspace()} type="button">
        Footer create workspace
      </button>
    ) : null,
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
  SidebarUnifiedList: ({
    headerRef,
    headerStickyTop,
  }: {
    headerRef?: (node: HTMLDivElement | null) => void;
    headerStickyTop?: number;
  }) => (
    <div data-testid="sidebar-unified-list">
      <div
        data-measured-section="projects"
        data-sticky-top={headerStickyTop}
        data-testid="projects-header"
        ref={headerRef}
      />
    </div>
  ),
}));

vi.mock("./SignedInAppFrame", () => ({
  useSignedInAppFrame: () => ({
    currentUser: {
      email: "user@example.com",
      id: "user-1",
      name: "Test User",
    },
  }),
}));

vi.mock("./WorkspaceSidebarChrome", () => ({
  WorkspaceSidebarChrome: ({
    children,
    footer,
    scrollPaddingTop,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
    scrollPaddingTop?: number;
  }) => (
    <div data-scroll-padding-top={scrollPaddingTop} data-testid="sidebar-chrome">
      {footer}
      {children}
    </div>
  ),
}));

vi.mock("./WorkspaceSidebarNav", () => ({
  WorkspaceSidebarNav: () => (
    <div data-measured-section="nav" data-testid="workspace-sidebar-nav" />
  ),
}));

vi.mock("./WorkspaceSwitcherSection", () => ({
  WorkspaceSwitcherSection: ({
    onCreateWorkspace,
    pinnedRef,
    stickyTop,
  }: {
    onCreateWorkspace?: () => void;
    pinnedRef?: (node: HTMLDivElement | null) => void;
    stickyTop?: number;
  }) => (
    <div
      data-measured-section="workspace"
      data-sticky-top={stickyTop}
      data-testid="workspace-switcher-pinned"
      ref={pinnedRef}
    >
      {onCreateWorkspace ? (
        <button onClick={() => onCreateWorkspace()} type="button">
          Section create workspace
        </button>
      ) : null}
    </div>
  ),
}));

import { CanonicalSidebar } from "./CanonicalSidebar";

const WORKSPACE = {
  colorToken: "blue",
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

const measuredSectionHeights: Record<string, number> = {
  nav: 20,
  projects: 50,
  wiki: 30,
  workspace: 40,
};

describe("CanonicalSidebar", () => {
  let getBoundingClientRectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        const sectionName =
          this.getAttribute("data-measured-section") ??
          this.querySelector("[data-measured-section]")?.getAttribute(
            "data-measured-section",
          );
        const height = sectionName
          ? measuredSectionHeights[sectionName] ?? 0
          : 0;
        return {
          bottom: height,
          height,
          left: 0,
          right: 0,
          toJSON: () => ({}),
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        };
      });
    useWorkspaceAccessQueryMock.mockReturnValue({
      data: {
        currentOrgRole: "admin",
      },
    });
  });

  afterEach(() => {
    getBoundingClientRectSpy.mockRestore();
  });

  it("wires workspace create affordances to the workspace dialog", () => {
    render(
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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Section create workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Footer create workspace" }));

    expect(openCreateWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(openCreateProjectMock).not.toHaveBeenCalled();
  });

  it("hides workspace create affordances for non-admin organization members", () => {
    useWorkspaceAccessQueryMock.mockReturnValue({
      data: {
        currentOrgRole: "member",
      },
    });

    render(
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
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Section create workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Footer create workspace" }),
    ).not.toBeInTheDocument();
    expect(openCreateWorkspaceMock).not.toHaveBeenCalled();
  });

  it("sets scroll padding from the full measured sticky stack", async () => {
    render(
      <CanonicalSidebar
        actions={{
          deleteWorkspace: vi.fn(),
          navigateToAllWikiPages: vi.fn(),
          openApiKeys: vi.fn(),
          prefetchAllWikiPages: vi.fn(),
          prefetchInitiative: vi.fn(),
          prefetchNavItem: vi.fn(),
          prefetchPlan: vi.fn(),
          prefetchProject: vi.fn(),
          prefetchWikiPage: vi.fn(),
          prefetchWorkspace: vi.fn(),
          renameWorkspace: vi.fn(),
          saveWeekStartsOn: vi.fn(),
          selectInitiative: vi.fn(),
          selectNavItem: vi.fn(),
          selectPlan: vi.fn(),
          selectProject: vi.fn(),
          selectWikiPage: vi.fn(),
          selectWorkspace: vi.fn(),
          signOut: vi.fn(),
        } as any}
        sidebarData={{
          activeNavItem: "notes",
          activeSidebarItemId: null,
          activeWikiPageId: null,
          pinnedWikiPages: [],
          wikiOrgId: "org-1",
          wikiPages: [],
          wikiPagesLoaded: true,
          workspaceId: WORKSPACE.id,
          workspaceInitiatives: [],
          workspacePlans: [],
          workspaceProjects: [],
          workspaces: [WORKSPACE],
        } as any}
        workspace={WORKSPACE as any}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("wiki-sidebar-section")).toHaveAttribute(
        "data-sticky-top",
        "20",
      );
      expect(screen.getByTestId("workspace-switcher-pinned")).toHaveAttribute(
        "data-sticky-top",
        "50",
      );
      expect(screen.getByTestId("projects-header")).toHaveAttribute(
        "data-sticky-top",
        "90",
      );
      expect(screen.getByTestId("sidebar-chrome")).toHaveAttribute(
        "data-scroll-padding-top",
        "140",
      );
    });
  });
});
