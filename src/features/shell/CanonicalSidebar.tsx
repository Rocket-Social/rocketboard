import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import { useMode } from "../../app/mode";
import { useWorkspaceAccessQuery } from "../access/access.queries";
import { useUnreadCountQuery } from "../inbox/inbox.unread";
import type { WorkspaceSummary } from "../projects/project-shell.types";
import { WikiSidebarSection } from "../wiki/WikiSidebarSection";
import { isDarkSidebar } from "./theme";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarUnifiedList } from "./SidebarUnifiedList";
import { WorkspaceSidebarChrome } from "./WorkspaceSidebarChrome";
import { WorkspaceSidebarNav } from "./WorkspaceSidebarNav";
import { WorkspaceSwitcherSection } from "./WorkspaceSwitcherSection";
import { useCreateDialogs } from "./CreateDialogsContext";
import { useSignedInAppFrame } from "./SignedInAppFrame";
import { useSidebarShellState } from "./SidebarShellStateContext";
import type { SidebarData } from "./useSidebarData";
import type { SidebarActions } from "./useSidebarActions";

type CanonicalSidebarProps = {
  workspace: WorkspaceSummary | undefined;
  sidebarData: SidebarData;
  actions: SidebarActions;
};

export function CanonicalSidebar({ workspace, sidebarData, actions }: CanonicalSidebarProps) {
  const { currentUser } = useSignedInAppFrame();
  const shellState = useSidebarShellState();
  const { mode, setMode } = useMode();
  const createDialogs = useCreateDialogs();
  const workspaceAccessQuery = useWorkspaceAccessQuery(workspace?.id ?? null);
  const canCreateWorkspace =
    workspaceAccessQuery.data?.currentOrgRole === "admin";
  const inboxUnreadQuery = useUnreadCountQuery(currentUser?.id ?? null);
  const inboxUnreadCount = inboxUnreadQuery.data ?? 0;

  const darkSidebar = isDarkSidebar(mode);
  const sidebarBase = darkSidebar
    ? "border-transparent bg-sidebar text-text-inverse"
    : "border-r border-border-subtle bg-surface-base text-text-strong";
  const sidebarButtonBase = darkSidebar
    ? "text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse"
    : "text-text-muted hover:bg-canvas-accent hover:text-text-strong";

  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [navStickyRef, navStickyHeight] = useElementHeight<HTMLDivElement>();
  const [wikiHeaderRef, wikiHeaderHeight] = useElementHeight<HTMLDivElement>();
  const [workspaceStickyRef, workspaceStickyHeight] = useElementHeight<HTMLDivElement>();
  const [projectsHeaderRef, projectsHeaderHeight] = useElementHeight<HTMLDivElement>();
  const stickySurfaceClassName = darkSidebar ? "bg-sidebar" : "bg-surface-base";
  const wikiHeaderStickyTop = navStickyHeight;
  const workspaceStickyTop = navStickyHeight + wikiHeaderHeight;
  const projectsHeaderStickyTop = workspaceStickyTop + workspaceStickyHeight;
  const sidebarScrollPaddingTop = projectsHeaderStickyTop + projectsHeaderHeight;

  const footer = useMemo(() => {
    if (!workspace) return null;
    return (
      <SidebarFooter
        currentMode={mode}
        currentUser={currentUser}
        currentWorkspace={workspace}
        darkSidebar={darkSidebar}
        isSettingsMenuOpen={isSettingsMenuOpen}
        onMenuOpenChange={setIsSettingsMenuOpen}
        onOpenAccountSettings={createDialogs.openAccountSettings}
        onOpenApiKeys={() => void actions.openApiKeys()}
        onOpenCreateWorkspace={
          canCreateWorkspace ? createDialogs.openCreateWorkspace : undefined
        }
        onSaveWeekStartsOn={(value) => actions.saveWeekStartsOn(value)}
        onSelectMode={setMode}
        onSignOut={actions.signOut}
        onWorkspaceSelect={async (slug, nextOrgSlug) => {
          const ws = sidebarData.workspaces.find(
            (c) => c.slug === slug && (!nextOrgSlug || c.organizationSlug === nextOrgSlug),
          );
          if (ws) actions.selectWorkspace(ws);
          return true;
        }}
        sidebarButtonBase={sidebarButtonBase}
        sidebarCollapsed={shellState.sidebarCollapsed}
        workspaces={sidebarData.workspaces}
      />
    );
  }, [
    actions,
    canCreateWorkspace,
    createDialogs.openAccountSettings,
    createDialogs.openCreateWorkspace,
    currentUser,
    darkSidebar,
    isSettingsMenuOpen,
    mode,
    setMode,
    shellState.sidebarCollapsed,
    sidebarButtonBase,
    sidebarData.workspaces,
    workspace,
  ]);

  return (
    <div data-testid="canonical-sidebar">
      <WorkspaceSidebarChrome
        darkSidebar={darkSidebar}
        desktopSidebarWidth={
          shellState.sidebarCollapsed ? 64 : shellState.sidebarWidth
        }
        footer={footer}
        isDesktop={shellState.isDesktop}
        isResizingSidebar={shellState.isResizingSidebar}
        mobileSidebarOpen={shellState.mobileSidebarOpen}
        mode={mode}
        onCollapsedToggle={shellState.toggleSidebarCollapsed}
        onMobileSidebarClose={shellState.closeMobileSidebar}
        onResizeStart={shellState.handleResizeStart}
        scrollPaddingTop={sidebarScrollPaddingTop}
        sidebarBase={sidebarBase}
        sidebarButtonBase={sidebarButtonBase}
        sidebarCollapsed={shellState.sidebarCollapsed}
      >
        <div
          className={`sticky top-0 z-[60] ${stickySurfaceClassName}`}
          ref={navStickyRef}
        >
          <WorkspaceSidebarNav
            activeItem={sidebarData.activeNavItem}
            darkSidebar={darkSidebar}
            inboxUnreadCount={inboxUnreadCount}
            onPrefetch={actions.prefetchNavItem}
            onSelect={actions.selectNavItem}
            sidebarButtonBase={sidebarButtonBase}
            sidebarCollapsed={shellState.sidebarCollapsed}
          />
        </div>

        {sidebarData.wikiOrgId ? (
          <WikiSidebarSection
            activePageId={sidebarData.activeWikiPageId}
            accessiblePages={sidebarData.wikiPages}
            accessiblePagesLoaded={sidebarData.wikiPagesLoaded}
            darkSidebar={darkSidebar}
            headerRef={wikiHeaderRef}
            headerStickyTop={wikiHeaderStickyTop}
            onAllPages={actions.navigateToAllWikiPages}
            onCreatePage={actions.createWikiPage}
            onPrefetchAllPages={actions.prefetchAllWikiPages}
            onPrefetchPage={actions.prefetchWikiPage}
            onSelectPage={actions.selectWikiPage}
            orgId={sidebarData.wikiOrgId}
            pinnedPages={sidebarData.pinnedWikiPages}
            sidebarButtonBase={sidebarButtonBase}
            sidebarCollapsed={shellState.sidebarCollapsed}
            stickySurfaceClassName={stickySurfaceClassName}
          />
        ) : null}

        {workspace ? (
          <WorkspaceSwitcherSection
            currentWorkspace={workspace}
            darkSidebar={darkSidebar}
            onCreateWorkspace={
              canCreateWorkspace
                ? () => createDialogs.openCreateWorkspace()
                : undefined
            }
            onDeleteWorkspace={actions.deleteWorkspace}
            onPrefetchWorkspace={actions.prefetchWorkspace}
            onRenameWorkspace={actions.renameWorkspace}
            onSelectWorkspace={actions.selectWorkspace}
            pinnedRef={workspaceStickyRef}
            sidebarButtonBase={sidebarButtonBase}
            sidebarCollapsed={shellState.sidebarCollapsed}
            stickySurfaceClassName={stickySurfaceClassName}
            stickyTop={workspaceStickyTop}
            workspaces={sidebarData.workspaces}
          />
        ) : null}

        {workspace && sidebarData.workspaceId ? (
          <SidebarUnifiedList
            activeItemId={sidebarData.activeSidebarItemId}
            darkSidebar={darkSidebar}
            headerRef={projectsHeaderRef}
            headerStickyTop={projectsHeaderStickyTop}
            initiatives={sidebarData.workspaceInitiatives}
            onClickInitiative={actions.selectInitiative}
            onClickPlan={actions.selectPlan}
            onClickProject={actions.selectProject}
            onCreateInitiative={createDialogs.openCreateInitiative}
            onCreatePlan={(viewType) => createDialogs.openCreatePlan(viewType)}
            onCreateProject={createDialogs.openCreateProject}
            onPrefetchInitiative={(initiative) =>
              actions.prefetchInitiative(initiative)
            }
            onPrefetchPlan={(plan) => actions.prefetchPlan(plan)}
            onPrefetchProject={(project) => actions.prefetchProject(project)}
            plans={sidebarData.workspacePlans}
            projects={sidebarData.workspaceProjects}
            renderItemMenu={actions.renderItemMenu}
            sidebarButtonBase={sidebarButtonBase}
            stickySurfaceClassName={stickySurfaceClassName}
            workspaceId={sidebarData.workspaceId}
          />
        ) : (
          <div className="flex-1" />
        )}
      </WorkspaceSidebarChrome>
    </div>
  );
}

function useElementHeight<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [height, setHeight] = useState(0);
  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useLayoutEffect(() => {
    if (!element) {
      setHeight(0);
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height);
      setHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, height] as const;
}
