import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  FilePlus,
  Globe,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Send,
  Trash2,
} from "lucide-react";

import { lazyWithRetry } from "../../app/lazyWithRetry";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { UserAvatar } from "../../components/ui/user-avatar";
import { useToast } from "../../components/ui/toast";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { getErrorMessage } from "../../platform/data/rpc-adapter";
import {
  stringifyRichTextDocument,
  type RichTextDocument,
} from "../rich-text/rich-text";
import { prepareContentForSave } from "../rich-text/prepare-content";
import {
  useUpdateWikiPageMutation,
  useDeleteWikiPageMutation,
  useCreateWikiPageMutation,
  useAddWikiCommentMutation,
  useWikiCommentsQuery,
  usePinWikiPageMutation,
  useUnpinWikiPageMutation,
  useWikiShareQuery,
  wikiKeys,
} from "./wiki.queries";
import { WikiShareDialog } from "./WikiShareDialog";
import {
  consumeWikiNewPageTitleFocus,
  markWikiNewPageForTitleFocus,
} from "./wiki-new-page-focus";

import type {
  WikiPageListItem,
  WikiPageRecord,
  WikiPageStatus,
} from "./wiki.types";
import {
  buildWikiPageBreadcrumbs,
  buildWikiPagePath,
  formatWikiPageDate,
  getWikiPageDisplayTitle,
} from "./wiki.types";

const LazyRichTextEditor = lazyWithRetry(() =>
  import("../rich-text/RichTextEditor").then((module) => ({
    default: module.RichTextEditor,
  })),
);

type WikiPageViewProps = {
  allPages: WikiPageListItem[];
  canEdit?: boolean;
  currentUserAvatarUrl?: string | null;
  isPinned: boolean;
  onNavigateToPage: (pageId: string) => void;
  onNavigateToSlugPath: (fullPath: string) => void;
  onNavigateToWikiHome: () => void;
  onPageDeleted: () => void;
  organizationId: string;
  page: WikiPageRecord;
  userId: string;
};

const STATUS_CONFIG: Record<
  WikiPageStatus,
  { color: string; label: string }
> = {
  archived: { color: "bg-gray-100 text-gray-700", label: "Archived" },
  draft: {
    color: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Draft",
  },
  needs_review: {
    color: "bg-orange-50 text-orange-700 border-orange-200",
    label: "Needs Review",
  },
  published: {
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Published",
  },
};

export function WikiPageView({
  allPages,
  canEdit = true,
  currentUserAvatarUrl,
  isPinned,
  onNavigateToPage,
  onNavigateToSlugPath,
  onNavigateToWikiHome,
  onPageDeleted,
  organizationId,
  page,
  userId,
}: WikiPageViewProps) {
  const { toast } = useToast();
  const { confirm, confirmDialogProps } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const shareQuery = useWikiShareQuery(page.id);
  const isPubliclyShared = Boolean(shareQuery.data?.shareToken && !shareQuery.data?.revokedAt);

  const updateMutation = useUpdateWikiPageMutation(organizationId);
  const deleteMutation = useDeleteWikiPageMutation(organizationId);
  const createMutation = useCreateWikiPageMutation(organizationId);
  const pinMutation = usePinWikiPageMutation(userId);
  const unpinMutation = useUnpinWikiPageMutation(userId);
  const commentsQuery = useWikiCommentsQuery(page.id);
  const addCommentMutation = useAddWikiCommentMutation(page.id);

  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState<RichTextDocument>(page.contentJson);
  const [commentText, setCommentText] = useState("");
  const [focusBodyRequestKey, setFocusBodyRequestKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [showNewPageTitlePlaceholder, setShowNewPageTitlePlaceholder] =
    useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastSavedContentRef = useRef<string>(
    stringifyRichTextDocument(page.contentJson),
  );
  const latestContentRef = useRef<RichTextDocument>(page.contentJson);
  const pageVersionRef = useRef(page.version);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const activePageIdRef = useRef(page.id);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const clearSaveTimer = useCallback(() => {
    if (!saveTimerRef.current) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const clearSaveStatusTimer = useCallback(() => {
    if (!saveStatusTimerRef.current) return;

    clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = null;
  }, []);

  const syncPageVersion = useCallback(
    (updatedPage: { pageVersion: number } | null | undefined) => {
      if (!updatedPage) return;

      pageVersionRef.current = Math.max(
        pageVersionRef.current,
        updatedPage.pageVersion,
      );
    },
    [],
  );

  const resetPageState = useCallback(
    (nextPage: WikiPageRecord) => {
      clearSaveTimer();
      clearSaveStatusTimer();
      latestContentRef.current = nextPage.contentJson;
      lastSavedContentRef.current = stringifyRichTextDocument(
        nextPage.contentJson,
      );
      pageVersionRef.current = nextPage.version;
      saveInFlightRef.current = false;
      queuedSaveRef.current = false;
      setTitle(nextPage.title);
      setContent(nextPage.contentJson);
      setCommentText("");
      setSaveStatus("idle");
    },
    [clearSaveStatusTimer, clearSaveTimer],
  );

  useEffect(() => {
    if (activePageIdRef.current === page.id) {
      pageVersionRef.current = Math.max(pageVersionRef.current, page.version);
      return;
    }

    activePageIdRef.current = page.id;
    resetPageState(page);
  }, [page, resetPageState]);

  useEffect(() => {
    const shouldFocusTitle = consumeWikiNewPageTitleFocus(organizationId, page.id);
    setShowNewPageTitlePlaceholder(shouldFocusTitle);

    if (!shouldFocusTitle) return;

    titleInputRef.current?.focus();
  }, [organizationId, page.id]);

  useEffect(() => {
    if (!showNewPageTitlePlaceholder || title.trim().length === 0) return;

    setShowNewPageTitlePlaceholder(false);
  }, [showNewPageTitlePlaceholder, title]);

  useEffect(
    () => () => {
      clearSaveTimer();
      clearSaveStatusTimer();
    },
    [clearSaveStatusTimer, clearSaveTimer],
  );

  const saveLatestContent = useCallback(() => {
    const contentToSave = latestContentRef.current;
    const contentStr = stringifyRichTextDocument(contentToSave);

    if (contentStr === lastSavedContentRef.current) {
      return;
    }

    if (saveInFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    const savePageId = activePageIdRef.current;
    const prepared = prepareContentForSave(contentToSave);

    saveInFlightRef.current = true;
    queuedSaveRef.current = false;
    setSaveStatus("saving");

    updateMutation.mutate(
      {
        pageId: savePageId,
        contentJson: contentToSave,
        contentMd: prepared.contentMd,
        expectedVersion: pageVersionRef.current,
      },
      {
        onError: (error) => {
          if (savePageId !== activePageIdRef.current) return;

          const message = getErrorMessage(error, "Save failed");
          if (message === "WIKI_PAGE_CONFLICT") {
            toast({
              title: "This page was updated elsewhere. Reload to see the latest.",
              variant: "error",
            });
          } else {
            toast({ title: "Couldn't save changes", variant: "error" });
          }
          setSaveStatus("error");
        },
        onSettled: (_data, error) => {
          if (savePageId !== activePageIdRef.current) return;

          saveInFlightRef.current = false;

          if (error) {
            queuedSaveRef.current = false;
            return;
          }

          if (
            queuedSaveRef.current ||
            stringifyRichTextDocument(latestContentRef.current) !==
              lastSavedContentRef.current
          ) {
            queuedSaveRef.current = false;
            saveLatestContent();
          }
        },
        onSuccess: (updatedPage) => {
          if (savePageId !== activePageIdRef.current) return;

          syncPageVersion(updatedPage);
          lastSavedContentRef.current = contentStr;
          setSaveStatus("saved");
          clearSaveStatusTimer();
          saveStatusTimerRef.current = setTimeout(
            () => setSaveStatus("idle"),
            2000,
          );
        },
      },
    );
  }, [
    clearSaveStatusTimer,
    syncPageVersion,
    toast,
    updateMutation,
  ]);

  // Autosave on content change (debounced 2s)
  const handleContentChange = useCallback(
    (newContent: RichTextDocument) => {
      latestContentRef.current = newContent;
      setContent(newContent);

      clearSaveTimer();

      if (stringifyRichTextDocument(newContent) === lastSavedContentRef.current) {
        return;
      }

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        saveLatestContent();
      }, 2000);
    },
    [clearSaveTimer, saveLatestContent],
  );

  // Save title on blur
  const handleTitleBlur = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed === page.title) return;

    updateMutation.mutate(
      { pageId: page.id, title: trimmed },
      {
        onError: () => {
          toast({ title: "Couldn't update title", variant: "error" });
          setTitle(page.title);
        },
        onSuccess: (updatedPage) => {
          syncPageVersion(updatedPage);
          // Server derives the slug from the title — a rename changes it.
          // The URL still points at the old slug; without re-navigating,
          // resolveWikiPageIdFromPath fails once the refetched pages list
          // no longer contains the old slug, and the page hangs on
          // "Loading page...".
          if (updatedPage.pageSlug !== page.slug) {
            const newPath = buildWikiPagePath(
              { slug: updatedPage.pageSlug, parentPageId: page.parentPageId },
              allPages,
            );
            onNavigateToSlugPath(newPath);
          }
        },
      },
    );
  }, [
    allPages,
    onNavigateToSlugPath,
    page.id,
    page.parentPageId,
    page.slug,
    page.title,
    syncPageVersion,
    title,
    toast,
    updateMutation,
  ]);

  const handleDelete = useCallback(async () => {
    if (
      !(await confirm({
        confirmLabel: "Delete",
        description:
          "This page and all its child pages will be moved to trash.",
        title: `Delete "${getWikiPageDisplayTitle(page)}"?`,
        variant: "destructive",
      }))
    )
      return;

    deleteMutation.mutate(page.id, {
      onError: () => toast({ title: "Couldn't delete page", variant: "error" }),
      onSuccess: () => onPageDeleted(),
    });
  }, [confirm, deleteMutation, onPageDeleted, page, toast]);

  const handleCreateSubPage = useCallback(async () => {
    createMutation.mutate(
      { organizationId, parentPageId: page.id },
      {
        onError: () => toast({ title: "Couldn't create page", variant: "error" }),
        onSuccess: async (newPage) => {
          markWikiNewPageForTitleFocus(organizationId, newPage.id);
          // Wait for pages list to refresh so the route resolver can find the new page
          await queryClient.refetchQueries({ queryKey: wikiKeys.orgPages(organizationId) });
          const parentPath = buildWikiPagePath(page, allPages);
          onNavigateToSlugPath(`${parentPath}/${newPage.slug}`);
        },
      },
    );
  }, [allPages, createMutation, onNavigateToSlugPath, organizationId, page, queryClient, toast]);

  const handleTogglePin = useCallback(() => {
    if (isPinned) {
      unpinMutation.mutate(page.id, {
        onError: () =>
          toast({ title: "Couldn't unpin page", variant: "error" }),
      });
    } else {
      pinMutation.mutate(page.id, {
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
  }, [isPinned, page.id, pinMutation, unpinMutation, toast]);

  const handleAddComment = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    addCommentMutation.mutate(
      { bodyText: trimmed, pageId: page.id },
      {
        onError: () =>
          toast({ title: "Couldn't add comment", variant: "error" }),
        onSuccess: () => setCommentText(""),
      },
    );
  }, [commentText, page.id, addCommentMutation, toast]);

  const handleStatusChange = useCallback(
    (newStatus: WikiPageStatus) => {
      updateMutation.mutate(
        { pageId: page.id, status: newStatus },
        {
          onError: () =>
            toast({ title: "Couldn't update status", variant: "error" }),
          onSuccess: (updatedPage) => syncPageVersion(updatedPage),
        },
      );
    },
    [page.id, syncPageVersion, updateMutation, toast],
  );

  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
      if (title.trim().length === 0) return;

      event.preventDefault();
      setFocusBodyRequestKey((current) => current + 1);
    },
    [title],
  );

  // Breadcrumbs
  const breadcrumbs = useMemo(
    () => buildWikiPageBreadcrumbs(page, allPages),
    [page, allPages],
  );

  const statusConfig = STATUS_CONFIG[page.status];
  const comments = commentsQuery.data ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-6 py-3 text-sm text-text-muted">
        <button
          className="hover:text-text-strong transition-colors"
          onClick={onNavigateToWikiHome}
          type="button"
        >
          Wiki
        </button>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3" />
            <button
              className="hover:text-text-strong transition-colors"
              onClick={() => onNavigateToPage(crumb.id)}
              type="button"
            >
              {crumb.title || "Untitled"}
            </button>
          </span>
        ))}
        <ChevronRight className="h-3 w-3" />
        <span className="text-text-strong font-medium">
          {getWikiPageDisplayTitle(page)}
        </span>
      </div>

      {/* Page content */}
      <div className="flex-1 px-6 py-6 lg:px-12">
        {/* Title */}
        <input
          className="mb-2 w-full border-none bg-transparent text-2xl font-bold text-text-strong outline-none placeholder:text-text-muted"
          onBlur={handleTitleBlur}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder={showNewPageTitlePlaceholder ? "New Page Title" : "Untitled"}
          ref={titleInputRef}
          value={title}
        />

        {/* Metadata bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button">
                <Badge
                  className={`cursor-pointer border ${statusConfig.color}`}
                >
                  {statusConfig.label}
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(
                Object.entries(STATUS_CONFIG) as [WikiPageStatus, typeof statusConfig][]
              ).map(([status, config]) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleStatusChange(status)}
                >
                  <Badge
                    className={`border ${config.color}`}
                  >
                    {config.label}
                  </Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isPubliclyShared && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" role="status">
              <Globe className="h-3 w-3" />
              Public
            </span>
          )}

          <span className="text-text-muted">
            Updated {formatWikiPageDate(page.updatedAt)}
          </span>

          {saveStatus === "saving" ? (
            <span className="text-text-muted">Saving...</span>
          ) : saveStatus === "saved" ? (
            <span className="text-emerald-600">Saved</span>
          ) : saveStatus === "error" ? (
            <span className="text-error">Save failed</span>
          ) : null}

          {/* Page actions */}
          <div className="ml-auto flex items-center gap-1">
            <Button
              onClick={handleTogglePin}
              size="compact"
              title={isPinned ? "Unpin" : "Pin to sidebar"}
              variant="secondary"
            >
              {isPinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
            </Button>

            {canEdit && (
              <Button
                aria-label="Share this page publicly"
                onClick={() => setShowShareDialog(true)}
                size="compact"
                variant="secondary"
              >
                <Globe className="h-4 w-4" />
                <span className="ml-1 text-xs">Share</span>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="compact" variant="secondary">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    void navigator.clipboard.writeText(page.contentMd);
                    toast({ title: "Copied as Markdown" });
                  }}
                >
                  Copy as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const blob = new Blob([page.contentMd], {
                      type: "text/markdown",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${page.slug}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download as .md
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={createMutation.isPending}
                  onClick={() => void handleCreateSubPage()}
                >
                  <FilePlus className="mr-2 h-4 w-4" />
                  Add sub-page
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-error"
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Editor */}
        <Suspense
          fallback={
            <div className="min-h-[24rem] rounded-3xl border border-border-subtle bg-surface-base p-4 text-sm text-text-muted">
              Loading editor...
            </div>
          }
        >
          <LazyRichTextEditor
            focusRequestKey={focusBodyRequestKey}
            minHeightClassName="min-h-[24rem]"
            onChange={handleContentChange}
            placeholder="Start writing..."
            value={content}
          />
        </Suspense>

        {/* Comments */}
        <div className="mt-8 border-t border-border-subtle pt-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-text-strong">
            <MessageSquare className="h-4 w-4" />
            <span>Comments ({comments.length})</span>
          </div>

          {comments.length === 0 ? (
            <p className="mb-4 text-sm text-text-muted">
              No comments yet. Be the first to add one.
            </p>
          ) : (
            <div className="mb-4 space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl border border-border-subtle bg-surface-base p-3"
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-text-muted">
                    <UserAvatar
                      avatarUrl={comment.authorAvatarUrl}
                      className="h-5 w-5"
                      fallback={(comment.authorName || "?")[0]}
                      fallbackClassName="text-[10px]"
                      name={comment.authorName}
                    />
                    <span>{comment.authorName || "Unknown"}</span>
                    <span>·</span>
                    <span>{formatWikiPageDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-text-strong">
                    {comment.bodyText}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div className="flex gap-2">
            <UserAvatar
              avatarUrl={currentUserAvatarUrl}
              className="h-9 w-9"
              fallback="?"
            />
            <Input
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddComment();
                }
              }}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              value={commentText}
            />
            <Button
              disabled={!commentText.trim() || addCommentMutation.isPending}
              onClick={handleAddComment}
              size="compact"
              variant="primary"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps} /> : null}
      {showShareDialog && <WikiShareDialog onClose={() => setShowShareDialog(false)} pageId={page.id} />}
    </div>
  );
}
