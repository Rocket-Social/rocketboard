import {
  Clock,
  FileText,
  Pin,
  Plus,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  buildWikiPagePath,
  type WikiPageListItem,
  type WikiPinnedPageWithMetadata,
} from "./wiki.types";
import { getRecentViews, pruneRecentViews } from "./wiki-recent-viewed";

type WikiSidebarSectionProps = {
  activePageId: string | null;
  accessiblePages: WikiPageListItem[];
  accessiblePagesLoaded: boolean;
  darkSidebar: boolean;
  onAllPages: () => void;
  onCreatePage: () => void;
  onPrefetchAllPages?: () => void;
  onPrefetchPage?: (pageId: string, fullPath: string) => void;
  onSelectPage: (pageId: string, fullPath: string) => void;
  orgId: string;
  pinnedPages: WikiPinnedPageWithMetadata[];
  sidebarButtonBase: string;
  sidebarCollapsed: boolean;
};

export function WikiSidebarSection({
  activePageId,
  accessiblePages,
  accessiblePagesLoaded,
  darkSidebar,
  onAllPages,
  onCreatePage,
  onPrefetchAllPages,
  onPrefetchPage,
  onSelectPage,
  orgId,
  pinnedPages,
  sidebarButtonBase,
  sidebarCollapsed,
}: WikiSidebarSectionProps) {
  // Get recently viewed, excluding pinned pages (dedup)
  const pinnedIds = useMemo(
    () => pinnedPages.map((p) => p.pageId),
    [pinnedPages],
  );
  const accessiblePagesById = useMemo(() => {
    const pageMap = new Map<string, WikiPageListItem>();

    for (const page of accessiblePages) {
      pageMap.set(page.id, page);
    }

    return pageMap;
  }, [accessiblePages]);
  const accessiblePageIdSet = useMemo(
    () => new Set(accessiblePagesById.keys()),
    [accessiblePagesById],
  );
  useEffect(() => {
    if (!accessiblePagesLoaded) return;
    pruneRecentViews(orgId, accessiblePageIdSet);
  }, [accessiblePageIdSet, accessiblePagesLoaded, orgId]);
  const recentPages = useMemo(
    () =>
      accessiblePagesLoaded
        ? getRecentViews(orgId, pinnedIds).flatMap((entry) => {
            const page = accessiblePagesById.get(entry.id);
            return page
              ? [{
                  fullPath: buildWikiPagePath(page, accessiblePages),
                  icon: page.icon,
                  id: page.id,
                  title: page.title,
                }]
              : [];
          })
        : [],
    [accessiblePages, accessiblePagesById, accessiblePagesLoaded, orgId, pinnedIds],
  );

  if (sidebarCollapsed) {
    return (
      <div className="px-3 py-2">
        <button
          className={`flex w-full justify-center rounded-xl p-2.5 ${sidebarButtonBase}`}
          onFocus={onPrefetchAllPages}
          onMouseEnter={onPrefetchAllPages}
          onClick={onAllPages}
          title="Wiki"
          type="button"
        >
          <FileText className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const sectionHeaderClass = `font-mono text-xs font-medium uppercase tracking-wider ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`;

  return (
    <div className="px-4 py-2">
      {/* Section header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className={sectionHeaderClass}>Wiki</span>
        <button
          aria-label="Create wiki page"
          className={sidebarButtonBase}
          onClick={onCreatePage}
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Pinned pages */}
      {pinnedPages.length > 0 ? (
        <div className="mb-1">
          {pinnedPages.map((page) => (
            <SidebarPageItem
              key={page.pageId}
              activePageId={activePageId}
              darkSidebar={darkSidebar}
              icon={<Pin className="h-3.5 w-3.5" />}
              onPrefetch={() => onPrefetchPage?.(page.pageId, page.fullPath)}
              onSelect={() => onSelectPage(page.pageId, page.fullPath)}
              pageIcon={page.icon}
              pageId={page.pageId}
              sidebarButtonBase={sidebarButtonBase}
              title={page.title}
            />
          ))}
        </div>
      ) : null}

      {/* Recently viewed */}
      {recentPages.length > 0 ? (
        <div className="mb-1">
          {recentPages.map((entry) => (
            <SidebarPageItem
              key={entry.id}
              activePageId={activePageId}
              darkSidebar={darkSidebar}
              icon={<Clock className="h-3.5 w-3.5" />}
              onPrefetch={() => onPrefetchPage?.(entry.id, entry.fullPath)}
              onSelect={() => onSelectPage(entry.id, entry.fullPath)}
              pageIcon={entry.icon}
              pageId={entry.id}
              sidebarButtonBase={sidebarButtonBase}
              title={entry.title}
            />
          ))}
        </div>
      ) : null}

      {/* All pages link */}
      <button
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors ${darkSidebar ? "text-text-inverse-muted hover:text-text-inverse" : "text-text-muted hover:text-text-strong"}`}
        onFocus={onPrefetchAllPages}
        onMouseEnter={onPrefetchAllPages}
        onClick={onAllPages}
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>All pages</span>
      </button>
    </div>
  );
}

// ── Sidebar item (for pinned + recent pages) ────────────────────────

type SidebarPageItemProps = {
  activePageId: string | null;
  darkSidebar: boolean;
  icon: React.ReactNode;
  onPrefetch?: () => void;
  onSelect: () => void;
  pageIcon: string | null;
  pageId: string;
  sidebarButtonBase: string;
  title: string;
};

function SidebarPageItem({
  activePageId,
  darkSidebar,
  icon,
  onPrefetch,
  onSelect,
  pageIcon,
  pageId,
  sidebarButtonBase,
  title,
}: SidebarPageItemProps) {
  const isActive = pageId === activePageId;
  const displayTitle = title.trim() || "Untitled";

  return (
    <button
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
        isActive
          ? darkSidebar
            ? "bg-sidebar-soft text-text-inverse"
            : "bg-canvas-accent text-text-strong"
          : sidebarButtonBase
      }`}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      onClick={onSelect}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">
        {pageIcon ? `${pageIcon} ` : ""}
        {displayTitle}
      </span>
    </button>
  );
}
