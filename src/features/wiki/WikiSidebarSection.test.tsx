/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addRecentView, getRecentViews } from "./wiki-recent-viewed";
import { WikiSidebarSection } from "./WikiSidebarSection";
import type { WikiPageListItem } from "./wiki.types";

beforeEach(() => {
  localStorage.clear();
});

function makeAccessiblePage(
  id: string,
  overrides: Partial<WikiPageListItem> = {},
): WikiPageListItem {
  return {
    createdAt: "2026-04-19T00:00:00.000Z",
    createdByUserId: "user-1",
    deletedAt: null,
    icon: null,
    id,
    organizationId: "org-1",
    ownerUserId: null,
    parentPageId: null,
    position: 0,
    projectId: null,
    slug: `${id}-slug`,
    status: "draft",
    title: `Title ${id}`,
    updatedAt: "2026-04-19T00:00:00.000Z",
    updatedByUserId: null,
    verifiedAt: null,
    verifiedByUserId: null,
    version: 1,
    ...overrides,
  };
}

describe("WikiSidebarSection", () => {
  it("filters deleted recent pages out of the sidebar and prunes them from storage", async () => {
    addRecentView("org-1", {
      fullPath: "live-page",
      icon: null,
      id: "page-live",
      title: "Live Page",
    });
    addRecentView("org-1", {
      fullPath: "deleted-page",
      icon: null,
      id: "page-deleted",
      title: "Deleted Page",
    });

    render(
      <WikiSidebarSection
        activePageId={null}
        accessiblePages={[makeAccessiblePage("page-live", { slug: "live-page", title: "Live Page" })]}
        accessiblePagesLoaded
        darkSidebar
        onAllPages={vi.fn()}
        onCreatePage={vi.fn()}
        onSelectPage={vi.fn()}
        orgId="org-1"
        pinnedPages={[]}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Live Page" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deleted Page" }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(getRecentViews("org-1").map((entry) => entry.id)).toEqual([
        "page-live",
      ]);
    });
  });

  it("waits for accessible page data before rendering recent links", () => {
    addRecentView("org-1", {
      fullPath: "live-page",
      icon: null,
      id: "page-live",
      title: "Live Page",
    });

    render(
      <WikiSidebarSection
        activePageId={null}
        accessiblePages={[]}
        accessiblePagesLoaded={false}
        darkSidebar
        onAllPages={vi.fn()}
        onCreatePage={vi.fn()}
        onSelectPage={vi.fn()}
        orgId="org-1"
        pinnedPages={[]}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Live Page" }),
    ).not.toBeInTheDocument();
    expect(getRecentViews("org-1").map((entry) => entry.id)).toEqual([
      "page-live",
    ]);
  });

  it("renders current page metadata for recent links instead of stale localStorage labels", () => {
    addRecentView("org-1", {
      fullPath: "untitled",
      icon: null,
      id: "page-live",
      title: "",
    });

    const onSelectPage = vi.fn();

    render(
      <WikiSidebarSection
        activePageId={null}
        accessiblePages={[
          makeAccessiblePage("page-live", {
            parentPageId: "section-1",
            slug: "new-wiki-page",
            title: "New wiki page",
          }),
          makeAccessiblePage("section-1", {
            slug: "new-section",
            title: "New Section",
          }),
        ]}
        accessiblePagesLoaded
        darkSidebar
        onAllPages={vi.fn()}
        onCreatePage={vi.fn()}
        onSelectPage={onSelectPage}
        orgId="org-1"
        pinnedPages={[]}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "New wiki page" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Untitled" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New wiki page" }));

    expect(onSelectPage).toHaveBeenCalledWith(
      "page-live",
      "new-section/new-wiki-page",
    );
  });
});
