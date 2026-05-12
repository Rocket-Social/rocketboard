import { FilePlus, Link, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type WikiPageContextMenuProps = {
  isOpen: boolean;
  isPinned: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onCreateSubPage: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  position: { x: number; y: number };
};

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-medium transition-colors hover:bg-canvas-accent";

export function WikiPageContextMenu({
  isOpen,
  isPinned,
  onClose,
  onCopyLink,
  onCreateSubPage,
  onDelete,
  onTogglePin,
  position,
}: WikiPageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clampedPosition, setClampedPosition] = useState(position);

  // Clamp position so menu doesn't overflow viewport
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const padding = 8;
    let x = position.x;
    let y = position.y;

    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - rect.width - padding;
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    setClampedPosition({ x, y });
  }, [isOpen, position]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // Delay to avoid immediate close from the right-click event
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-xl border border-border-subtle bg-surface-elevated p-1.5 shadow-elevated"
      style={{ left: clampedPosition.x, top: clampedPosition.y }}
    >
      <button
        className={menuItemClass}
        onClick={() => {
          onCreateSubPage();
          onClose();
        }}
        type="button"
      >
        <FilePlus className="h-4 w-4 text-text-muted" />
        <span>Add sub-page</span>
      </button>

      <button
        className={menuItemClass}
        onClick={() => {
          onTogglePin();
          onClose();
        }}
        type="button"
      >
        {isPinned ? (
          <>
            <PinOff className="h-4 w-4 text-text-muted" />
            <span>Unpin</span>
          </>
        ) : (
          <>
            <Pin className="h-4 w-4 text-text-muted" />
            <span>Pin to sidebar</span>
          </>
        )}
      </button>

      <button
        className={menuItemClass}
        onClick={() => {
          onCopyLink();
          onClose();
        }}
        type="button"
      >
        <Link className="h-4 w-4 text-text-muted" />
        <span>Copy link</span>
      </button>

      {/* Divider */}
      <div className="my-1 h-px bg-border-subtle" />

      <button
        className={`${menuItemClass} text-error hover:bg-error/10`}
        onClick={() => {
          onDelete();
          onClose();
        }}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
        <span>Delete</span>
      </button>
    </div>,
    document.body,
  );
}
