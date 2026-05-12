import { describe, expect, it } from "vitest";

import {
  buildWikiIndexAiContext,
  buildWikiPageAiContext,
} from "./wiki-ai-context";
import type { RichTextDocument } from "../rich-text/rich-text";
import type {
  WikiPageListItem,
  WikiPageRecord,
  WikiPinnedPageWithMetadata,
} from "./wiki.types";

const ORG_ID = "55555555-5555-4555-8555-555555555555";
const ACTIVE_PAGE_ID = "44444444-4444-4444-8444-444444444444";

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

function makeListPage(overrides: Partial<WikiPageListItem>): WikiPageListItem {
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

function makeRecordPage(overrides: Partial<WikiPageRecord>): WikiPageRecord {
  return {
    contentJson: makeDocument("Initial content"),
    contentMd: "Initial content",
    ...makeListPage(overrides),
    ...overrides,
  };
}

describe("buildWikiIndexAiContext", () => {
  it("builds populated wiki index context with pinned, recent, and tree references", () => {
    const rootPage = makeListPage({
      id: "root",
      position: 0,
      slug: "engineering",
      title: "Engineering",
    });
    const childPage = makeListPage({
      id: "child",
      parentPageId: "root",
      position: 0,
      slug: "roadmap",
      title: "Roadmap",
      updatedAt: "2026-04-09T10:00:00.000Z",
    });
    const otherRoot = makeListPage({
      id: "root-2",
      position: 1,
      slug: "product",
      title: "Product",
    });
    const pinnedPages: WikiPinnedPageWithMetadata[] = [
      {
        fullPath: "engineering/roadmap",
        icon: null,
        pageId: "child",
        pinPosition: 0,
        slug: "roadmap",
        title: "Roadmap",
      },
    ];

    const context = buildWikiIndexAiContext({
      organizationId: ORG_ID,
      pages: [rootPage, childPage, otherRoot],
      pinnedPages,
      recentPages: [childPage],
    });

    expect(context).toMatchObject({
      resourceId: `wiki:index:${ORG_ID}`,
      wikiPageCount: 3,
      wikiView: "index",
    });
    expect(context.wikiPinnedPages).toEqual([
      {
        fullPath: "engineering/roadmap",
        title: "Roadmap",
        updatedAt: undefined,
      },
    ]);
    expect(context.wikiRecentPages).toEqual([
      {
        fullPath: "engineering/roadmap",
        title: "Roadmap",
        updatedAt: "2026-04-09T10:00:00.000Z",
      },
    ]);
    expect(context.wikiPageList?.map((page) => page.fullPath)).toEqual([
      "engineering",
      "engineering/roadmap",
      "product",
    ]);
  });

  it("returns an empty-index resource when the wiki has no pages", () => {
    const context = buildWikiIndexAiContext({
      organizationId: ORG_ID,
      pages: [],
      pinnedPages: [],
      recentPages: [],
    });

    expect(context).toEqual({
      resourceId: `wiki:index:${ORG_ID}`,
      wikiPageCount: 0,
      wikiPageList: [],
      wikiPinnedPages: [],
      wikiRecentPages: [],
      wikiView: "empty-index",
    });
  });

  it("caps wiki index page references before sending them to AI context", () => {
    const pages = Array.from({ length: 25 }, (_, index) =>
      makeListPage({
        id: `page-${index}`,
        position: index,
        slug: `page-${index}`,
        title: `Page ${index}`,
      }),
    );

    const context = buildWikiIndexAiContext({
      organizationId: ORG_ID,
      pages,
      pinnedPages: [],
      recentPages: [],
    });

    expect(context.wikiPageList).toHaveLength(12);
    expect(context.wikiPageList?.at(-1)).toMatchObject({
      fullPath: "page-11",
      title: "Page 11",
    });
  });

  it("caps pinned and recent wiki references before sending them to AI context", () => {
    const pages = Array.from({ length: 7 }, (_, index) =>
      makeListPage({
        id: `page-${index}`,
        position: index,
        slug: `page-${index}`,
        title: `Page ${index}`,
        updatedAt: `2026-04-0${index + 1}T12:00:00.000Z`,
      }),
    );
    const pinnedPages = pages.map((page, index) => ({
      fullPath: page.slug,
      icon: null,
      pageId: page.id,
      pinPosition: index,
      slug: page.slug,
      title: page.title,
    }));

    const context = buildWikiIndexAiContext({
      organizationId: ORG_ID,
      pages,
      pinnedPages,
      recentPages: pages,
    });

    expect(context.wikiPinnedPages).toHaveLength(5);
    expect(context.wikiPinnedPages?.at(-1)).toMatchObject({
      fullPath: "page-4",
      title: "Page 4",
    });
    expect(context.wikiRecentPages).toHaveLength(5);
    expect(context.wikiRecentPages?.at(-1)).toMatchObject({
      fullPath: "page-4",
      title: "Page 4",
      updatedAt: "2026-04-05T12:00:00.000Z",
    });
  });
});

describe("buildWikiPageAiContext", () => {
  it("uses the current unsaved title and content with the full wiki path", () => {
    const engineeringRoot = makeListPage({
      id: "root-1",
      slug: "engineering",
      title: "Engineering",
    });
    const productRoot = makeListPage({
      id: "root-2",
      slug: "product",
      title: "Product",
    });
    const siblingRoadmap = makeListPage({
      id: "roadmap-1",
      parentPageId: "root-1",
      slug: "roadmap",
      title: "Engineering roadmap",
    });
    const activePage = makeRecordPage({
      id: ACTIVE_PAGE_ID,
      parentPageId: "root-2",
      slug: "roadmap",
      status: "needs_review",
      title: "Old roadmap title",
      updatedAt: "2026-04-10T09:00:00.000Z",
    });

    const context = buildWikiPageAiContext({
      allPages: [engineeringRoot, productRoot, siblingRoadmap, activePage],
      content: makeDocument("Unsaved roadmap notes"),
      page: activePage,
      title: "Updated roadmap title",
    });

    expect(context).toMatchObject({
      resourceId: `wiki:page:${ACTIVE_PAGE_ID}`,
      wikiBreadcrumbs: ["Product"],
      wikiPageContentMd: "Unsaved roadmap notes",
      wikiPagePath: "product/roadmap",
      wikiPageStatus: "needs_review",
      wikiPageTitle: "Updated roadmap title",
      wikiPageUpdatedAt: "2026-04-10T09:00:00.000Z",
      wikiView: "page",
    });
  });

  it("caps current wiki page markdown before it is sent to the chat request", () => {
    const activePage = makeRecordPage({
      id: ACTIVE_PAGE_ID,
      slug: "long-page",
      title: "Long page",
    });

    const context = buildWikiPageAiContext({
      allPages: [activePage],
      content: makeDocument("x".repeat(4500)),
      page: activePage,
      title: "Long page",
    });

    expect(context.wikiPageContentMd).toHaveLength(4003);
    expect(context.wikiPageContentMd).toBe(`${"x".repeat(4000)}...`);
  });
});
