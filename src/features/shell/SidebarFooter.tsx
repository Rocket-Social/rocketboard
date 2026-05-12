import { Settings } from "lucide-react";
import { Suspense } from "react";

import { lazyWithRetry } from "../../app/lazyWithRetry";
import type { Mode } from "../../app/mode";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { UserAvatar } from "../../components/ui/user-avatar";
import type { WeekStartsOn } from "../../lib/week-preferences";
import type { SessionUser } from "../auth/data";
import type { WorkspaceSummary } from "../projects/project-shell.types";

const LazySettingsMenu = lazyWithRetry(
  () => import("./SettingsMenu").then((m) => ({ default: m.SettingsMenu })),
  { recovery: "error-boundary" },
);

export type SidebarFooterProps = {
  currentMode: Mode;
  currentUser: SessionUser;
  currentWorkspace: WorkspaceSummary;
  darkSidebar: boolean;
  isSettingsMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpenAccountSettings: () => boolean | void;
  onOpenApiKeys: () => boolean | void | Promise<boolean | void>;
  onOpenCreateWorkspace?: () => boolean | void | Promise<boolean | void>;
  onSaveWeekStartsOn: (value: WeekStartsOn) => Promise<void>;
  onSelectMode: (mode: Mode) => void;
  onSignOut: () => boolean | void | Promise<boolean | void>;
  onWorkspaceSelect: (
    workspaceSlug: string,
    orgSlug?: string,
  ) => boolean | void | Promise<boolean | void>;
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
  workspaces: WorkspaceSummary[];
};

export function SidebarFooter({
  currentMode,
  currentUser,
  currentWorkspace,
  darkSidebar,
  isSettingsMenuOpen,
  onMenuOpenChange,
  onOpenAccountSettings,
  onOpenApiKeys,
  onOpenCreateWorkspace,
  onSaveWeekStartsOn,
  onSelectMode,
  onSignOut,
  onWorkspaceSelect,
  sidebarButtonBase,
  sidebarCollapsed,
  workspaces,
}: SidebarFooterProps) {
  const settingsMenuProps = {
    currentMode,
    currentUser,
    currentWorkspace,
    isOpen: isSettingsMenuOpen,
    onMenuOpenChange,
    onOpenAccountSettings,
    onOpenApiKeys,
    onOpenCreateWorkspace,
    onSaveWeekStartsOn,
    onSelectMode,
    onSignOut,
    onWorkspaceSelect,
    workspaces,
  };

  return (
    <div
      className={`border-t p-4 ${darkSidebar ? "border-sidebar-soft" : "border-border-subtle"}`}
    >
      {sidebarCollapsed ? (
        <div className="flex justify-center">
          <DropdownMenu
            open={isSettingsMenuOpen}
            onOpenChange={onMenuOpenChange}
          >
            <DropdownMenuTrigger asChild>
              <button
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${sidebarButtonBase}`}
                type="button"
              >
                <Settings className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <Suspense fallback={null}>
              <LazySettingsMenu {...settingsMenuProps} />
            </Suspense>
          </DropdownMenu>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <UserAvatar
            avatarUrl={currentUser.avatarUrl}
            className="h-8 w-8"
            fallback={currentUser.initials}
            name={currentUser.name}
          />
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-medium ${darkSidebar ? "text-text-inverse" : "text-text-strong"}`}
            >
              {currentUser.name}
            </p>
            <p
              className={`truncate text-xs ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
            >
              {currentUser.email}
            </p>
          </div>
          <DropdownMenu
            open={isSettingsMenuOpen}
            onOpenChange={onMenuOpenChange}
          >
            <DropdownMenuTrigger asChild>
              <button
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${sidebarButtonBase}`}
                type="button"
              >
                <Settings className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <Suspense fallback={null}>
              <LazySettingsMenu {...settingsMenuProps} />
            </Suspense>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
