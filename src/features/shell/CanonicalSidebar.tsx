import { useMemo, useState } from "react";

import { useMode } from "../../app/mode";
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

  const darkSidebar = isDarkSidebar(mode);
  const sidebarBase = darkSidebar
    ? "border-transparent bg-sidebar text-text-inverse"
    : "border-r border-border-subtle bg-surface-base text-text-strong";
  const sidebarButtonBase = darkSidebar
    ? "text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse"
    : "text-text-muted hover:bg-canvas-accent hover:text-text-strong";

  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

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
        onOpenCreateWorkspace={createDialogs.openCreateProject}
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
    createDialogs.openAccountSettings,
    createDialogs.openCreateProject,
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
        onOpenCommandPalette={createDialogs.openCommandPalette}
        onResizeStart={shellState.handleResizeStart}
        searchDisabled={!workspace}
        sidebarBase={sidebarBase}
        sidebarButtonBase={sidebarButtonBase}
        sidebarCollapsed={shellState.sidebarCollapsed}
      >
        <WorkspaceSidebarNav
          activeItem={sidebarData.activeNavItem}
          darkSidebar={darkSidebar}
          onPrefetch={actions.prefetchNavItem}
          onSelect={actions.selectNavItem}
          sidebarButtonBase={sidebarButtonBase}
          sidebarCollapsed={shellState.sidebarCollapsed}
        />

        {sidebarData.wikiOrgId ? (
          <WikiSidebarSection
            activePageId={sidebarData.activeWikiPageId}
            accessiblePages={sidebarData.wikiPages}
            accessiblePagesLoaded={sidebarData.wikiPagesLoaded}
            darkSidebar={darkSidebar}
            onAllPages={actions.navigateToAllWikiPages}
            onCreatePage={actions.createWikiPage}
            onPrefetchAllPages={actions.prefetchAllWikiPages}
            onPrefetchPage={actions.prefetchWikiPage}
            onSelectPage={actions.selectWikiPage}
            orgId={sidebarData.wikiOrgId}
            pinnedPages={sidebarData.pinnedWikiPages}
            sidebarButtonBase={sidebarButtonBase}
            sidebarCollapsed={shellState.sidebarCollapsed}
          />
        ) : null}

        {workspace ? (
          <WorkspaceSwitcherSection
            currentWorkspace={workspace}
            darkSidebar={darkSidebar}
            onCreateWorkspace={() => createDialogs.openCreateProject()}
            onDeleteWorkspace={actions.deleteWorkspace}
            onPrefetchWorkspace={actions.prefetchWorkspace}
            onRenameWorkspace={actions.renameWorkspace}
            onSelectWorkspace={actions.selectWorkspace}
            sidebarButtonBase={sidebarButtonBase}
            sidebarCollapsed={shellState.sidebarCollapsed}
            workspaces={sidebarData.workspaces}
          />
        ) : null}

        {workspace && sidebarData.workspaceId ? (
          <SidebarUnifiedList
            activeItemId={sidebarData.activeSidebarItemId}
            darkSidebar={darkSidebar}
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
            workspaceId={sidebarData.workspaceId}
          />
        ) : (
          <div className="flex-1" />
        )}
      </WorkspaceSidebarChrome>
    </div>
  );
}
