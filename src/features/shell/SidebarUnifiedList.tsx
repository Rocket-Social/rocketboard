import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Calendar,
  LayoutGrid,
  Lock,
  Rocket,
} from "lucide-react";

import { cn } from "../../lib/cn";
import type { InitiativeRecord } from "../initiatives/initiative.types";
import type { PlanRecord } from "../plans/plan.types";
import type { WorkspaceProjectSummary } from "../projects/project-shell.types";
import { SidebarAddMenu } from "./SidebarAddMenu";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { SidebarSortableList } from "./SidebarSortableList";
import {
  mergeSidebarItems,
  toSidebarOrderEntries,
  type SidebarItem,
} from "./sidebar-ordering";
import {
  sidebarOrderQueryOptions,
  useReorderSidebarItemsMutation,
} from "./sidebar-ordering.queries";
import type { PlanViewType } from "../plans/plan.types";

type SidebarUnifiedListProps = {
  activeItemId?: string | null;
  darkSidebar: boolean;
  headerRef?: (node: HTMLDivElement | null) => void;
  headerStickyTop?: number;
  initiatives: InitiativeRecord[];
  onClickInitiative: (initiative: InitiativeRecord) => void;
  onClickPlan: (plan: PlanRecord) => void;
  onClickProject: (project: WorkspaceProjectSummary) => void;
  onPrefetchInitiative?: (initiative: InitiativeRecord) => void;
  onPrefetchPlan?: (plan: PlanRecord) => void;
  onPrefetchProject?: (project: WorkspaceProjectSummary) => void;
  onCreateInitiative: () => void;
  onCreatePlan: (defaultViewType: PlanViewType) => void;
  onCreateProject: () => void;
  plans: PlanRecord[];
  projects: WorkspaceProjectSummary[];
  renderItemMenu?: (item: SidebarItem) => React.ReactNode;
  sidebarButtonBase: string;
  stickySurfaceClassName?: string;
  workspaceId: string;
};

function getPlanIcon(plan: PlanRecord) {
  const viewTypes = plan.views.map((v) => v.viewType);
  if (viewTypes.includes("releases")) return Rocket;
  if (viewTypes.includes("scorecard")) return BarChart3;
  return Calendar;
}

export function SidebarUnifiedList({
  activeItemId = null,
  darkSidebar,
  headerRef,
  headerStickyTop = 0,
  initiatives,
  onClickInitiative,
  onClickPlan,
  onClickProject,
  onPrefetchInitiative,
  onPrefetchPlan,
  onPrefetchProject,
  onCreateInitiative,
  onCreatePlan,
  onCreateProject,
  plans,
  projects,
  renderItemMenu,
  sidebarButtonBase,
  stickySurfaceClassName = "",
  workspaceId,
}: SidebarUnifiedListProps) {
  const sidebarOrderQuery = useQuery(sidebarOrderQueryOptions(workspaceId));
  const savedOrder = sidebarOrderQuery.data ?? [];
  const reorderMutation = useReorderSidebarItemsMutation(workspaceId);

  const mergedItems = mergeSidebarItems(savedOrder, projects, plans, initiatives);

  const handleReorder = (orderedIds: string[]) => {
    // Map ordered IDs back to SidebarOrderEntries
    const idToItem = new Map(mergedItems.map((item) => [`${item.type}:${item.id}`, item]));
    const reorderedItems: SidebarItem[] = [];
    for (const compositeId of orderedIds) {
      const item = idToItem.get(compositeId);
      if (item) reorderedItems.push(item);
    }
    reorderMutation.mutate(toSidebarOrderEntries(reorderedItems));
  };

  const handleClick = (item: SidebarItem) => {
    switch (item.type) {
      case "project":
        onClickProject(item.data);
        break;
      case "plan":
        onClickPlan(item.data);
        break;
      case "initiative":
        onClickInitiative(item.data);
        break;
    }
  };

  const handlePrefetch = (item: SidebarItem) => {
    switch (item.type) {
      case "project":
        onPrefetchProject?.(item.data);
        break;
      case "plan":
        onPrefetchPlan?.(item.data);
        break;
      case "initiative":
        onPrefetchInitiative?.(item.data);
        break;
    }
  };

  return (
    <div className="px-4 pb-4">
      <div
        className={`sticky z-30 -mx-4 px-4 py-2 ${stickySurfaceClassName}`}
        ref={headerRef}
        style={{ top: headerStickyTop }}
      >
        <SidebarSectionHeader
          action={(
            <SidebarAddMenu
              onCreateInitiative={onCreateInitiative}
              onCreatePlan={onCreatePlan}
              onCreateProject={onCreateProject}
              sidebarButtonBase={sidebarButtonBase}
            />
          )}
          darkSidebar={darkSidebar}
          title="Projects"
        />
      </div>
      <SidebarSortableList
        activeItemId={activeItemId}
        getId={(item) => `${item.type}:${item.id}`}
        items={mergedItems}
        onReorder={handleReorder}
        renderItem={(item, { isActive, isDragging }) => (
          <SidebarUnifiedRow
            darkSidebar={darkSidebar}
            isActive={isActive}
            isDragging={isDragging}
            item={item}
            menu={renderItemMenu?.(item)}
            onClick={() => handleClick(item)}
            onPrefetch={() => handlePrefetch(item)}
          />
        )}
      />
    </div>
  );
}

// ── Row renderer ───────────────────────────────────────────────────

type SidebarUnifiedRowProps = {
  darkSidebar: boolean;
  isActive: boolean;
  isDragging: boolean;
  item: SidebarItem;
  menu?: React.ReactNode;
  onClick: () => void;
  onPrefetch?: () => void;
};

function SidebarUnifiedRow({
  darkSidebar,
  isActive,
  isDragging,
  item,
  menu,
  onClick,
  onPrefetch,
}: SidebarUnifiedRowProps) {
  const hasMenu = Boolean(menu);
  const hasPrivateLock = item.type === "project" && item.data.access === "private";
  const hasTrailingSlot = hasMenu || hasPrivateLock;

  return (
    <div
      className={cn(
        "group relative flex w-full select-none items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-[background-color,color,box-shadow,opacity,transform] motion-reduce:transition-none",
        hasTrailingSlot && "pr-11",
        isActive
          ? darkSidebar
            ? "bg-sidebar-soft text-text-inverse"
            : "bg-canvas-accent text-text-strong"
          : darkSidebar
            ? "text-text-inverse-muted hover:bg-sidebar-soft hover:text-text-inverse"
            : "text-text-medium hover:bg-canvas-accent hover:text-text-strong",
        isDragging && "z-10 opacity-80 shadow-[0_16px_32px_rgba(15,23,42,0.28)]",
      )}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
      onClick={onClick}
    >
      <SidebarItemIcon item={item} />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {hasPrivateLock ? (
        <span
          className={cn(
            "pointer-events-none absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center transition-opacity",
            hasMenu && "group-hover:opacity-0 group-focus-within:opacity-0",
          )}
        >
          <Lock
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 ${darkSidebar ? "text-text-inverse-muted" : "text-text-muted"}`}
          />
        </span>
      ) : null}
      {hasMenu ? (
        <div className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center">
          {menu}
        </div>
      ) : null}
    </div>
  );
}

function SidebarItemIcon({
  item,
}: {
  item: SidebarItem;
}) {
  if (item.type === "project") {
    return <span>{item.data.icon}</span>;
  }

  if (item.type === "initiative") {
    return <LayoutGrid className="h-4 w-4 shrink-0" />;
  }

  // Plan — pick icon based on primary view type
  const PlanIcon = getPlanIcon(item.data);
  return <PlanIcon className="h-4 w-4 shrink-0" />;
}
