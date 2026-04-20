import {
  Archive,
  Copy,
  ExternalLink,
  Link,
  MoreHorizontal,
  Pencil,
  Star,
  StarOff,
  Trash2,
  UserPlus,
} from "lucide-react";
import { memo, useState, type MouseEvent } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

type SidebarProjectMenuProps = {
  darkSidebar: boolean;
  onArchive?: () => void;
  onCopyLink: () => void;
  onDelete?: () => void;
  onDuplicate: () => void;
  onInvite?: () => void;
  onOpenInNewTab: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  isFavorite?: boolean;
};

export const SidebarProjectMenu = memo(function SidebarProjectMenu({
  darkSidebar,
  onArchive,
  onCopyLink,
  onDelete,
  onDuplicate,
  onInvite,
  onOpenInNewTab,
  onRename,
  onToggleFavorite,
  isFavorite = false,
}: SidebarProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const handleMenuItemClick = (action: () => void) =>
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      action();
    };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Menu"
          className={`shrink-0 rounded-lg p-1 transition-all ${
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } ${
            darkSidebar
              ? "text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse"
              : "text-text-muted hover:bg-canvas-accent hover:text-text-strong"
          }`}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          type="button"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" side="right">
        <DropdownMenuItem onClick={handleMenuItemClick(onOpenInNewTab)}>
          <ExternalLink className="h-4 w-4" />
          <span>Open</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMenuItemClick(onCopyLink)}>
          <Link className="h-4 w-4" />
          <span>Copy</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMenuItemClick(onRename)}>
          <Pencil className="h-4 w-4" />
          <span>Rename</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMenuItemClick(onToggleFavorite)}>
          {isFavorite ? (
            <StarOff className="h-4 w-4" />
          ) : (
            <Star className="h-4 w-4" />
          )}
          <span>
            {isFavorite ? "Unfavorite" : "Favorite"}
          </span>
        </DropdownMenuItem>
        {onInvite ? (
          <DropdownMenuItem onClick={handleMenuItemClick(onInvite)}>
            <UserPlus className="h-4 w-4" />
            <span>Invite</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleMenuItemClick(onDuplicate)}>
          <Copy className="h-4 w-4" />
          <span>Duplicate</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {onArchive ? (
          <DropdownMenuItem
            className="text-error focus:text-error"
            onClick={handleMenuItemClick(onArchive)}
          >
            <Archive className="h-4 w-4" />
            <span>Archive</span>
          </DropdownMenuItem>
        ) : onDelete ? (
          <DropdownMenuItem
            className="text-error focus:text-error"
            onClick={handleMenuItemClick(onDelete)}
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
