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

const {
  editorHarness,
  toastMock,
  updateMutationMock,
} = vi.hoisted(() => ({
  editorHarness: {
    focusRequestKey: undefined as number | undefined,
    onChange: undefined as ((value: RichTextDocument) => void) | undefined,
  },
  toastMock: vi.fn(),
  updateMutationMock: vi.fn(),
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

vi.mock("../rich-text/RichTextEditor", () => ({
  RichTextEditor: ({
    focusRequestKey,
    onChange,
    placeholder,
  }: {
    focusRequestKey?: number;
    onChange?: (value: RichTextDocument) => void;
    placeholder?: string;
  }) => {
    editorHarness.focusRequestKey = focusRequestKey;
    editorHarness.onChange = onChange;
    return (
      <div
        data-focus-request-key={focusRequestKey}
        data-placeholder={placeholder}
        data-testid="rich-text-editor"
      />
    );
  },
}));

vi.mock("./wiki.queries", () => ({
  useAddWikiCommentMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useCreateWikiPageMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useDeleteWikiPageMutation: () => ({ mutate: vi.fn() }),
  usePinWikiPageMutation: () => ({ mutate: vi.fn() }),
  useUnpinWikiPageMutation: () => ({ mutate: vi.fn() }),
  useUpdateWikiPageMutation: () => ({
    isPending: false,
    mutate: updateMutationMock,
  }),
  useWikiCommentsQuery: () => ({ data: [] }),
  useWikiShareQuery: () => ({ data: null }),
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
    id: "page-1",
    organizationId: "org-1",
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
    pageId: "page-1",
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
    editorHarness.focusRequestKey = undefined;
    editorHarness.onChange = undefined;
    toastMock.mockReset();
    updateMutationMock.mockReset();
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
    expect(window.sessionStorage.getItem("rocketboard:wiki:new-page-focus:org-1")).toBeNull();
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
});
