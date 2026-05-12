import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { getErrorMessage } from "../../platform/data/rpc-adapter";
import {
  buildWikiLocation,
  navigateWhenWarm,
} from "../shell/signed-in-navigation";
import { useSignedInAppFrame } from "../shell/SignedInAppFrame";
import { organizationRouteContextQueryOptions } from "../org-settings/org-route.queries";
import {
  useWikiOrgPagesQuery,
  useWikiPageQuery,
  useWikiPinnedPagesWithMetadataQuery,
} from "./wiki.queries";
import { WikiIndexView } from "./WikiIndexView";
import { WikiPageView } from "./WikiPageView";
import { addRecentView } from "./wiki-recent-viewed";
import { buildWikiPagePath } from "./wiki.types";
import { resolveWikiPageIdFromPath } from "./wiki.preload";

export function WikiPage() {
  const { orgSlug, _splat: pageSlug } = useParams({strict: false}) as {orgSlug: string; _splat?: string};
  const navigate = useNavigate();
  const router = useRouter();
  const { currentUser } = useSignedInAppFrame();
  const organizationQuery = useQuery({
    ...organizationRouteContextQueryOptions(orgSlug ?? ""),
    enabled: Boolean(orgSlug),
  });
  const organizationId = organizationQuery.data?.id ?? "";
  const organizationSlug = organizationQuery.data?.slug ?? orgSlug ?? "";

  const hasSlug = Boolean(pageSlug);
  const pagesQuery = useWikiOrgPagesQuery(organizationId || undefined);
  const pinsQuery = useWikiPinnedPagesWithMetadataQuery(currentUser?.id);

  const pages = pagesQuery.data ?? [];
  const pinnedPageIds = useMemo(
    () => (pinsQuery.data ?? []).map((pin) => pin.pageId),
    [pinsQuery.data],
  );
  const activePageId = hasSlug
    ? resolveWikiPageIdFromPath(pages, pageSlug)
    : null;
  const activePageQuery = useWikiPageQuery(activePageId);
  const activePage = activePageQuery.data;
  const activePageFullPath = useMemo(
    () => (activePage ? buildWikiPagePath(activePage, pages) : null),
    [activePage, pages],
  );

  // Track recently viewed page
  useEffect(() => {
    if (activePage && activePageFullPath && organizationId) {
      addRecentView(organizationId, {
        fullPath: activePageFullPath,
        icon: activePage.icon,
        id: activePage.id,
        title: activePage.title,
      });
    }
  }, [activePage, activePageFullPath, organizationId]);

  const handleNavigateToPage = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      const slugParts: string[] = [page.slug];
      let parentId = page.parentPageId;
      while (parentId) {
        const parent = pages.find((p) => p.id === parentId);
        if (!parent) break;
        slugParts.unshift(parent.slug);
        parentId = parent.parentPageId;
      }
      void navigateWhenWarm({
        location: buildWikiLocation(organizationSlug, slugParts.join("/")),
        navigate,
        router,
      });
    },
    [navigate, pages, organizationSlug, router],
  );

  const handlePageDeleted = useCallback(() => {
    void navigateWhenWarm({
      location: buildWikiLocation(organizationSlug),
      navigate,
      router,
    });
  }, [navigate, organizationSlug, router]);

  const handleNavigateToSlugPath = useCallback(
    (fullPath: string) => {
      void navigateWhenWarm({
        location: buildWikiLocation(organizationSlug, fullPath),
        navigate,
        router,
      });
    },
    [navigate, organizationSlug, router],
  );

  const handleNavigateToWikiHome = useCallback(() => {
    void navigateWhenWarm({
      location: buildWikiLocation(organizationSlug),
      navigate,
      router,
    });
  }, [navigate, organizationSlug, router]);

  // No slug — show wiki index page
  if (!hasSlug) {
    return (
      <WikiIndexView
        onNavigateToPage={(fullPath) => {
          void navigateWhenWarm({
            location: buildWikiLocation(organizationSlug, fullPath),
            navigate,
            router,
          });
        }}
        onPageCreated={(slug) => {
          void navigateWhenWarm({
            location: buildWikiLocation(organizationSlug, slug),
            navigate,
            router,
          });
        }}
        organizationId={organizationId}
        userId={currentUser.id}
      />
    );
  }

  // Has slug — show specific page
  const errorMessage =
    pagesQuery.error || activePageQuery.error
      ? getErrorMessage(
          pagesQuery.error ?? activePageQuery.error,
          "Couldn't load wiki.",
        )
      : null;

  if (errorMessage) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <p className="mb-2 text-sm text-error">{errorMessage}</p>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => {
              void pagesQuery.refetch();
              if (activePageId) {
                void activePageQuery.refetch();
              }
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!activePage) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-text-muted">
          Loading page...
        </p>
      </div>
    );
  }

  return (
    <WikiPageView
      allPages={pages}
      currentUserAvatarUrl={currentUser?.avatarUrl ?? null}
      isPinned={pinnedPageIds.includes(activePage.id)}
      onNavigateToPage={handleNavigateToPage}
      onNavigateToSlugPath={handleNavigateToSlugPath}
      onNavigateToWikiHome={handleNavigateToWikiHome}
      onPageDeleted={handlePageDeleted}
      organizationId={organizationId}
      page={activePage}
      userId={currentUser.id}
    />
  );
}
