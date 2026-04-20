import {
  Bot,
  FileText,
  type LucideIcon,
} from "lucide-react";

type SidebarItem = {
  id: "ai-agents" | "notes";
  icon: LucideIcon;
  label: string;
};

const sidebarItems: SidebarItem[] = [
  { icon: Bot, id: "ai-agents", label: "AI Agents" },
  { icon: FileText, id: "notes", label: "My Notes" },
];

type WorkspaceSidebarNavProps = {
  activeItem?: SidebarItem["id"];
  darkSidebar: boolean;
  onPrefetch?: (itemId: SidebarItem["id"]) => void;
  onSelect: (itemId: SidebarItem["id"]) => void;
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
};

export function WorkspaceSidebarNav({
  activeItem,
  darkSidebar,
  onPrefetch,
  onSelect,
  sidebarButtonBase,
  sidebarCollapsed,
}: WorkspaceSidebarNavProps) {
  return (
    <nav className="space-y-1.5 px-3 py-2">
      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeItem;

        return (
          <button
            className={[
              "flex w-full items-center rounded-xl text-sm font-medium transition-all",
              sidebarCollapsed
                ? "justify-center px-2 py-2.5"
                : "gap-3 px-3 py-2",
              isActive
                ? darkSidebar
                  ? "bg-sidebar-soft text-text-inverse"
                  : "bg-canvas-accent text-text-strong"
                : sidebarButtonBase,
            ].join(" ")}
            key={item.id}
            onFocus={() => onPrefetch?.(item.id)}
            onMouseEnter={() => onPrefetch?.(item.id)}
            onPointerDown={() => onPrefetch?.(item.id)}
            onTouchStart={() => onPrefetch?.(item.id)}
            onClick={() => onSelect(item.id)}
            title={sidebarCollapsed ? item.label : undefined}
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed ? <span>{item.label}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
