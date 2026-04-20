import {
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, useState } from "react";

import { Input } from "../../components/ui/input";
import type { WorkspaceSummary } from "../projects/project-shell.types";
import { workspaceColorClass } from "./theme";

type WorkspaceSwitcherSectionProps = {
  currentWorkspace: WorkspaceSummary;
  darkSidebar: boolean;
  onCreateWorkspace?: () => void;
  onDeleteWorkspace?: (workspace: WorkspaceSummary) => void;
  onPrefetchWorkspace?: (workspace: WorkspaceSummary) => void;
  onRenameWorkspace?: (workspace: WorkspaceSummary) => void;
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
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
  sidebarButtonBase,
  sidebarCollapsed,
  workspaces,
}: WorkspaceSwitcherSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);

  if (sidebarCollapsed) return null;

  return (
    <div className="mt-2 px-4 py-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span
          className={`font-mono text-xs font-medium uppercase tracking-wider ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
        >
          Workspaces
        </span>
        <div className="flex items-center gap-1">
          {onCreateWorkspace ? (
            <button
              className={sidebarButtonBase}
              onClick={onCreateWorkspace}
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <button
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all ${darkSidebar ? "border-sidebar-soft bg-sidebar-soft text-text-inverse" : "border-border-subtle bg-canvas-accent text-text-strong"}`}
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white ${workspaceColorClass(currentWorkspace.colorToken)}`}
        >
          {currentWorkspace.icon}
        </div>
        <span className="flex-1 text-left font-medium">
          {currentWorkspace.name}
        </span>
        <PanelLeft
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : "rotate-0"} ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
        />
      </button>

      {isOpen ? (
        <div
          className={`mt-2 rounded-xl border p-2 ${darkSidebar ? "border-sidebar-soft bg-sidebar-soft" : "border-border-subtle bg-canvas-accent"}`}
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
                <div className="absolute right-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className={`rounded-md p-1 transition-colors ${darkSidebar ? "text-text-inverse-muted hover:bg-sidebar hover:text-text-inverse" : "text-text-muted hover:bg-surface-base hover:text-text-strong"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setWorkspaceMenuId(
                        workspaceMenuId === ws.id ? null : ws.id,
                      );
                    }}
                    type="button"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {workspaceMenuId === ws.id ? (
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated">
                      {onRenameWorkspace ? (
                        <button
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent"
                          onClick={() => {
                            setWorkspaceMenuId(null);
                            void onRenameWorkspace(ws);
                          }}
                          type="button"
                        >
                          <Pencil className="h-4 w-4 text-text-muted" />
                          <span>Rename</span>
                        </button>
                      ) : null}
                      {onDeleteWorkspace ? (
                        <button
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-error transition-colors hover:bg-error/10"
                          onClick={() => {
                            setWorkspaceMenuId(null);
                            void onDeleteWorkspace(ws);
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
