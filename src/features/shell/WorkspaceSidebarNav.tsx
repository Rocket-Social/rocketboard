import {
  Bot,
  FileText,
  Inbox,
  type LucideIcon,
} from "lucide-react";

type SidebarItem = {
  id: "ai-agents" | "inbox" | "notes";
  icon: LucideIcon;
  label: string;
};

const sidebarItems: SidebarItem[] = [
  { icon: Inbox, id: "inbox", label: "Inbox" },
  { icon: Bot, id: "ai-agents", label: "AI Agents" },
  { icon: FileText, id: "notes", label: "My Notes" },
];

type WorkspaceSidebarNavProps = {
  activeItem?: SidebarItem["id"];
  darkSidebar: boolean;
  inboxUnreadCount?: number;
  onPrefetch?: (itemId: SidebarItem["id"]) => void;
  onSelect: (itemId: SidebarItem["id"]) => void;
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
};

function formatBadgeCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export function WorkspaceSidebarNav({
  activeItem,
  darkSidebar,
  inboxUnreadCount,
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
        const showBadge =
          item.id === "inbox" && typeof inboxUnreadCount === "number" && inboxUnreadCount > 0;

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
            data-testid={item.id === "inbox" ? "sidebar-inbox-link" : undefined}
            key={item.id}
            onFocus={() => onPrefetch?.(item.id)}
            onMouseEnter={() => onPrefetch?.(item.id)}
            onPointerDown={() => onPrefetch?.(item.id)}
            onTouchStart={() => onPrefetch?.(item.id)}
            onClick={() => onSelect(item.id)}
            title={sidebarCollapsed ? item.label : undefined}
            type="button"
          >
            <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              <Icon className="h-4 w-4" />
              {sidebarCollapsed && showBadge ? (
                <span
                  aria-label={`${formatBadgeCount(inboxUnreadCount as number)} unread`}
                  className="absolute -right-1.5 -top-1 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-text-inverse"
                  data-testid="sidebar-inbox-badge"
                >
                  {formatBadgeCount(inboxUnreadCount as number)}
                </span>
              ) : null}
            </div>
            {!sidebarCollapsed ? (
              <>
                <span>{item.label}</span>
                {showBadge ? (
                  <span
                    aria-label={`${formatBadgeCount(inboxUnreadCount as number)} unread`}
                    className="ml-auto inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-text-inverse"
                    data-testid="sidebar-inbox-badge"
                  >
                    {formatBadgeCount(inboxUnreadCount as number)}
                  </span>
                ) : null}
              </>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
