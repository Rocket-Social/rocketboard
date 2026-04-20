import {
  BookOpen,
  FileSearch,
  FileText,
  Folder,
  Search,
  SquareKanban,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "../../components/ui/input";
import { getProjectViewCapability } from "../shell/project-view-capabilities";
import { parseSnippet } from "./snippet-parser";
import { useWorkspaceSearchQuery } from "./workspace-search.queries";
import { useSearchWikiPagesQuery } from "../wiki/wiki.queries";
import type {
  WorkspaceSearchCardHit,
  WorkspaceSearchDocumentHit,
} from "./workspace-search.types";
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "../projects/project-shell.types";

type PaletteSelectionHandler = () => boolean | void | Promise<boolean | void>;

type PaletteItem = {
  description: string;
  icon: LucideIcon;
  id: string;
  keywords: string[];
  label: string;
  meta?: string;
  onSelect: PaletteSelectionHandler;
  snippet?: string;
};

export type WorkspacePaletteCommand = PaletteItem;

type PaletteSection = {
  id: string;
  label: string;
  items: PaletteItem[];
};

type IndexedPaletteItem = PaletteItem & {
  index: number;
};

type IndexedPaletteSection = {
  id: string;
  items: IndexedPaletteItem[];
  label: string;
};

export type WikiSearchHit = {
  fullPath: string;
  id: string;
  parentPageId: string | null;
  projectId: string | null;
  slug: string;
  snippet: string;
  title: string;
};

type WorkspaceCommandPaletteProps = {
  activeViewId?: string;
  commands?: WorkspacePaletteCommand[];
  currentProject?: WorkspaceProjectSummary | null;
  currentWorkspace: WorkspaceSummary;
  isOpen: boolean;
  onClose: () => void;
  onOpenProject: (
    projectSlug: string,
    preferredView?: string,
    workspaceSlug?: string,
  ) => boolean | void | Promise<boolean | void>;
  onOpenSearchCard: (hit: WorkspaceSearchCardHit) => boolean | void | Promise<boolean | void>;
  onOpenSearchDocument: (hit: WorkspaceSearchDocumentHit) => boolean | void | Promise<boolean | void>;
  onOpenWikiPage?: (hit: WikiSearchHit) => boolean | void | Promise<boolean | void>;
  onOpenWorkspace: (workspaceSlug: string) => boolean | void | Promise<boolean | void>;
  organizationId?: string;
  workspaces: WorkspaceSummary[];
};

function filterPaletteItems(items: PaletteItem[], normalizedQuery: string) {
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) =>
    [item.label, item.description, item.meta ?? "", ...item.keywords]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

function buildIndexedSections(sections: PaletteSection[]) {
  let index = 0;

  return sections
    .filter((section) => section.items.length > 0)
    .map<IndexedPaletteSection>((section) => ({
      id: section.id,
      items: section.items.map((item) => ({
        ...item,
        index: index++,
      })),
      label: section.label,
    }));
}

export function WorkspaceCommandPalette({
  activeViewId,
  commands = [],
  currentProject,
  currentWorkspace,
  isOpen,
  onClose,
  onOpenProject,
  onOpenSearchCard,
  onOpenSearchDocument,
  onOpenWikiPage,
  onOpenWorkspace,
  organizationId,
  workspaces,
}: WorkspaceCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const prevModeRef = useRef(false);
  const [modeChangeAnnouncement, setModeChangeAnnouncement] = useState("");

  // Derive mode from raw query for instant visual switch
  const isCommandMode = query.trimStart().startsWith(">");

  // Mode-aware query extraction from deferredQuery
  const trimmedDeferred = deferredQuery.trimStart();
  const isCommandModeDeferred = trimmedDeferred.startsWith(">");
  const commandQuery = isCommandModeDeferred
    ? trimmedDeferred.slice(1).trim()
    : "";
  const searchQuery = isCommandModeDeferred ? "" : deferredQuery.trim();
  const normalizedQuery = (
    isCommandModeDeferred ? commandQuery : searchQuery
  ).toLowerCase();

  const activeProjectView =
    currentProject?.projectViews.find((view) => view.id === activeViewId) ??
    currentProject?.projectViews.find(
      (view) => view.id === currentProject.defaultProjectViewId,
    ) ??
    currentProject?.projectViews[0];
  const activeProjectViewType = activeProjectView?.viewType;
  const shouldSearch =
    isOpen && !isCommandModeDeferred && searchQuery.length >= 2;
  const workspaceSearchQuery = useWorkspaceSearchQuery(
    searchQuery,
    shouldSearch,
  );
  const wikiSearchQuery = useSearchWikiPagesQuery(
    shouldSearch ? organizationId : undefined,
    searchQuery,
  );

  const quickActions = useMemo(
    () => filterPaletteItems(commands, normalizedQuery),
    [commands, normalizedQuery],
  );

  const viewItems = useMemo(() => {
    if (!currentProject) {
      return [];
    }

    const items = currentProject.projectViews
      .filter((view) => !view.isHidden)
      .map<PaletteItem>((view) => {
        const capability = getProjectViewCapability(view.viewType);

        return {
          description: `Switch the current project to ${capability.label.toLowerCase()}.`,
          icon: capability.icon,
          id: `view-${view.id}`,
          keywords: [view.viewType, view.name, "board", "navigate"],
          label: view.name,
          meta: view.id === activeViewId ? "Current" : undefined,
          onSelect: () => onOpenProject(currentProject.slug, view.id),
        };
      });

    return filterPaletteItems(items, normalizedQuery);
  }, [activeViewId, currentProject, normalizedQuery, onOpenProject]);

  const projectItems = useMemo(() => {
    const items = workspaces.flatMap((workspace) =>
      workspace.projects.map<PaletteItem>((project) => ({
        description: `${workspace.name} · Project · ${project.taskCount} tasks · ${project.memberCount} contributors`,
        icon: SquareKanban,
        id: `project-${workspace.slug}-${project.slug}`,
        keywords: [
          workspace.name,
          workspace.slug,
          project.slug,
          project.access,
          "project",
        ],
        label: project.name,
        meta:
          workspace.slug === currentWorkspace.slug &&
          project.slug === currentProject?.slug
            ? "Current project"
            : workspace.name,
        onSelect: () =>
          onOpenProject(
            project.slug,
            activeProjectViewType ?? project.defaultProjectViewId,
            workspace.slug,
          ),
      })),
    );

    return filterPaletteItems(items, normalizedQuery);
  }, [
    activeProjectViewType,
    currentProject?.slug,
    currentWorkspace.slug,
    normalizedQuery,
    onOpenProject,
    workspaces,
  ]);

  const workspaceItems = useMemo(() => {
    const items = workspaces.map<PaletteItem>((workspace) => ({
      description: `${workspace.projects.length} projects`,
      icon: Folder,
      id: `workspace-${workspace.slug}`,
      keywords: [workspace.slug, workspace.colorToken, "workspace"],
      label: workspace.name,
      meta:
        workspace.slug === currentWorkspace.slug
          ? "Current workspace"
          : undefined,
      onSelect: () => onOpenWorkspace(workspace.slug),
    }));

    return filterPaletteItems(items, normalizedQuery);
  }, [currentWorkspace.slug, normalizedQuery, onOpenWorkspace, workspaces]);

  const cardSearchItems = useMemo(() => {
    const items = (workspaceSearchQuery.data?.cards ?? []).map<PaletteItem>(
      (hit) => ({
        description: `${hit.workspaceName} · ${hit.projectName} · ${hit.snippet}`,
        icon: SquareKanban,
        id: `card-${hit.cardId}`,
        keywords: [
          hit.workspaceName,
          hit.workspaceSlug,
          hit.projectName,
          hit.projectSlug,
          hit.statusOptionId ?? "",
          hit.cardRef ?? "",
        ],
        label: hit.title,
        meta: hit.cardRef
          ? `${hit.cardRef} · ${hit.workspaceName} · ${hit.projectName}`
          : `${hit.workspaceName} · ${hit.projectName}`,
        onSelect: () => onOpenSearchCard(hit),
        snippet: hit.snippet,
      }),
    );

    return items;
  }, [onOpenSearchCard, workspaceSearchQuery.data?.cards]);

  const documentSearchItems = useMemo(() => {
    const items = (workspaceSearchQuery.data?.documents ?? []).map<PaletteItem>(
      (hit) => ({
        description: `${hit.workspaceName} · ${hit.projectName} · ${hit.source === "comment" ? "Comment hit" : "Document"} · ${hit.snippet}`,
        icon: hit.source === "comment" ? FileSearch : FileText,
        id: `document-${hit.documentId}-${hit.source}-${hit.rank}`,
        keywords: [
          hit.workspaceName,
          hit.workspaceSlug,
          hit.projectName,
          hit.projectSlug,
          hit.projectViewId,
          hit.source,
        ],
        label: hit.title,
        meta: `${hit.workspaceName} · ${hit.projectName}`,
        onSelect: () => onOpenSearchDocument(hit),
        snippet: hit.snippet,
      }),
    );

    return items;
  }, [onOpenSearchDocument, workspaceSearchQuery.data?.documents]);

  const wikiItems = useMemo(() => {
    if (!onOpenWikiPage) return [];
    const results = wikiSearchQuery.data ?? [];

    return results.map<PaletteItem>((hit) => ({
      description: hit.contentSnippet || "Wiki page",
      icon: BookOpen,
      id: `wiki-${hit.id}`,
      keywords: [hit.slug, "wiki", "knowledge"],
      label: hit.title || "Untitled",
      meta: hit.projectId ? "Project page" : "Wiki",
      onSelect: () =>
        onOpenWikiPage({
          fullPath: hit.fullPath,
          id: hit.id,
          parentPageId: hit.parentPageId,
          projectId: hit.projectId,
          slug: hit.slug,
          snippet: hit.contentSnippet,
          title: hit.title,
        }),
      snippet: hit.contentSnippet,
    }));
  }, [onOpenWikiPage, wikiSearchQuery.data]);

  const indexedSections = useMemo(
    () =>
      buildIndexedSections(
        isCommandModeDeferred
          ? [{ id: "actions", items: quickActions, label: "Actions" }]
          : [
              {
                id: "wiki",
                items: normalizedQuery.length >= 2 ? wikiItems : [],
                label: "Wiki",
              },
              {
                id: "cards",
                items: normalizedQuery.length >= 2 ? cardSearchItems : [],
                label: "Cards",
              },
              {
                id: "documents",
                items: normalizedQuery.length >= 2 ? documentSearchItems : [],
                label: "Documents",
              },
              ...(currentProject
                ? [
                    {
                      id: "views",
                      items: viewItems,
                      label: "Current Project Boards",
                    },
                  ]
                : []),
              { id: "projects", items: projectItems, label: "Projects" },
              { id: "workspaces", items: workspaceItems, label: "Workspaces" },
            ],
      ),
    [
      cardSearchItems,
      currentProject,
      documentSearchItems,
      isCommandModeDeferred,
      normalizedQuery.length,
      projectItems,
      quickActions,
      viewItems,
      wikiItems,
      workspaceItems,
    ],
  );

  const flatItems = useMemo(
    () => indexedSections.flatMap((section) => section.items),
    [indexedSections],
  );

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      prevModeRef.current = false;
      setModeChangeAnnouncement("");
      return;
    }

    setSelectedIndex(flatItems.length > 0 ? 0 : -1);
  }, [flatItems.length, isOpen, normalizedQuery]);

  // Reset selectedIndex on mode switch and announce to screen readers
  useEffect(() => {
    if (prevModeRef.current !== isCommandModeDeferred) {
      prevModeRef.current = isCommandModeDeferred;
      setSelectedIndex(0);
      setModeChangeAnnouncement(
        isCommandModeDeferred ? "Command mode" : "Search mode",
      );
    }
  }, [isCommandModeDeferred]);

  if (!isOpen) {
    return null;
  }

  const errorMessage =
    workspaceSearchQuery.error instanceof Error
      ? workspaceSearchQuery.error.message
      : null;
  const showWorkspaceSearchStatus =
    !isCommandModeDeferred && normalizedQuery.length >= 2;
  const selectedItem = flatItems[selectedIndex] ?? null;
  const hasAnyItems = flatItems.length > 0;
  const HeaderIcon = isCommandMode ? Terminal : Search;
  const displayQuery = isCommandModeDeferred ? commandQuery : searchQuery;
  const hasConfiguredCommands = commands.length > 0;

  const handleSelect = (item: IndexedPaletteItem | null) => {
    if (!item) {
      return;
    }

    const result = item.onSelect();

    if (result !== false) {
      onClose();
    }
  };

  return (
    <>
      <button
        aria-label="Close command palette"
        className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label={isCommandMode ? "Commands" : "Search"}
        aria-modal="true"
        className="fixed left-1/2 top-[8vh] z-[80] w-[min(46rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-[32px] border border-border-subtle bg-surface-base shadow-float animate-in fade-in zoom-in-[0.97] duration-[120ms]"
        role="dialog"
      >
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-text-muted">
            <HeaderIcon className="h-3.5 w-3.5" />
            {isCommandMode ? "Workspace Command" : "Workspace Search"}
            <span className="rounded-full bg-canvas-accent px-2 py-1 font-mono text-[11px] tracking-normal text-text-medium">
              {currentWorkspace.name}
            </span>
          </div>

          <div className="relative mt-3">
            <HeaderIcon
              className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted ${showWorkspaceSearchStatus && workspaceSearchQuery.isFetching ? "animate-pulse" : ""}`}
            />
            <Input
              aria-activedescendant={
                selectedItem ? `palette-item-${selectedItem.id}` : undefined
              }
              aria-controls="palette-results"
              autoFocus
              className="h-12 rounded-2xl border-transparent bg-canvas-accent pl-10 pr-4 text-base"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedIndex((current) =>
                    flatItems.length === 0
                      ? -1
                      : current >= flatItems.length - 1
                        ? 0
                        : current + 1,
                  );
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedIndex((current) =>
                    flatItems.length === 0
                      ? -1
                      : current <= 0
                        ? flatItems.length - 1
                        : current - 1,
                  );
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSelect(selectedItem);
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  if (query) {
                    setQuery("");
                  } else {
                    onClose();
                  }
                }
              }}
              placeholder={
                isCommandMode
                  ? "Run a command\u2026"
                  : "Search cards, projects, and documents\u2026"
              }
              value={query}
            />
          </div>
        </div>

        {/* Screen reader mode announcement — only after a mode change, not on initial open */}
        <div aria-live="polite" className="sr-only">
          {modeChangeAnnouncement}
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
          {errorMessage && !isCommandModeDeferred ? (
            <div className="mb-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
              Workspace search could not be completed right now. {errorMessage}
            </div>
          ) : null}

          {!isCommandMode && !normalizedQuery && hasConfiguredCommands ? (
            <div
              className="mb-4 rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-muted"
              role="status"
            >
              Type{" "}
              <span className="font-mono font-medium text-text-medium">
                &gt;
              </span>{" "}
              for commands
            </div>
          ) : null}

          {!hasConfiguredCommands && isCommandModeDeferred ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-medium">
              No commands available in this context.
            </div>
          ) : null}

          {!hasAnyItems &&
          !isCommandModeDeferred &&
          normalizedQuery.length === 1 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-medium">
              Type one more character to search cards and documents across all
              accessible workspaces.
            </div>
          ) : null}

          {!hasAnyItems &&
          hasConfiguredCommands &&
          (isCommandModeDeferred
            ? normalizedQuery.length >= 1
            : normalizedQuery.length > 1) ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-medium">
              {isCommandModeDeferred ? (
                <>
                  No commands matched{" "}
                  <span className="font-medium text-text-strong">
                    "{displayQuery}"
                  </span>
                  .
                </>
              ) : (
                <>
                  No workspace content matched{" "}
                  <span className="font-medium text-text-strong">
                    "{displayQuery}"
                  </span>
                  .
                </>
              )}
            </div>
          ) : null}

          <div
            aria-label="Search results"
            className="space-y-4"
            id="palette-results"
            role="listbox"
          >
            {indexedSections.map((section) => (
              <section key={section.id}>
                <div
                  className="px-2 pb-2 font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted"
                  role="presentation"
                >
                  {section.label}
                </div>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isSelected = item.index === selectedIndex;

                    return (
                      <button
                        aria-selected={isSelected}
                        className={[
                          "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary-soft/60"
                            : "border-border-subtle bg-surface-elevated hover:border-border-strong hover:bg-surface-base",
                        ].join(" ")}
                        id={`palette-item-${item.id}`}
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(item.index)}
                        role="option"
                        type="button"
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-canvas-accent text-text-medium">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-text-strong">
                              {item.label}
                            </span>
                            {item.meta ? (
                              <span className="rounded-full bg-canvas-accent px-2 py-0.5 text-[11px] text-text-muted">
                                {item.meta}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-text-medium">
                            {item.snippet
                              ? parseSnippet(item.snippet)
                              : item.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
