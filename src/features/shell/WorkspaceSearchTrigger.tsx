import { Search } from "lucide-react";

type WorkspaceSearchTriggerProps = {
  collapsed: boolean;
  darkSidebar: boolean;
  disabled?: boolean;
  onOpen: () => boolean | void;
  sidebarButtonBase: string;
};

export function WorkspaceSearchTrigger({
  collapsed,
  darkSidebar,
  disabled = false,
  onOpen,
  sidebarButtonBase,
}: WorkspaceSearchTriggerProps) {
  if (collapsed) {
    return (
      <div className="px-3 py-2">
        <button
          aria-label="Search"
          className={`flex w-full items-center justify-center rounded-xl p-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sidebarButtonBase}`}
          disabled={disabled}
          onClick={() => void onOpen()}
          title="Search"
          type="button"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <button
        className={[
          "relative h-10 w-full rounded-xl border text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60",
          darkSidebar
            ? "border-sidebar-soft bg-sidebar-soft text-text-inverse"
            : "border-border-subtle bg-canvas-accent text-text-medium hover:border-border-strong hover:text-text-strong",
        ].join(" ")}
        disabled={disabled}
        onClick={() => void onOpen()}
        type="button"
      >
        <Search
          className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
        />
        <span
          className={`block pl-9 pr-14 ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
        >
          Search…
        </span>
        <div
          className={`pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 font-mono text-xs ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
        >
          <span>⌘</span>
          <span>K</span>
        </div>
      </button>
    </div>
  );
}
