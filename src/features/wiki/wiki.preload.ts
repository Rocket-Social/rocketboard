import type { QueryClient } from "@tanstack/react-query";

import { organizationRouteContextQueryOptions } from "../org-settings/org-route.queries";
import {
  buildWikiFallbackSnapshot,
  warmWikiStartupSnapshot,
} from "./wiki.startup";
import type { WikiPageListItem } from "./wiki.types";
import {
  wikiOrgPagesQueryOptions,
  wikiPageQueryOptions,
  wikiPinnedPagesWithMetadataQueryOptions,
  wikiRecentOrgPagesQueryOptions,
} from "./wiki.queries";

export function resolveWikiPageIdFromPath(
  pages: WikiPageListItem[],
  pagePath: string | null | undefined,
) {
  const normalizedPath = pagePath?.trim().replace(/^\/+|\/+$/g, "");

  if (!normalizedPath) {
    return null;
  }

  const slugParts = normalizedPath.split("/");
  let currentParentId: string | null = null;
  let matchedPage: WikiPageListItem | null = null;

  for (const part of slugParts) {
    const nextPage =
      pages.find(
        (page) => page.slug === part && page.parentPageId === currentParentId,
      ) ?? null;

    if (!nextPage) {
      return null;
    }

    matchedPage = nextPage;
    currentParentId = nextPage.id;
  }

  return matchedPage?.id ?? null;
}

export async function warmWikiRouteData(args: {
  orgSlug: string;
  pagePath?: string | null;
  queryClient: QueryClient;
  userId?: string | null;
}) {
  const startupSnapshot = await warmWikiStartupSnapshot(
    args.queryClient,
    args.orgSlug,
    args.userId,
    args.pagePath,
  );

  if (startupSnapshot) {
    return {
      organization: startupSnapshot.organization,
      pageFound: startupSnapshot.pageFound,
      pageId: startupSnapshot.resolvedPageId,
    };
  }

  const organization = await args.queryClient.ensureQueryData(
    organizationRouteContextQueryOptions(args.orgSlug),
  );

  if (!organization) {
    return { organization: null, pageFound: false, pageId: null };
  }

  const pagesPromise = args.queryClient.ensureQueryData(
    wikiOrgPagesQueryOptions(organization.id),
  );

  void args.queryClient.prefetchQuery(
    wikiRecentOrgPagesQueryOptions(organization.id),
  );

  if (args.userId) {
    void args.queryClient.prefetchQuery(
      wikiPinnedPagesWithMetadataQueryOptions(args.userId),
    );
  }

  const pages = await pagesPromise;
  const pageId = resolveWikiPageIdFromPath(pages ?? [], args.pagePath);
  const recentPages = await args.queryClient.ensureQueryData(
    wikiRecentOrgPagesQueryOptions(organization.id),
  );
  const pinnedPages = args.userId
    ? await args.queryClient.ensureQueryData(
        wikiPinnedPagesWithMetadataQueryOptions(args.userId),
      )
    : [];
  const page = pageId
    ? await args.queryClient.ensureQueryData(wikiPageQueryOptions(pageId))
    : null;

  buildWikiFallbackSnapshot({
    organization,
    page: page ?? null,
    pageFound: !args.pagePath || Boolean(pageId),
    pages: pages ?? [],
    pinnedPages: pinnedPages ?? [],
    recentPages: recentPages ?? [],
    resolvedPageId: pageId,
  });

  return {
    organization,
    pageFound: !args.pagePath || Boolean(pageId),
    pageId,
  };
}
