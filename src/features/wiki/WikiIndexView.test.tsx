/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../test/queryClient";
import { WikiIndexView } from "./WikiIndexView";
import type {
  WikiPageListItem,
  WikiPinnedPageWithMetadata,
} from "./wiki.types";

const ORG_ID = "55555555-5555-4555-8555-555555555555";

const {
  aiDrawerPropsMock,
  createMutationMock,
  deleteMutationMock,
  pinMutationMock,
  searchState,
  toastMock,
  unpinMutationMock,
  wikiState,
} = vi.hoisted(() => ({
  aiDrawerPropsMock: vi.fn(),
  createMutationMock: vi.fn(),
  deleteMutationMock: vi.fn(),
  pinMutationMock: vi.fn(),
  searchState: {
    isPending: false,
  },
  toastMock: vi.fn(),
  unpinMutationMock: vi.fn(),
  wikiState: {
    pages: [] as WikiPageListItem[],
    pinnedPages: [] as WikiPinnedPageWithMetadata[],
    recentPages: [] as WikiPageListItem[],
    searchResults: [] as Array<{
      contentSnippet: string | null;
      id: string;
      slug: string;
      title: string;
    }>,
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

vi.mock("./WikiPageContextMenu", () => ({
  WikiPageContextMenu: () => null,
}));

vi.mock("./WikiTreeNode", () => ({
  WikiTreeNode: ({ node }: { node: { title: string } }) => (
    <div>{node.title}</div>
  ),
}));

vi.mock("./wiki.queries", () => ({
  useCreateWikiPageMutation: () => ({
    isPending: false,
    mutate: createMutationMock,
  }),
  useDeleteWikiPageMutation: () => ({ mutate: deleteMutationMock }),
  usePinWikiPageMutation: () => ({ mutate: pinMutationMock }),
  useSearchWikiPagesQuery: () => ({
    data: wikiState.searchResults,
    isPending: searchState.isPending,
  }),
  useUnpinWikiPageMutation: () => ({ mutate: unpinMutationMock }),
  useWikiOrgPagesQuery: () => ({
    data: wikiState.pages,
    isPending: false,
  }),
  useWikiPinnedPagesWithMetadataQuery: () => ({
    data: wikiState.pinnedPages,
  }),
  useWikiRecentOrgPagesQuery: () => ({
    data: wikiState.recentPages,
    isPending: false,
  }),
  wikiKeys: {
    orgPages: (orgId: string) => ["wiki", "org-pages", orgId],
  },
}));

function makePage(overrides: Partial<WikiPageListItem>): WikiPageListItem {
  return {
    createdAt: "2026-04-08T12:00:00.000Z",
    createdByUserId: "user-1",
    deletedAt: null,
    icon: null,
    id: overrides.id ?? "page-1",
    organizationId: ORG_ID,
    ownerUserId: null,
    parentPageId: overrides.parentPageId ?? null,
    position: overrides.position ?? 0,
    projectId: null,
    slug: overrides.slug ?? "page-1",
    status: "draft",
    title: overrides.title ?? "Wiki page",
    updatedAt: overrides.updatedAt ?? "2026-04-08T12:00:00.000Z",
    updatedByUserId: "user-1",
    verifiedAt: null,
    verifiedByUserId: null,
    version: 1,
  };
}

function renderWikiIndexView() {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <WikiIndexView
        onNavigateToPage={vi.fn()}
        onPageCreated={vi.fn()}
        organizationId={ORG_ID}
        userId="user-1"
      />
    </QueryClientProvider>,
  );
}

describe("WikiIndexView AI affordance", () => {
  beforeEach(() => {
    wikiState.pages = [];
    wikiState.pinnedPages = [];
    wikiState.recentPages = [];
    wikiState.searchResults = [];
    searchState.isPending = false;

    aiDrawerPropsMock.mockReset();
    createMutationMock.mockReset();
    deleteMutationMock.mockReset();
    pinMutationMock.mockReset();
    toastMock.mockReset();
    unpinMutationMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the AI button in the populated wiki header and opens wiki index prompts", () => {
    const rootPage = makePage({
      id: "page-root",
      slug: "engineering",
      title: "Engineering",
    });
    const childPage = makePage({
      id: "page-child",
      parentPageId: "page-root",
      position: 1,
      slug: "roadmap",
      title: "Roadmap",
      updatedAt: "2026-04-09T12:00:00.000Z",
    });

    wikiState.pages = [rootPage, childPage];
    wikiState.pinnedPages = [
      {
        fullPath: "engineering/roadmap",
        icon: null,
        pageId: "page-child",
        pinPosition: 0,
        slug: "roadmap",
        title: "Roadmap",
      },
    ];
    wikiState.recentPages = [childPage];

    renderWikiIndexView();

    expect(screen.getByRole("button", { name: "Ask AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(screen.getByTestId("ai-chat-drawer")).toBeInTheDocument();

    const drawerProps = aiDrawerPropsMock.mock.lastCall?.[0] as {
      suggestedPrompts: string[];
      surface: string;
      surfaceContext: Record<string, unknown>;
    };

    expect(drawerProps.surface).toBe("wiki");
    expect(drawerProps.suggestedPrompts).toEqual([
      "Summarize pinned and recently updated wiki pages",
      "As a product manager, which wiki pages should I read first?",
      "What knowledge gaps should we document next?",
    ]);
    expect(drawerProps.surfaceContext).toMatchObject({
      resourceId: `wiki:index:${ORG_ID}`,
      wikiPageCount: 2,
      wikiView: "index",
    });
  });

  it("keeps the AI button in the empty wiki state and uses empty-index prompts", () => {
    renderWikiIndexView();

    expect(screen.getByText("Start your team's Wiki")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create first page" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(screen.getByTestId("ai-chat-drawer")).toBeInTheDocument();

    const drawerProps = aiDrawerPropsMock.mock.lastCall?.[0] as {
      suggestedPrompts: string[];
      surfaceContext: Record<string, unknown>;
    };

    expect(drawerProps.suggestedPrompts).toEqual([
      "What should this wiki document first?",
      "Draft starter wiki pages for this workspace",
      "Suggest a lightweight knowledge map",
    ]);
    expect(drawerProps.surfaceContext).toMatchObject({
      resourceId: `wiki:index:${ORG_ID}`,
      wikiPageCount: 0,
      wikiView: "empty-index",
    });
  });
});
