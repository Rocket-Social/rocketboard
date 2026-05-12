import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { organizationRouteContextQueryOptions } from "../org-settings/org-route.queries";
import {
  resolveWikiPageIdFromPath,
  warmWikiRouteData,
} from "./wiki.preload";
import {
  wikiOrgPagesQueryOptions,
  wikiPageQueryOptions,
  wikiPinnedPagesWithMetadataQueryOptions,
  wikiRecentOrgPagesQueryOptions,
} from "./wiki.queries";

const pages = [
  {
    createdAt: "",
    createdByUserId: "",
    deletedAt: null,
    icon: null,
    id: "root-page",
    organizationId: "org-1",
    ownerUserId: null,
    parentPageId: null,
    position: 0,
    projectId: null,
    slug: "engineering",
    status: "published" as const,
    title: "Engineering",
    updatedAt: "",
    updatedByUserId: null,
    verifiedAt: null,
    verifiedByUserId: null,
    version: 1,
  },
  {
    createdAt: "",
    createdByUserId: "",
    deletedAt: null,
    icon: null,
    id: "child-page",
    organizationId: "org-1",
    ownerUserId: null,
    parentPageId: "root-page",
    position: 0,
    projectId: null,
    slug: "deploy-process",
    status: "published" as const,
    title: "Deploy Process",
    updatedAt: "",
    updatedByUserId: null,
    verifiedAt: null,
    verifiedByUserId: null,
    version: 1,
  },
];

function createQueryClient() {
  return {
    ensureQueryData: vi.fn((options: { queryKey: unknown }) => {
      const queryKey = JSON.stringify(options.queryKey);
      if (
        queryKey
        === JSON.stringify(organizationRouteContextQueryOptions("rocketboard").queryKey)
      ) {
        return Promise.resolve({
          id: "org-1",
          slug: "rocketboard",
        });
      }
      if (
        queryKey === JSON.stringify(wikiOrgPagesQueryOptions("org-1").queryKey)
      ) {
        return Promise.resolve(pages);
      }
      if (
        queryKey === JSON.stringify(wikiPageQueryOptions("child-page").queryKey)
      ) {
        return Promise.resolve({
          contentJson: { type: "doc", content: [] },
          contentMd: "",
          createdAt: "",
          createdByUserId: "",
          deletedAt: null,
          icon: null,
          id: "child-page",
          organizationId: "org-1",
          ownerUserId: null,
          parentPageId: "root-page",
          position: 0,
          projectId: null,
          slug: "deploy-process",
          status: "published",
          title: "Deploy Process",
          updatedAt: "",
          updatedByUserId: null,
          verifiedAt: null,
          verifiedByUserId: null,
          version: 1,
        });
      }
      return Promise.resolve(null);
    }),
    prefetchQuery: vi.fn(() => Promise.resolve()),
  } as unknown as QueryClient;
}

describe("wiki preload helpers", () => {
  it("resolves nested wiki page ids from the slug path", () => {
    expect(resolveWikiPageIdFromPath(pages, "engineering/deploy-process")).toBe(
      "child-page",
    );
    expect(resolveWikiPageIdFromPath(pages, "missing")).toBeNull();
  });

  it("warms org, list, recent, pins, and page detail data together", async () => {
    const queryClient = createQueryClient();

    await expect(
      warmWikiRouteData({
        orgSlug: "rocketboard",
        pagePath: "engineering/deploy-process",
        queryClient,
        userId: "user-1",
      }),
    ).resolves.toEqual({
      organization: {
        id: "org-1",
        slug: "rocketboard",
      },
      pageFound: true,
      pageId: "child-page",
    });

    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: wikiRecentOrgPagesQueryOptions("org-1").queryKey,
      }),
    );
    expect(queryClient.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: wikiPinnedPagesWithMetadataQueryOptions("user-1").queryKey,
      }),
    );
    expect(queryClient.ensureQueryData).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: wikiPageQueryOptions("child-page").queryKey,
      }),
    );
  });
});
