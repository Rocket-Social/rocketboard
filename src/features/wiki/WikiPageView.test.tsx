/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../test/queryClient";
import { WikiPageView } from "./WikiPageView";
import { markWikiNewPageForTitleFocus } from "./wiki-new-page-focus";

import type { RichTextDocument } from "../rich-text/rich-text";
import type { WikiPageRecord } from "./wiki.types";

const ORG_ID = "55555555-5555-4555-8555-555555555555";
const PAGE_ID = "44444444-4444-4444-8444-444444444444";

const {
  aiDrawerPropsMock,
  deleteVersionMutationMock,
  editorHarness,
  getVersionContentMock,
  restoreVersionMutationMock,
  toastMock,
  updateMutationMock,
  versionsQueryState,
} = vi.hoisted(() => ({
  aiDrawerPropsMock: vi.fn(),
  deleteVersionMutationMock: vi.fn(),
  editorHarness: {
    editable: undefined as boolean | undefined,
    focusRequestKey: undefined as number | undefined,
    onChange: undefined as ((value: RichTextDocument) => void) | undefined,
  },
  getVersionContentMock: vi.fn(),
  restoreVersionMutationMock: vi.fn(),
  toastMock: vi.fn(),
  updateMutationMock: vi.fn(),
  versionsQueryState: {
    data: [] as Array<{
      authorName: string;
      createdAt: string;
      id: string;
      revisionNumber: number;
      title: string;
      version: number;
    }>,
    isLoading: false,
  },
}));

vi.mock("../../components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("../../hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    confirmDialogProps: null,
  }),
}));

vi.mock("../ai/components/AiChatDrawer", () => ({
  AiChatDrawer: (props: Record<string, unknown>) => {
    aiDrawerPropsMock(props);
    return props.isOpen ? <div data-testid="ai-chat-drawer" /> : null;
  },
}));

vi.mock("../shell/useIsDesktop", () => ({
  useIsDesktop: () => true,
}));

vi.mock("../shell/CreateDialogsContext", () => ({
  useCreateDialogs: () => ({
    openCommandPalette: vi.fn(),
  }),
}));

vi.mock("../rich-text/RichTextEditor", () => ({
  RichTextEditor: ({
    editable = true,
    focusRequestKey,
    onChange,
    placeholder,
  }: {
    editable?: boolean;
    focusRequestKey?: number;
    onChange?: (value: RichTextDocument) => void;
    placeholder?: string;
  }) => {
    editorHarness.editable = editable;
    editorHarness.focusRequestKey = focusRequestKey;
    editorHarness.onChange = onChange;
    return (
      <div
        data-editable={String(editable)}
        data-focus-request-key={focusRequestKey}
        data-placeholder={placeholder}
        data-testid="rich-text-editor"
      />
    );
  },
}));

vi.mock("./wiki.repository", () => ({
  wikiPageRepository: {
    getVersionContent: getVersionContentMock,
  },
}));

vi.mock("./wiki.queries", () => ({
  useAddWikiCommentMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useCreateWikiPageMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useDeleteWikiPageMutation: () => ({ mutate: vi.fn() }),
  useDeleteWikiPageVersionMutation: () => ({
    isPending: false,
    mutate: deleteVersionMutationMock,
  }),
  usePinWikiPageMutation: () => ({ mutate: vi.fn() }),
  useRestoreWikiPageVersionMutation: () => ({
    isPending: false,
    mutate: restoreVersionMutationMock,
  }),
  useUnpinWikiPageMutation: () => ({ mutate: vi.fn() }),
  useUpdateWikiPageMutation: () => ({
    isPending: false,
    mutate: updateMutationMock,
  }),
  useWikiCommentsQuery: () => ({ data: [] }),
  useWikiShareQuery: () => ({ data: null }),
  useWikiVersionsQuery: () => versionsQueryState,
  wikiKeys: {
    orgPages: (orgId: string) => ["wiki", "org-pages", orgId],
  },
}));

function makeDocument(text: string): RichTextDocument {
  return {
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  };
}

function makePage(overrides: Partial<WikiPageRecord> = {}): WikiPageRecord {
  return {
    contentJson: makeDocument("Initial content"),
    contentMd: "Initial content",
    createdAt: "2026-04-08T12:00:00.000Z",
    createdByUserId: "user-1",
    deletedAt: null,
    icon: null,
    id: PAGE_ID,
    organizationId: ORG_ID,
    ownerUserId: null,
    parentPageId: null,
    position: 0,
    projectId: null,
    slug: "page-1",
    status: "draft",
    title: "Wiki page",
    updatedAt: "2026-04-08T12:00:00.000Z",
    updatedByUserId: "user-1",
    verifiedAt: null,
    verifiedByUserId: null,
    version: 1,
    ...overrides,
  };
}

function pageToListItem(page: WikiPageRecord) {
  const { contentJson: _contentJson, contentMd: _contentMd, ...listItem } = page;
  return listItem;
}

function makeUpdateResult(pageVersion: number) {
  return {
    pageId: PAGE_ID,
    pageSlug: "page-1",
    pageStatus: "draft",
    pageTitle: "Wiki page",
    pageUpdatedAt: "2026-04-08T12:10:00.000Z",
    pageVersion,
    versionEntryCreatedAt: "2026-04-08T12:10:00.000Z",
    versionEntryId: "version-1",
    versionEntryVersion: pageVersion,
  };
}

function renderWikiPageView(page = makePage()) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <WikiPageView
        allPages={[pageToListItem(page)]}
        isPinned={false}
        onNavigateToPage={vi.fn()}
        onNavigateToSlugPath={vi.fn()}
        onNavigateToWikiHome={vi.fn()}
        onPageDeleted={vi.fn()}
        organizationId={page.organizationId}
        page={page}
        userId="user-1"
      />
    </QueryClientProvider>,
  );
}

describe("WikiPageView autosave", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    deleteVersionMutationMock.mockReset();
    editorHarness.focusRequestKey = undefined;
    editorHarness.editable = undefined;
    editorHarness.onChange = undefined;
    aiDrawerPropsMock.mockReset();
    getVersionContentMock.mockReset();
    restoreVersionMutationMock.mockReset();
    toastMock.mockReset();
    updateMutationMock.mockReset();
    versionsQueryState.data = [];
    versionsQueryState.isLoading = false;
  });

  it("queues follow-up autosaves until the in-flight save settles and uses the latest page version", async () => {
    const updateCalls: Array<{
      options: Record<string, (...args: unknown[]) => void> | undefined;
      variables: Record<string, unknown>;
    }> = [];

    updateMutationMock.mockImplementation(
      (variables: Record<string, unknown>, options?: Record<string, (...args: unknown[]) => void>) => {
        updateCalls.push({ options, variables });
      },
    );

    renderWikiPageView();
    await act(async () => {});
    expect(screen.getByTestId("rich-text-editor")).toBeInTheDocument();

    act(() => {
      editorHarness.onChange?.(makeDocument("First save"));
      vi.advanceTimersByTime(2000);
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.variables.expectedVersion).toBe(1);

    act(() => {
      editorHarness.onChange?.(makeDocument("Second save"));
      vi.advanceTimersByTime(2000);
    });

    expect(updateCalls).toHaveLength(1);

    act(() => {
      const firstCall = updateCalls[0]!;
      const result = makeUpdateResult(2);
      firstCall.options?.onSuccess?.(result, firstCall.variables, undefined);
      firstCall.options?.onSettled?.(
        result,
        null,
        firstCall.variables,
        undefined,
      );
    });

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1]?.variables.contentJson).toEqual(
      makeDocument("Second save"),
    );
    expect(updateCalls[1]?.variables.expectedVersion).toBe(2);
  });

  it("shows the conflict-specific toast for Supabase RPC errors", async () => {
    const updateCalls: Array<{
      options: Record<string, (...args: unknown[]) => void> | undefined;
      variables: Record<string, unknown>;
    }> = [];

    updateMutationMock.mockImplementation(
      (variables: Record<string, unknown>, options?: Record<string, (...args: unknown[]) => void>) => {
        updateCalls.push({ options, variables });
      },
    );

    renderWikiPageView();
    await act(async () => {});
    expect(screen.getByTestId("rich-text-editor")).toBeInTheDocument();

    act(() => {
      editorHarness.onChange?.(makeDocument("Conflicting save"));
      vi.advanceTimersByTime(2000);
    });

    expect(updateCalls).toHaveLength(1);

    act(() => {
      const firstCall = updateCalls[0]!;
      const error = { message: "WIKI_PAGE_CONFLICT" };
      firstCall.options?.onError?.(error, firstCall.variables, undefined);
      firstCall.options?.onSettled?.(
        undefined,
        error,
        firstCall.variables,
        undefined,
      );
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "This page was updated elsewhere. Reload to see the latest.",
        variant: "error",
      }),
    );
  });

  it("focuses a newly created untitled page title with the new-page placeholder", () => {
    const page = makePage({ id: "page-new", title: "" });
    markWikiNewPageForTitleFocus(page.organizationId, page.id);

    renderWikiPageView(page);

    const titleInput = screen.getByPlaceholderText("New Page Title");
    expect(titleInput).toHaveFocus();
    expect(window.sessionStorage.getItem(`rocketboard:wiki:new-page-focus:${ORG_ID}`)).toBeNull();
  });

  it("moves focus into the body editor when Enter is pressed in the title", () => {
    renderWikiPageView(makePage({ title: "" }));

    const titleInput = screen.getByPlaceholderText("Untitled");
    const editor = screen.getByTestId("rich-text-editor");

    expect(editor).toHaveAttribute("data-focus-request-key", "0");

    fireEvent.change(titleInput, { target: { value: "Roadmap" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    expect(editor).toHaveAttribute("data-focus-request-key", "1");
  });

  it("opens AI chat with the current wiki page title and unsaved content context", async () => {
    const page = makePage({
      slug: "product-roadmap",
      title: "Initial roadmap",
    });

    renderWikiPageView(page);
    await act(async () => {});

    expect(aiDrawerPropsMock.mock.lastCall?.[0]).toMatchObject({
      isOpen: false,
      surfaceContext: undefined,
    });

    fireEvent.change(screen.getByDisplayValue("Initial roadmap"), {
      target: { value: "Updated roadmap" },
    });

    act(() => {
      editorHarness.onChange?.(makeDocument("Latest wiki content"));
    });

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(screen.getByTestId("ai-chat-drawer")).toBeInTheDocument();

    const drawerProps = aiDrawerPropsMock.mock.lastCall?.[0] as {
      suggestedPrompts: string[];
      surface: string;
      surfaceContext: Record<string, unknown>;
    };

    expect(drawerProps.surface).toBe("wiki");
    expect(drawerProps.suggestedPrompts).toEqual([
      "Summarize this wiki page",
      "Identify gaps or outdated assumptions",
      "Suggest a clearer structure",
    ]);
    expect(drawerProps.surfaceContext).toMatchObject({
      resourceId: `wiki:page:${PAGE_ID}`,
      wikiPageContentMd: "Latest wiki content",
      wikiPagePath: "product-roadmap",
      wikiPageTitle: "Updated roadmap",
      wikiView: "page",
    });
  });

  it("renders revision history and previews a selected revision read-only", async () => {
    vi.useRealTimers();
    versionsQueryState.data = [
      {
        authorName: "Ada Lovelace",
        createdAt: "2026-04-08T11:00:00.000Z",
        id: "version-1",
        revisionNumber: 1,
        title: "Original page",
        version: 1,
      },
    ];
    getVersionContentMock.mockResolvedValue({
      authorName: "Ada Lovelace",
      contentJson: makeDocument("Original body"),
      contentMd: "Original body",
      createdAt: "2026-04-08T11:00:00.000Z",
      id: "version-1",
      revisionNumber: 1,
      title: "Original page",
      version: 1,
    });

    renderWikiPageView(makePage({ version: 2 }));
    await act(async () => {});

    const commentsHeading = screen.getByText("Comments (0)");
    const versionHistoryHeading = screen.getByText("Version history (1)");
    expect(
      commentsHeading.compareDocumentPosition(versionHistoryHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Version history (1)")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Version actions for v1" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByText("View"));

    expect(getVersionContentMock).toHaveBeenCalledWith({
      pageId: PAGE_ID,
      versionId: "version-1",
    });
    expect(await screen.findByText("Back to editor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Original page")).toBeDisabled();
    expect(screen.getByTestId("rich-text-editor")).toHaveAttribute(
      "data-editable",
      "false",
    );
  });
});
