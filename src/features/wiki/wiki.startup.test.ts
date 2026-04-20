import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { organizationRouteContextQueryOptions } from "../org-settings/org-route.queries";
import {
  wikiOrgPagesQueryOptions,
  wikiPageQueryOptions,
  wikiPinnedPagesWithMetadataQueryOptions,
  wikiRecentOrgPagesQueryOptions,
} from "./wiki.queries";
import { warmWikiStartupSnapshot } from "./wiki.startup";

const getOrgStartupSnapshotMock = vi.fn();

vi.mock("./wiki.repository", () => ({
  wikiPageRepository: {
    getOrgStartupSnapshot: (...args: unknown[]) => getOrgStartupSnapshotMock(...args),
  },
}));

describe("wiki startup snapshot", () => {
  beforeEach(() => {
    getOrgStartupSnapshotMock.mockReset();
  });

  it("hydrates org, page tree, recent pages, pins, and active page", async () => {
    getOrgStartupSnapshotMock.mockResolvedValueOnce({
      organization: {
        id: "org-1",
        name: "Rocketboard",
        slug: "rocketboard",
      },
      page: {
        contentJson: { type: "doc", content: [] },
        contentMd: "",
        createdAt: "2026-04-11T00:00:00Z",
        createdByUserId: "user-1",
        deletedAt: null,
        icon: null,
        id: "page-1",
        organizationId: "org-1",
        ownerUserId: null,
        parentPageId: null,
        position: 0,
        projectId: null,
        slug: "home",
        status: "published",
        title: "Home",
        updatedAt: "2026-04-11T00:00:00Z",
        updatedByUserId: null,
        verifiedAt: null,
        verifiedByUserId: null,
        version: 1,
      },
      pageFound: true,
      pages: [
        {
          createdAt: "2026-04-11T00:00:00Z",
          createdByUserId: "user-1",
          deletedAt: null,
          icon: null,
          id: "page-1",
          organizationId: "org-1",
          ownerUserId: null,
          parentPageId: null,
          position: 0,
          projectId: null,
          slug: "home",
          status: "published",
          title: "Home",
          updatedAt: "2026-04-11T00:00:00Z",
          updatedByUserId: null,
          verifiedAt: null,
          verifiedByUserId: null,
          version: 1,
        },
      ],
      pinnedPages: [
        {
          fullPath: "home",
          icon: null,
          pageId: "page-1",
          pinPosition: 0,
          slug: "home",
          title: "Home",
        },
      ],
      recentPages: [
        {
          createdAt: "2026-04-11T00:00:00Z",
          createdByUserId: "user-1",
          deletedAt: null,
          icon: null,
          id: "page-1",
          organizationId: "org-1",
          ownerUserId: null,
          parentPageId: null,
          position: 0,
          projectId: null,
          slug: "home",
          status: "published",
          title: "Home",
          updatedAt: "2026-04-11T00:00:00Z",
          updatedByUserId: null,
          verifiedAt: null,
          verifiedByUserId: null,
          version: 1,
        },
      ],
      resolvedPageId: "page-1",
    });

    const queryClient = new QueryClient();
    const snapshot = await warmWikiStartupSnapshot(
      queryClient,
      "rocketboard",
      "user-1",
      "home",
    );

    expect(snapshot?.resolvedPageId).toBe("page-1");
    expect(
      queryClient.getQueryData(
        organizationRouteContextQueryOptions("rocketboard").queryKey,
      ),
    ).toEqual(snapshot?.organization);
    expect(queryClient.getQueryData(wikiOrgPagesQueryOptions("org-1").queryKey)).toEqual(
      snapshot?.pages,
    );
    expect(
      queryClient.getQueryData(wikiRecentOrgPagesQueryOptions("org-1").queryKey),
    ).toEqual(snapshot?.recentPages);
    expect(
      queryClient.getQueryData(
        wikiPinnedPagesWithMetadataQueryOptions("user-1").queryKey,
      ),
    ).toEqual(snapshot?.pinnedPages);
    expect(queryClient.getQueryData(wikiPageQueryOptions("page-1").queryKey)).toEqual(
      snapshot?.page,
    );
  });

  it("rejects invalid snapshots without partially hydrating the cache", async () => {
    getOrgStartupSnapshotMock.mockResolvedValueOnce({
      organization: {
        id: "org-1",
        name: "Rocketboard",
        slug: "rocketboard",
      },
      page: null,
      pageFound: true,
      pages: [],
      pinnedPages: [],
      recentPages: [],
      resolvedPageId: "page-1",
    });

    const queryClient = new QueryClient();
    const snapshot = await warmWikiStartupSnapshot(queryClient, "rocketboard", "user-1");

    expect(snapshot).toBeNull();
    expect(
      queryClient.getQueryData(
        organizationRouteContextQueryOptions("rocketboard").queryKey,
      ),
    ).toBeUndefined();
    expect(queryClient.getQueryData(wikiOrgPagesQueryOptions("org-1").queryKey)).toBeUndefined();
  });
});
