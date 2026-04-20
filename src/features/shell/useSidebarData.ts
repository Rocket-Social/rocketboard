import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useParams, useRouterState } from "@tanstack/react-router";

import {
  workspaceInitiativesQueryOptions,
} from "../initiatives/initiative.queries";
import type { InitiativeRecord } from "../initiatives/initiative.types";
import {
  workspacePlansQueryOptions,
} from "../plans/plan.queries";
import type { PlanRecord } from "../plans/plan.types";
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "../projects/project-shell.types";
import {
  organizationRouteContextQueryOptions,
} from "../org-settings/org-route.queries";
import {
  useWikiOrgPagesQuery,
  useWikiPinnedPagesWithMetadataQuery,
} from "../wiki/wiki.queries";
import type { WikiPageListItem, WikiPinnedPageWithMetadata } from "../wiki/wiki.types";
import { useSignedInAppFrame } from "./SignedInAppFrame";
import type { WorkspaceNavItemId } from "./app-shell.types";
import { resolveActiveNavItem } from "./resolveActiveNavItem";
import { resolveActiveSidebarItemId } from "./sidebar-active";
import { resolveWikiPageIdFromPath } from "../wiki/wiki.preload";

export type SidebarData = {
  workspace: WorkspaceSummary | undefined;
  workspaces: WorkspaceSummary[];
  workspaceId: string | undefined;
  activeNavItem: WorkspaceNavItemId | undefined;
  activeWikiPageId: string | null;
  activeSidebarItemId: string | null;
  pinnedWikiPages: WikiPinnedPageWithMetadata[];
  wikiPages: WikiPageListItem[];
  wikiPagesLoaded: boolean;
  wikiOrgId: string;
  workspacePlans: PlanRecord[];
  workspaceInitiatives: InitiativeRecord[];
  workspaceProjects: WorkspaceProjectSummary[];
};

export function useSidebarData(
  workspace: WorkspaceSummary | undefined,
): SidebarData {
  const { currentUser, workspaces } = useSignedInAppFrame();

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  }) ?? "";

  const { orgSlug, planId, initiativeId, projectSlug, _splat: wikiPagePath } = useParams({ strict: false }) as {
    orgSlug?: string;
    planId?: string;
    initiativeId?: string;
    projectSlug?: string;
    _splat?: string;
  };

  const workspaceId = workspace?.id;
  const currentOrganizationSlug =
    workspace?.organizationSlug ?? orgSlug ?? workspaces[0]?.organizationSlug ?? "";

  const orgContextQuery = useQuery({
    ...organizationRouteContextQueryOptions(currentOrganizationSlug),
    enabled: Boolean(pathname.includes("/wiki") && currentOrganizationSlug),
  });
  const wikiOrgId =
    workspace?.organizationId ?? orgContextQuery.data?.id ?? "";

  const wikiPagesQuery = useWikiOrgPagesQuery(
    wikiOrgId || undefined,
  );
  const wikiPages = wikiPagesQuery.data ?? [];
  const wikiPagesLoaded = !wikiOrgId || wikiPagesQuery.isSuccess;

  const wikiPinnedQuery = useWikiPinnedPagesWithMetadataQuery(currentUser.id);
  const pinnedWikiPages = wikiPinnedQuery.data ?? [];

  const plansQuery = useQuery({
    ...workspacePlansQueryOptions(workspaceId ?? ""),
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
  });

  const initiativesQuery = useQuery({
    ...workspaceInitiativesQueryOptions(workspaceId ?? ""),
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
  });

  const activeNavItem = resolveActiveNavItem(pathname);
  const activeWikiPageId = pathname.includes("/wiki")
    ? resolveWikiPageIdFromPath(wikiPages, wikiPagePath)
    : null;
  const workspaceProjects = workspace?.projects ?? [];
  const resolvedProjectId = projectSlug
    ? workspaceProjects.find((p) => p.slug === projectSlug)?.id ?? null
    : null;
  const activeSidebarItemId = resolveActiveSidebarItemId({
    initiativeId,
    planId,
    projectId: resolvedProjectId,
  });

  return {
    workspace,
    workspaces,
    workspaceId,
    activeNavItem,
    activeWikiPageId,
    activeSidebarItemId,
    pinnedWikiPages,
    wikiPages,
    wikiPagesLoaded,
    wikiOrgId,
    workspacePlans: plansQuery.data ?? [],
    workspaceInitiatives: initiativesQuery.data ?? [],
    workspaceProjects,
  };
}
