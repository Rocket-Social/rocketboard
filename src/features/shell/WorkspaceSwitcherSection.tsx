import {
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import type { WorkspaceSummary } from "../projects/project-shell.types";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { workspaceColorClass } from "./theme";

type WorkspaceSwitcherSectionProps = {
  currentWorkspace: WorkspaceSummary;
  darkSidebar: boolean;
  onCreateWorkspace?: () => void;
  onDeleteWorkspace?: (workspace: WorkspaceSummary) => void;
  onPrefetchWorkspace?: (workspace: WorkspaceSummary) => void;
  onRenameWorkspace?: (workspace: WorkspaceSummary) => void;
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  pinnedRef?: (node: HTMLDivElement | null) => void;
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
  stickySurfaceClassName?: string;
  stickyTop?: number;
  workspaces: WorkspaceSummary[];
};

export const WorkspaceSwitcherSection = memo(function WorkspaceSwitcherSection({
  currentWorkspace,
  darkSidebar,
  onCreateWorkspace,
  onDeleteWorkspace,
  onPrefetchWorkspace,
  onRenameWorkspace,
  onSelectWorkspace,
  pinnedRef,
  sidebarButtonBase,
  sidebarCollapsed,
  stickySurfaceClassName = "",
  stickyTop = 0,
  workspaces,
}: WorkspaceSwitcherSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (sidebarCollapsed) return null;

  return (
    <>
      <div
        className={`sticky z-40 px-4 py-3 ${stickySurfaceClassName}`}
        ref={pinnedRef}
        style={{ top: stickyTop }}
      >
        <SidebarSectionHeader
          action={onCreateWorkspace ? (
            <button
              aria-label="Create workspace"
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${sidebarButtonBase}`}
              onClick={onCreateWorkspace}
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : undefined}
          darkSidebar={darkSidebar}
          title="Workspaces"
        />

        <button
          className={`relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 pr-11 text-sm transition-all ${darkSidebar ? "border-sidebar-soft bg-sidebar-soft text-text-inverse" : "border-border-subtle bg-canvas-accent text-text-strong"}`}
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
        >
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white ${workspaceColorClass(currentWorkspace.colorToken)}`}
          >
            {currentWorkspace.icon}
          </div>
          <span className="min-w-0 flex-1 truncate text-left font-medium">
            {currentWorkspace.name}
          </span>
          <span className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center">
            <PanelLeft
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : "rotate-0"} ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
            />
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="px-4 pb-3">
          <div
            className={`rounded-xl border p-2 ${darkSidebar ? "border-sidebar-soft bg-sidebar-soft" : "border-border-subtle bg-canvas-accent"}`}
          >
            <Input
              className={
                darkSidebar
                  ? "mb-2 border-transparent bg-sidebar text-text-inverse placeholder:text-text-inverse-muted"
                  : "mb-2 border-transparent bg-surface-base"
              }
              placeholder="Search workspaces"
            />
            <div
              className={`px-2 py-1 font-mono text-xs font-medium uppercase tracking-wider ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
            >
              My Workspaces
            </div>
            <div className="max-h-64 overflow-y-auto pr-1">
              {workspaces.map((ws) => (
                <div className="group relative flex items-center" key={ws.id}>
                  <button
                    className={`flex flex-1 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors ${ws.slug === currentWorkspace.slug ? "bg-primary-soft text-primary" : darkSidebar ? "text-text-inverse-muted hover:bg-sidebar hover:text-text-inverse" : "text-text-medium hover:bg-surface-base hover:text-text-strong"}`}
                    onFocus={() => onPrefetchWorkspace?.(ws)}
                    onMouseEnter={() => onPrefetchWorkspace?.(ws)}
                    onClick={() => onSelectWorkspace(ws)}
                    type="button"
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md text-xs font-bold text-white ${workspaceColorClass(ws.colorToken)}`}
                    >
                      {ws.icon}
                    </div>
                    <span>{ws.name}</span>
                  </button>
                  {(onRenameWorkspace || onDeleteWorkspace) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label={`Workspace actions for ${ws.name}`}
                          className={`absolute right-1 rounded-md p-1 opacity-0 transition-[color,background-color,opacity] group-hover:opacity-100 focus:opacity-100 ${darkSidebar ? "text-text-inverse-muted hover:bg-sidebar hover:text-text-inverse" : "text-text-muted hover:bg-surface-base hover:text-text-strong"}`}
                          type="button"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[160px]"
                        side="bottom"
                        sideOffset={4}
                      >
                        {onRenameWorkspace ? (
                          <DropdownMenuItem onSelect={() => onRenameWorkspace(ws)}>
                            <Pencil className="h-4 w-4 text-text-muted" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                        ) : null}
                        {onDeleteWorkspace ? (
                          <DropdownMenuItem
                            className="text-error focus:bg-error/10 focus:text-error"
                            onSelect={() => onDeleteWorkspace(ws)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});
