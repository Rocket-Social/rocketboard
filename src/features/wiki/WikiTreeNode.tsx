import {
  ChevronRight,
  FileText,
  FolderClosed,
  FolderOpen,
  Plus,
} from "lucide-react";

import type { WikiPageTreeNode } from "./wiki.types";
import { getWikiPageDisplayTitle } from "./wiki.types";

export type WikiTreeNodeProps = {
  activePageId: string | null;
  darkSidebar: boolean;
  depth: number;
  expandedFolders: Set<string>;
  maxDepth: number;
  node: WikiPageTreeNode;
  onContextMenu?: (e: React.MouseEvent, node: WikiPageTreeNode) => void;
  onCreateSubPage?: (parentPageId: string) => void;
  onSelect: (pageId: string, slug: string) => void;
  onToggle: (pageId: string) => void;
  sidebarButtonBase: string;
};

export function WikiTreeNode({
  activePageId,
  darkSidebar,
  depth,
  expandedFolders,
  maxDepth,
  node,
  onContextMenu,
  onCreateSubPage,
  onSelect,
  onToggle,
  sidebarButtonBase,
}: WikiTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolders.has(node.id);
  const isActive = node.id === activePageId;
  const treeGutterClassName = "flex h-4 w-4 shrink-0 items-center justify-center";
  const rowIndentPx = `${depth * 16}px`;
  const rowGridStyle = {
    gridTemplateColumns: "1rem minmax(0,1fr)",
    paddingLeft: rowIndentPx,
  };
  const pageButtonClassName = `grid min-w-0 w-full grid-cols-[1rem,minmax(0,1fr)] items-center gap-x-2 rounded-xl px-2 py-1.5 text-left text-sm font-medium transition-all ${
    isActive
      ? darkSidebar
        ? "bg-sidebar-soft text-text-inverse"
        : "bg-canvas-accent text-text-strong"
      : sidebarButtonBase
  }`;

  const showChildren = hasChildren && isExpanded && depth < maxDepth;

  const FolderIcon = isExpanded ? FolderOpen : FolderClosed;

  // At max depth, show a "view nested" link instead of recursing deeper
  if (depth >= maxDepth) {
    return (
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: "1rem minmax(0,1fr)",
          paddingLeft: `${depth * 16}px`,
        }}
      >
        <div aria-hidden className={treeGutterClassName} />
        <button
          className={`grid min-w-0 w-full grid-cols-[1rem,minmax(0,1fr)] items-center gap-x-2 rounded-xl px-2 py-1.5 text-left text-xs italic transition-all ${sidebarButtonBase}`}
          onClick={() => onSelect(node.id, node.slug)}
          type="button"
        >
          <div aria-hidden className={treeGutterClassName} />
          <span className="truncate">View nested pages...</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className="group relative grid items-center"
        onContextMenu={
          onContextMenu ? (e) => onContextMenu(e, node) : undefined
        }
        style={rowGridStyle}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            className={`${treeGutterClassName} rounded transition-colors ${sidebarButtonBase}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            type="button"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <div aria-hidden className={treeGutterClassName} />
        )}

        {/* Page button */}
        <button
          className={pageButtonClassName}
          onClick={() => onSelect(node.id, node.slug)}
          type="button"
        >
          <span aria-hidden className={treeGutterClassName}>
            {hasChildren ? (
              <FolderIcon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            )}
          </span>
          <span className="truncate">
            {node.icon ? `${node.icon} ` : ""}
            {getWikiPageDisplayTitle(node)}
          </span>
        </button>

        {/* Hover-reveal "+" to create sub-page */}
        {onCreateSubPage ? (
          <button
            aria-label={`Create sub-page under ${getWikiPageDisplayTitle(node)}`}
            className={`absolute right-1 shrink-0 rounded p-0.5 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 ${sidebarButtonBase}`}
            onClick={(e) => {
              e.stopPropagation();
              onCreateSubPage(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onCreateSubPage(node.id);
              }
            }}
            tabIndex={0}
            type="button"
          >
            <Plus className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {/* Children */}
      {showChildren
        ? node.children.map((child) => (
            <WikiTreeNode
              key={child.id}
              activePageId={activePageId}
              darkSidebar={darkSidebar}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              maxDepth={maxDepth}
              node={child}
              onContextMenu={onContextMenu}
              onCreateSubPage={onCreateSubPage}
              onSelect={onSelect}
              onToggle={onToggle}
              sidebarButtonBase={sidebarButtonBase}
            />
          ))
        : null}
    </div>
  );
}
