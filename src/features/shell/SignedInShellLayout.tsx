import { Menu } from "lucide-react";
import { Outlet, useRouterState } from "@tanstack/react-router";

import { BlockingUiProvider } from "./BlockingUiContext";
import { CanonicalSidebar } from "./CanonicalSidebar";
import { CreateDialogsHost } from "./CreateDialogsHost";
import { CreateDialogsProvider } from "./CreateDialogsContext";
import { GlobalCommandPaletteHost } from "./GlobalCommandPaletteHost";
import { NavigationGuardProvider } from "./NavigationGuardContext";
import {
  SidebarShellStateProvider,
  useSidebarShellState,
} from "./SidebarShellStateContext";
import { useResolvedWorkspace } from "./useResolvedWorkspace";
import { useSidebarActions } from "./useSidebarActions";
import { useSidebarData } from "./useSidebarData";
import { isProjectRoute, resolveLayoutVariant } from "./resolve-layout-variant";
import { resolveMobileHeader } from "./resolve-mobile-header";

export function SignedInShellLayout() {
  return (
    <SidebarShellStateProvider>
      <BlockingUiProvider>
        <NavigationGuardProvider>
          <CreateDialogsProvider>
            <SignedInShellBody />
          </CreateDialogsProvider>
        </NavigationGuardProvider>
      </BlockingUiProvider>
    </SidebarShellStateProvider>
  );
}

function SignedInShellBody() {
  const shellState = useSidebarShellState();
  const workspace = useResolvedWorkspace();
  const sidebarData = useSidebarData(workspace);
  const actions = useSidebarActions(workspace, sidebarData.wikiOrgId, sidebarData.activeSidebarItemId);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const layoutVariant = resolveLayoutVariant(pathname);
  const mobileHeader = resolveMobileHeader(pathname);
  const projectRoute = isProjectRoute(pathname);

  const desktopMainClass =
    layoutVariant === "fixed-viewport"
      ? "flex h-screen min-w-0 flex-1 flex-col overflow-hidden"
      : "flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden";
  const contentClass =
    layoutVariant === "fixed-viewport"
      ? "flex min-h-0 min-w-0 flex-1 overflow-hidden"
      : "min-w-0 flex-1";

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas">
      <CanonicalSidebar
        workspace={workspace}
        sidebarData={sidebarData}
        actions={actions}
      />

      <main
        className={`${desktopMainClass} transition-[margin] ${shellState.isResizingSidebar ? "duration-0" : "duration-300"}`}
        style={{
          marginLeft: shellState.isDesktop
            ? (shellState.sidebarCollapsed ? 64 : shellState.sidebarWidth)
            : undefined,
        }}
      >
        {mobileHeader.visible ? (
          <div className="flex items-center gap-3 border-b border-border-subtle bg-surface-base px-4 py-3 lg:hidden">
            <button
              className="inline-flex rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong"
              onClick={shellState.openMobileSidebar}
              type="button"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-display text-lg font-semibold text-text-strong">
              {mobileHeader.title}
            </span>
          </div>
        ) : null}

        <div className={contentClass}>
          <Outlet />
        </div>
      </main>

      <CreateDialogsHost actions={actions} />
      {!projectRoute ? <GlobalCommandPaletteHost /> : null}
    </div>
  );
}
