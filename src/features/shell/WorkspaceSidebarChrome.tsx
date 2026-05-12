import { PanelLeft, PanelLeftClose, X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import { RocketboardBrandMark } from "../../components/icons/RocketLogo";
import type { Mode } from "../../app/mode";

type WorkspaceSidebarChromeProps = {
  children: ReactNode;
  darkSidebar: boolean;
  desktopSidebarWidth: number;
  footer?: ReactNode;
  isDesktop: boolean;
  isResizingSidebar: boolean;
  mobileSidebarOpen: boolean;
  mode: Mode;
  onCollapsedToggle: () => void;
  onMobileSidebarClose: () => void;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  scrollPaddingTop?: number;
  sidebarBase: string;
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
};

export function WorkspaceSidebarChrome({
  children,
  darkSidebar,
  desktopSidebarWidth,
  footer,
  isDesktop,
  isResizingSidebar,
  mobileSidebarOpen,
  mode,
  onCollapsedToggle,
  onMobileSidebarClose,
  onResizeStart,
  scrollPaddingTop = 0,
  sidebarBase,
  sidebarButtonBase,
  sidebarCollapsed,
}: WorkspaceSidebarChromeProps) {
  return (
    <>
      {mobileSidebarOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={onMobileSidebarClose}
          type="button"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex flex-col transition-all",
          isResizingSidebar ? "duration-0" : "duration-300",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          sidebarBase,
        ].join(" ")}
        style={{ width: desktopSidebarWidth }}
      >
        <div
          className={`flex items-center justify-between border-b px-4 py-4 ${darkSidebar ? "border-sidebar-soft" : "border-border-subtle"}`}
        >
          <div className="flex items-center gap-3">
            <RocketboardBrandMark mode={mode} />
            {!sidebarCollapsed ? (
              <span
                className={`font-display text-lg font-semibold tracking-tight ${darkSidebar ? "text-white" : "text-text-strong"}`}
              >
                Rocketboard
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              className={`hidden h-8 w-8 items-center justify-center rounded-lg transition-colors lg:inline-flex ${sidebarButtonBase}`}
              onClick={onCollapsedToggle}
              type="button"
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors lg:hidden ${sidebarButtonBase}`}
              onClick={onMobileSidebarClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
          style={{ scrollPaddingTop }}
        >
          {children}
        </div>
        {footer}

        {isDesktop && !sidebarCollapsed ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-[-6px] hidden w-3 cursor-col-resize lg:block"
            onMouseDown={onResizeStart}
          >
            <div
              className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${isResizingSidebar ? "bg-primary" : darkSidebar ? "bg-sidebar-soft" : "bg-border-subtle"}`}
            />
          </div>
        ) : null}
      </aside>
    </>
  );
}
