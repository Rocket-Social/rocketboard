import {
  getProjectRoute,
  getWorkspaceRoute,
} from "../projects/project-shell.routes";
import type {
  ProjectShellRouteParams,
  WorkspaceSummary,
} from "../projects/project-shell.types";
import {
  buildWorkspaceBaseHref,
  buildWorkspacePlanHref,
  buildWorkspaceInitiativeHref,
  viewTypeToSegment,
} from "../shell/route-helpers";
import { storeWorkspaceCommandOpenCardIntent } from "./workspace-command-intent";
import type {
  WorkspaceSearchCardHit,
  WorkspaceSearchDocumentHit,
} from "./workspace-search.types";

type NavigationResult = boolean | void | Promise<boolean | void>;

type CreateWorkspacePaletteNavigatorOptions = {
  currentOrgSlug: string;
  currentProjectSlug?: string | null;
  currentWorkspaceSlug: string;
  navigateToRoute: (route: ProjectShellRouteParams) => NavigationResult;
  openCurrentCard?: ((cardId: string) => NavigationResult) | null;
  workspaces: WorkspaceSummary[];
};

export function buildProjectRouteHref(route: ProjectShellRouteParams) {
  const segment = viewTypeToSegment(route.viewType);

  return `${buildWorkspaceBaseHref(route.orgSlug, route.workspaceSlug)}/projects/${route.projectSlug}/${segment}/${route.viewId}`;
}

export function buildWorkspaceRouteHref(route: Pick<ProjectShellRouteParams, "orgSlug" | "workspaceSlug">) {
  return buildWorkspaceBaseHref(route.orgSlug, route.workspaceSlug);
}

export function buildWorkspacePlanRouteHref(route: Pick<ProjectShellRouteParams, "orgSlug" | "workspaceSlug">, planId: string) {
  return buildWorkspacePlanHref(route.orgSlug, route.workspaceSlug, planId);
}

export function buildWorkspaceInitiativeRouteHref(
  route: Pick<ProjectShellRouteParams, "orgSlug" | "workspaceSlug">,
  initiativeId: string,
) {
  return buildWorkspaceInitiativeHref(route.orgSlug, route.workspaceSlug, initiativeId);
}

export function createWorkspacePaletteNavigator({
  currentOrgSlug,
  currentProjectSlug,
  currentWorkspaceSlug,
  navigateToRoute,
  openCurrentCard,
  workspaces,
}: CreateWorkspacePaletteNavigatorOptions) {
  return {
    openProject(
      projectSlug: string,
      preferredView?: string,
      workspaceSlug?: string,
    ) {
      const route = getProjectRoute(
        workspaces,
        workspaceSlug ? (workspaces.find((workspace) => workspace.slug === workspaceSlug)?.organizationSlug ?? currentOrgSlug) : currentOrgSlug,
        workspaceSlug ?? currentWorkspaceSlug,
        projectSlug,
        preferredView,
      );

      if (!route) {
        return false;
      }

      return navigateToRoute(route);
    },

    openSearchCard(hit: WorkspaceSearchCardHit) {
      if (
        openCurrentCard &&
        hit.orgSlug === currentOrgSlug &&
        hit.workspaceSlug === currentWorkspaceSlug &&
        hit.projectSlug === currentProjectSlug
      ) {
        return openCurrentCard(hit.cardId);
      }

      const route = getProjectRoute(
        workspaces,
        hit.orgSlug,
        hit.workspaceSlug,
        hit.projectSlug,
      );

      if (!route) {
        return false;
      }

      storeWorkspaceCommandOpenCardIntent({
        cardId: hit.cardId,
        ...route,
        type: "open-card",
      });

      return navigateToRoute(route);
    },

    openSearchDocument(hit: WorkspaceSearchDocumentHit) {
      const route = getProjectRoute(
        workspaces,
        hit.orgSlug,
        hit.workspaceSlug,
        hit.projectSlug,
        hit.projectViewId,
      );

      if (!route) {
        return false;
      }

      return navigateToRoute(route);
    },

    openWorkspace(workspaceSlug: string, orgSlug = currentOrgSlug) {
      const route = getWorkspaceRoute(workspaces, orgSlug, workspaceSlug);

      if (!route) {
        return false;
      }

      return navigateToRoute(route);
    },
  };
}
