import { Bot, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AiChatDrawer } from "../ai/components/AiChatDrawer";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Input } from "../../components/ui/input";
import { useToast } from "../../components/ui/toast";
import { getErrorMessage } from "../../platform/data/rpc-adapter";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import {
  useWikiOrgPagesQuery,
  useWikiPinnedPagesWithMetadataQuery,
  useWikiRecentOrgPagesQuery,
  useSearchWikiPagesQuery,
  useCreateWikiPageMutation,
  useDeleteWikiPageMutation,
  usePinWikiPageMutation,
  useUnpinWikiPageMutation,
  wikiKeys,
} from "./wiki.queries";
import {
  buildWikiPageTree,
  buildWikiPagePath,
  formatWikiPageDate,
  getWikiPageDisplayTitle,
  type WikiPageTreeNode,
} from "./wiki.types";
import { markWikiNewPageForTitleFocus } from "./wiki-new-page-focus";
import { WikiTreeNode } from "./WikiTreeNode";
import { WikiPageContextMenu } from "./WikiPageContextMenu";
import {
  buildWikiIndexAiContext,
  WIKI_EMPTY_INDEX_PROMPTS,
  WIKI_INDEX_PROMPTS,
} from "./wiki-ai-context";
import { useIsDesktop } from "../shell/useIsDesktop";

type WikiIndexViewProps = {
  onNavigateToPage: (fullPath: string) => void;
  onPageCreated: (slug: string) => void;
  organizationId: string;
  userId: string;
};

type ContextMenuState = {
  node: WikiPageTreeNode;
  x: number;
  y: number;
} | null;

export function WikiIndexView({
  onNavigateToPage,
  onPageCreated,
  organizationId,
  userId,
}: WikiIndexViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [treeInitialized, setTreeInitialized] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  // Debounce search query by 250ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialogProps } = useConfirmDialog();
  const isDesktop = useIsDesktop();

  const pagesQuery = useWikiOrgPagesQuery(organizationId || undefined);
  const recentQuery = useWikiRecentOrgPagesQuery(organizationId || undefined);
  const pinnedQuery = useWikiPinnedPagesWithMetadataQuery(userId);
  const searchResultsQuery = useSearchWikiPagesQuery(organizationId || undefined, debouncedQuery);
  const createMutation = useCreateWikiPageMutation(organizationId);
  const deleteMutation = useDeleteWikiPageMutation(organizationId);
  const pinMutation = usePinWikiPageMutation(userId);
  const unpinMutation = useUnpinWikiPageMutation(userId);

  const pages = pagesQuery.data ?? [];
  const recentPages = recentQuery.data ?? [];
  const pinnedPages = pinnedQuery.data ?? [];
  const searchResults = searchResultsQuery.data ?? [];
  const pinnedPageIds = useMemo(
    () => pinnedPages.map((p) => p.pageId),
    [pinnedPages],
  );

  const tree = useMemo(() => buildWikiPageTree(pages), [pages]);
  const aiSurfaceContext = useMemo(
    () => buildWikiIndexAiContext({
      organizationId,
      pages,
      pinnedPages,
      recentPages,
    }),
    [organizationId, pages, pinnedPages, recentPages],
  );
  const aiSuggestedPrompts = pages.length === 0
    ? WIKI_EMPTY_INDEX_PROMPTS
    : WIKI_INDEX_PROMPTS;

  // Expand first level of tree on initial load
  useEffect(() => {
    if (tree.length > 0 && !treeInitialized) {
      setExpandedFolders(
        new Set(tree.filter((n) => n.children.length > 0).map((n) => n.id)),
      );
      setTreeInitialized(true);
    }
  }, [tree, treeInitialized]);

  const toggleFolder = useCallback((pageId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const handleCreatePage = useCallback(() => {
    if (createMutation.isPending) return;

    createMutation.mutate(
      { organizationId, title: "" },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(
              error,
              "Rocketboard could not create the page.",
            ),
            title: "Couldn't create page",
            variant: "error",
          });
        },
        onSuccess: (newPage) => {
          markWikiNewPageForTitleFocus(organizationId, newPage.id);
          onPageCreated(newPage.slug);
        },
      },
    );
  }, [createMutation, organizationId, onPageCreated, toast]);

  const handleCreateSubPage = useCallback(
    async (parentPageId: string) => {
      if (createMutation.isPending) return;

      createMutation.mutate(
        { organizationId, parentPageId },
        {
          onError: (error) =>
            toast({
              description: getErrorMessage(
                error,
                "Rocketboard could not create the page.",
              ),
              title: "Couldn't create page",
              variant: "error",
            }),
          onSuccess: async (newPage) => {
            markWikiNewPageForTitleFocus(organizationId, newPage.id);
            // Auto-expand the parent so the child is visible
            setExpandedFolders((prev) => new Set([...prev, parentPageId]));
            // Wait for pages list to refresh so route resolver can find the new page
            await queryClient.refetchQueries({
              queryKey: wikiKeys.orgPages(organizationId),
            });
            // Build full slug path for navigation
            const parentPage = pages.find((p) => p.id === parentPageId);
            if (parentPage) {
              const parentPath = buildWikiPagePath(parentPage, pages);
              onNavigateToPage(`${parentPath}/${newPage.slug}`);
            } else {
              onNavigateToPage(newPage.slug);
            }
          },
        },
      );
    },
    [createMutation, onNavigateToPage, organizationId, pages, queryClient, toast],
  );

  const handleSelectPage = useCallback(
    (pageId: string, slug: string) => {
      // Build full slug path from page hierarchy
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      const slugParts: string[] = [slug];
      let parentId = page.parentPageId;
      while (parentId) {
        const parent = pages.find((p) => p.id === parentId);
        if (!parent) break;
        slugParts.unshift(parent.slug);
        parentId = parent.parentPageId;
      }
      onNavigateToPage(slugParts.join("/"));
    },
    [pages, onNavigateToPage],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: WikiPageTreeNode) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    },
    [],
  );

  const handleContextMenuDelete = useCallback(async () => {
    if (!contextMenu) return;
    const targetPage = contextMenu.node;
    setContextMenu(null);

    if (
      !(await confirm({
        confirmLabel: "Delete",
        description:
          "This page and all its child pages will be moved to trash.",
        title: `Delete "${getWikiPageDisplayTitle(targetPage)}"?`,
        variant: "destructive",
      }))
    )
      return;

    deleteMutation.mutate(targetPage.id, {
      onError: () =>
        toast({ title: "Couldn't delete page", variant: "error" }),
    });
  }, [confirm, contextMenu, deleteMutation, toast]);

  const handleContextMenuCopyLink = useCallback(() => {
    if (!contextMenu) return;
    const targetPage = contextMenu.node;
    const fullPath = buildWikiPagePath(targetPage, pages);
    void navigator.clipboard.writeText(
      `${window.location.origin}/org/${organizationId}/wiki/${fullPath}`,
    );
    toast({ title: "Link copied" });
  }, [contextMenu, organizationId, pages, toast]);

  const handleContextMenuTogglePin = useCallback(() => {
    if (!contextMenu) return;
    const targetPageId = contextMenu.node.id;
    const isPinned = pinnedPageIds.includes(targetPageId);

    if (isPinned) {
      unpinMutation.mutate(targetPageId, {
        onError: () =>
          toast({ title: "Couldn't unpin page", variant: "error" }),
      });
    } else {
      pinMutation.mutate(targetPageId, {
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : "Couldn't pin page";
          toast({
            title: message.includes("Maximum") ? "Maximum 5 pins" : message,
            variant: "error",
          });
        },
      });
    }
  }, [contextMenu, pinMutation, pinnedPageIds, toast, unpinMutation]);

  const isSearching = searchQuery.length >= 2;
  const aiButton = (
    <Button
      aria-label="Ask AI"
      className={isDesktop ? "min-h-11" : "h-11 w-11 rounded-lg px-0"}
      onClick={() => setAiChatOpen(true)}
      title="Ask AI"
      variant="secondary"
    >
      <Bot className="h-4 w-4" />
      {isDesktop ? "AI" : null}
    </Button>
  );
  const aiDrawer = (
    <AiChatDrawer
      isOpen={aiChatOpen}
      onClose={() => setAiChatOpen(false)}
      organizationId={organizationId}
      suggestedPrompts={aiSuggestedPrompts}
      surface="wiki"
      surfaceContext={aiSurfaceContext}
      userId={userId}
    />
  );

  // Empty state — no wiki pages at all
  if (!pagesQuery.isPending && pages.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col p-6 lg:px-12 lg:py-6">
          <div className="mb-8 flex items-center justify-end gap-2">
            {aiButton}
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="mb-2 text-lg font-semibold text-text-strong">
                Start your team's Wiki
              </p>
              <p className="mb-6 text-sm text-text-muted">
                Document your team's knowledge so everyone can find answers without
                asking.
              </p>
              <Button
                className="min-h-11"
                disabled={createMutation.isPending}
                onClick={handleCreatePage}
                variant="primary"
              >
                Create first page
              </Button>
            </div>
          </div>
        </div>
        {aiDrawer}
      </>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-12">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-strong">Wiki</h1>
        <div className="flex items-center gap-2">
          {aiButton}
          <Button
            className="min-h-11"
            disabled={createMutation.isPending}
            onClick={handleCreatePage}
            variant="primary"
          >
            <Plus className="h-4 w-4" />
            New page
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          autoFocus
          className="pl-10"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search pages..."
          value={searchQuery}
        />
      </div>

      {/* Search results */}
      {isSearching ? (
        <div>
          <h2 className="mb-3 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
            Search Results
          </h2>
          {searchResultsQuery.isPending ? (
            <p className="text-sm text-text-muted">Searching...</p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-text-muted">No pages found for "{searchQuery}"</p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-text-strong transition-colors hover:bg-canvas-accent"
                  onClick={() => handleSelectPage(result.id, result.slug)}
                  type="button"
                >
                  <span className="truncate font-medium">{result.title || "Untitled"}</span>
                  {result.contentSnippet ? (
                    <span
                      className="ml-4 truncate text-xs text-text-muted"
                      dangerouslySetInnerHTML={{
                        __html: result.contentSnippet
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/\x01/g, "<mark>")
                          .replace(/\x02/g, "</mark>"),
                      }}
                    />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Pinned pages chips */}
          {pinnedPages.length > 0 ? (
            <div className="mb-6 flex flex-wrap gap-2">
              {pinnedPages.map((page) => (
                <button
                  key={page.pageId}
                  onClick={() => onNavigateToPage(page.fullPath)}
                  type="button"
                >
                  <Badge className="cursor-pointer border border-border-subtle px-3 py-1 text-sm font-medium text-text-strong transition-colors hover:bg-canvas-accent">
                    {page.icon ? `${page.icon} ` : ""}
                    {page.title.trim() || "Untitled"}
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}

          {/* Recently Updated — compact horizontal row */}
          {recentQuery.isPending ? null : recentPages.length > 0 ? (
            <div className="mb-6">
              <h2 className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
                Recently Updated
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {recentPages.slice(0, 5).map((page) => (
                  <button
                    key={page.id}
                    className="text-sm text-text-medium transition-colors hover:text-text-strong"
                    onClick={() => handleSelectPage(page.id, page.slug)}
                    type="button"
                  >
                    <span className="font-medium">
                      {getWikiPageDisplayTitle(page)}
                    </span>
                    <span className="ml-1.5 text-xs text-text-muted">
                      {formatWikiPageDate(page.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Page tree — full width, primary */}
          <div>
            <h2 className="mb-3 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
              Page Tree
            </h2>
            {pagesQuery.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-canvas-accent" />
                ))}
              </div>
            ) : (
              <div>
                {tree.map((node) => (
                  <WikiTreeNode
                    key={node.id}
                    activePageId={null}
                    darkSidebar={false}
                    depth={0}
                    expandedFolders={expandedFolders}
                    maxDepth={6}
                    node={node}
                    onContextMenu={handleContextMenu}
                    onCreateSubPage={handleCreateSubPage}
                    onSelect={handleSelectPage}
                    onToggle={toggleFolder}
                    sidebarButtonBase="text-text-muted hover:bg-canvas-accent hover:text-text-strong"
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Context menu */}
      <WikiPageContextMenu
        isOpen={contextMenu !== null}
        isPinned={contextMenu ? pinnedPageIds.includes(contextMenu.node.id) : false}
        onClose={() => setContextMenu(null)}
        onCopyLink={handleContextMenuCopyLink}
        onCreateSubPage={() => {
          if (contextMenu) {
            void handleCreateSubPage(contextMenu.node.id);
            setContextMenu(null);
          }
        }}
        onDelete={() => void handleContextMenuDelete()}
        onTogglePin={handleContextMenuTogglePin}
        position={contextMenu ?? { x: 0, y: 0 }}
      />

      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps} /> : null}
      </div>
      {aiDrawer}
    </>
  );
}
