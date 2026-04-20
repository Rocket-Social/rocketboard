import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { AppErrorPage } from "./AppErrorPage";
import { lazyWithRetry } from "./lazyWithRetry";
import { DevThrowPage } from "../dev/DevThrowPage";
import { buildLoginHref, validateAuthSearch } from "../features/auth/auth-flow";
import { apiKeyStatusQueryOptions } from "../features/ai/api-key.queries";
import { personasQueryOptions } from "../features/ai/ai.queries";
import {
  accountRoutePath,
  authCallbackRoutePath,
  resetPasswordRoutePath,
} from "../features/auth/auth.routes";
import { loginRoutePath, sessionQueryOptions } from "../features/auth/data";
import {
  initiativeCardsQueryOptions,
  initiativeUpdatesQueryOptions,
  workspaceInitiativeSparklineQueryOptions,
  workspaceInitiativeSummariesQueryOptions,
  workspaceInitiativesQueryOptions,
} from "../features/initiatives/initiative.queries";
import { warmInitiativeStartupSnapshot } from "../features/initiatives/initiative.bootstrap";
import {
  emptyShellRoutePath,
  getDefaultProjectRoute,
} from "../features/projects/project-shell.routes";
import {
  projectCardsQueryOptions,
  projectFieldsQueryOptions,
  projectGroupsQueryOptions,
  projectPriorityOptionsQueryOptions,
  projectSprintsQueryOptions,
  projectStatusOptionsQueryOptions,
  projectTableViewStatesQueryOptions,
  workspaceSummariesQueryOptions,
} from "../features/projects/project-shell.queries";
import { warmProjectShellBootstrap } from "../features/projects/project-shell.bootstrap";
import {
  planReleasesQueryOptions,
  planScorecardQueryOptions,
  roadmapDataQueryOptions,
  workspacePlansQueryOptions,
} from "../features/plans/plan.queries";
import { warmPlanStartupSnapshot } from "../features/plans/plan.bootstrap";
import { ShellNotFound } from "../features/shell/ShellNotFound";
import {
  SignedInAppFrame,
  signedInAppFrameRouteId,
} from "../features/shell/SignedInAppFrame";
import { SignedInShellLayout } from "../features/shell/SignedInShellLayout";
import { UtilityShellLayout } from "../features/shell/UtilityShellLayout";
import {
  acceptInviteRoutePath,
  validateAcceptInviteSearch,
} from "../features/setup/setup.routes";
import {
  myNotesRoutePath,
  validateMyNotesSearch,
} from "../features/notes/notes.routes";
import { warmMyNotesRouteData } from "../features/notes/my-notes.preload";
import { organizationRouteContextQueryOptions } from "../features/org-settings/org-route.queries";
import { validateOrgSettingsSearch } from "../features/org-settings/org-settings.routes";
import { warmWikiRouteData } from "../features/wiki/wiki.preload";
import { queryClient } from "./queryClient";
import { RootLayout } from "./RootLayout";
import {
  buildOrgWikiHref,
  projectAccessRoutePath,
  buildWorkspaceBaseHref,
  orgApiKeysRoutePath,
  orgSettingsRoutePath,
  orgWikiRoutePath,
  viewTypeToSegment,
  projectLayoutRoutePath,
  workspaceAccessRoutePath,
  workspaceArchiveRoutePath,
  workspaceInitiativeDetailRoutePath,
  workspaceInitiativesRoutePath,
  workspacePlanDetailRoutePath,
  workspaceTrashRoutePath,
} from "../features/shell/route-helpers";
import { ProjectShellLayout } from "../features/shell/ProjectShellLayout";
import { validateTableSearch, validateBoardSearch, validateGanttSearch, validateOverviewSearch } from "../features/shell/view-search-params";
import { resolveShellWorkspace } from "../features/shell/workspace-sidebar-shell.utils";
import { prefetchSidebarData } from "../features/shell/sidebar-prefetch";

const LoginPage = lazyWithRetry(() =>
  import("../features/auth/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const AuthCallbackPage = lazyWithRetry(() =>
  import("../features/auth/AuthCallbackPage").then((module) => ({
    default: module.AuthCallbackPage,
  })),
);
const ResetPasswordPage = lazyWithRetry(() =>
  import("../features/auth/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const AccountSettingsPage = lazyWithRetry(() =>
  import("../features/auth/AccountSettingsPage").then((module) => ({
    default: module.AccountSettingsPage,
  })),
);
const OnboardingPage = lazyWithRetry(() =>
  import("../features/setup/OnboardingPage").then((module) => ({
    default: module.OnboardingPage,
  })),
);
const AcceptInvitePage = lazyWithRetry(() =>
  import("../features/setup/AcceptInvitePage").then((module) => ({
    default: module.AcceptInvitePage,
  })),
);
const MyNotesPage = lazyWithRetry(() =>
  import("../features/notes/MyNotesPage").then((module) => ({
    default: module.MyNotesPage,
  })),
);
const AiAgentsPage = lazyWithRetry(() =>
  import("../features/ai/AiAgentsPage").then((module) => ({
    default: module.AiAgentsPage,
  })),
);
const WikiPageLazy = lazyWithRetry(() =>
  import("../features/wiki/WikiPage").then((module) => ({
    default: module.WikiPage,
  })),
);
const TrashPageLazy = lazyWithRetry(() =>
  import("../features/trash/TrashPage").then((module) => ({
    default: module.TrashPage,
  })),
);
const ArchivePageLazy = lazyWithRetry(() =>
  import("../features/trash/TrashPage").then((module) => ({
    default: module.ArchivePage,
  })),
);
const InitiativesListPageLazy = lazyWithRetry(() =>
  import("../features/initiatives/InitiativesPageWrapper").then((module) => ({
    default: module.InitiativesPageWrapper,
  })),
);
const InitiativeDetailPageLazy = lazyWithRetry(() =>
  import("../features/initiatives/InitiativeDetailPage").then((module) => ({
    default: module.InitiativeDetailPage,
  })),
);
const PlanPageLazy = lazyWithRetry(() =>
  import("../features/plans/PlanPageWrapper").then((module) => ({
    default: module.PlanPageWrapper,
  })),
);
const PublicReleaseSharePageLazy = lazyWithRetry(() =>
  import("../features/plans/releases/PublicReleaseSharePage").then((module) => ({
    default: module.PublicReleaseSharePage,
  })),
);
const PublicWikiPageLazy = lazyWithRetry(() =>
  import("../features/wiki/PublicWikiPage").then((module) => ({
    default: module.PublicWikiPage,
  })),
);
const OrgSettingsUtilityPage = lazyWithRetry(() =>
  import("../features/org-settings/OrgSettingsUtilityPage").then((module) => ({
    default: module.OrgSettingsUtilityPage,
  })),
);
const ApiKeysUtilityPage = lazyWithRetry(() =>
  import("../features/ai/ApiKeysUtilityPage").then((module) => ({
    default: module.ApiKeysUtilityPage,
  })),
);
const GitHubCallbackPage = lazyWithRetry(() =>
  import("../features/github/GitHubCallbackPage").then((module) => ({
    default: module.GitHubCallbackPage,
  })),
);
const WorkspaceAccessPageLazy = lazyWithRetry(() =>
  import("../features/access/WorkspaceAccessPage").then((module) => ({
    default: module.WorkspaceAccessPage,
  })),
);
const ProjectAccessPageLazy = lazyWithRetry(() =>
  import("../features/access/ProjectAccessPage").then((module) => ({
    default: module.ProjectAccessPage,
  })),
);
const LazyTableViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/TableViewRoute").then((m) => ({
    default: m.TableViewRoute,
  })),
);
const LazyBoardViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/BoardViewRoute").then((m) => ({
    default: m.BoardViewRoute,
  })),
);
const LazyGanttViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/GanttViewRoute").then((m) => ({
    default: m.GanttViewRoute,
  })),
);
const LazyOverviewViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/OverviewViewRoute").then((m) => ({
    default: m.OverviewViewRoute,
  })),
);
const LazyDocumentViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/DocumentViewRoute").then((m) => ({
    default: m.DocumentViewRoute,
  })),
);
const LazyCanvasViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/CanvasViewRoute").then((m) => ({
    default: m.CanvasViewRoute,
  })),
);
const LazyGitHubViewRoute = lazyWithRetry(() =>
  import("../features/shell/routes/GitHubViewRoute").then((m) => ({
    default: m.GitHubViewRoute,
  })),
);

async function requireAuth(context: { queryClient: QueryClient }, location: { href: string }) {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
  if (session.status === "anonymous") {
    throw redirect({ href: buildLoginHref(location.href) });
  }
  return session;
}

function preloadLazyComponent(component: unknown) {
  const preload = (component as { preload?: () => Promise<unknown> }).preload;
  return preload?.().catch(() => {}) ?? Promise.resolve();
}

async function loadSignedInAppFrameData(
  context: { queryClient: QueryClient },
  location: { href: string },
) {
  const session = await requireAuth(context, location);
  const workspaces = await context.queryClient.ensureQueryData(
    workspaceSummariesQueryOptions(),
  );

  return {
    session,
    workspaces,
  };
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  errorComponent: ({ error }) => <AppErrorPage error={error} />,
  notFoundComponent: ShellNotFound,
});

const signedInAppFrameRoute = createRoute({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context, location);
  },
  component: SignedInAppFrame,
  getParentRoute: () => rootRoute,
  id: signedInAppFrameRouteId,
  loader: ({ context, location }) => loadSignedInAppFrameData(context, location),
});

// Helper to build a view-specific href for redirect
function buildViewHref(params: { orgSlug: string; workspaceSlug: string; projectSlug: string; viewId: string; viewType: string }) {
  const segment = viewTypeToSegment(params.viewType as import('../features/projects/project-view.model').ProjectViewType);
  return `${buildWorkspaceBaseHref(params.orgSlug, params.workspaceSlug)}/projects/${params.projectSlug}/${segment}/${params.viewId}`;
}

async function requireOrganizationRoute(
  context: { queryClient: QueryClient },
  orgSlugOrId: string,
  location?: { pathname: string; searchStr: string },
) {
  const organization = await context.queryClient.ensureQueryData(
    organizationRouteContextQueryOptions(orgSlugOrId),
  );

  if (!organization) {
    throw notFound();
  }

  // External services (Stripe Checkout, billing portal) return users to URLs
  // built at session-creation time. If those URLs used the slug, a rename
  // during the checkout window would land the user on a dead path. Those
  // callers now pass the stable org UUID; detect it here and redirect to the
  // canonical slug URL so the rest of the router resolves normally.
  if (location && organization.slug !== orgSlugOrId) {
    const canonicalHref =
      location.pathname.replace(`/org/${orgSlugOrId}/`, `/org/${organization.slug}/`)
      + location.searchStr;
    throw redirect({ href: canonicalHref });
  }

  return organization;
}

// Helper to redirect to the default project view
async function redirectToDefaultProject(qc: QueryClient) {
  const workspaces = await qc.ensureQueryData(workspaceSummariesQueryOptions());
  const defaultRoute = getDefaultProjectRoute(workspaces);
  if (!defaultRoute) {
    throw redirect({ to: emptyShellRoutePath });
  }
  throw redirect({ href: buildViewHref(defaultRoute) });
}

const indexRoute = createRoute({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context, location);
    await redirectToDefaultProject(context.queryClient);
  },
  getParentRoute: () => rootRoute,
  path: "/",
});

const loginRoute = createRoute({
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(
      sessionQueryOptions(),
    );
    if (session.status === "authenticated") {
      if (search.mode === "link-google") {
        return;
      }
      if (search.r) {
        throw redirect({ href: search.r });
      }
      await redirectToDefaultProject(context.queryClient);
    }
  },
  loader: async () => {
    await preloadLazyComponent(LoginPage);
  },
  component: LoginPage,
  getParentRoute: () => rootRoute,
  path: loginRoutePath,
  validateSearch: validateAuthSearch,
});

const onboardingRoute = createRoute({
  beforeLoad: async ({ context, location }) => {
    await requireAuth(context, location);
    const workspaces = await context.queryClient.ensureQueryData(
      workspaceSummariesQueryOptions(),
    );
    const defaultRoute = getDefaultProjectRoute(workspaces);
    if (defaultRoute) {
      throw redirect({ href: buildViewHref(defaultRoute) });
    }
  },
  loader: async () => {
    await preloadLazyComponent(OnboardingPage);
  },
  component: OnboardingPage,
  getParentRoute: () => rootRoute,
  path: emptyShellRoutePath,
});

const authCallbackRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(AuthCallbackPage);
  },
  component: AuthCallbackPage,
  getParentRoute: () => rootRoute,
  path: authCallbackRoutePath,
  validateSearch: validateAuthSearch,
});

const resetPasswordRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(ResetPasswordPage);
  },
  component: ResetPasswordPage,
  getParentRoute: () => rootRoute,
  path: resetPasswordRoutePath,
});

const acceptInviteRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(AcceptInvitePage);
  },
  component: AcceptInvitePage,
  getParentRoute: () => rootRoute,
  path: acceptInviteRoutePath,
  validateSearch: validateAcceptInviteSearch,
});

const aiAgentsRoute = createRoute({
  loader: async ({ context, location }) => {
    const { workspaces } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(AiAgentsPage);

    const organizationId = workspaces[0]?.organizationId;
    if (!organizationId) {
      return;
    }

    await context.queryClient.ensureQueryData(personasQueryOptions(organizationId));
    void context.queryClient.prefetchQuery(apiKeyStatusQueryOptions(organizationId));
  },
  component: AiAgentsPage,
  getParentRoute: () => utilityShellLayoutRoute,
  path: "/ai-agents",
});

const myNotesRoute = createRoute({
  loader: async ({ context, location }) => {
    const { session } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(MyNotesPage);

    const userId = session.user.id;
    const noteIdFromSearch = new URL(
      location.href,
      "https://rocketboard.local",
    ).searchParams.get("noteId");
    return warmMyNotesRouteData({
      queryClient: context.queryClient,
      requestedNoteId: noteIdFromSearch,
      userId,
    });
  },
  component: MyNotesPage,
  getParentRoute: () => utilityShellLayoutRoute,
  path: myNotesRoutePath,
  validateSearch: validateMyNotesSearch,
});

const wikiRoute = createRoute({
  loader: async ({ context, location, params }) => {
    const { session } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(WikiPageLazy);
    const result = await warmWikiRouteData({
      orgSlug: params.orgSlug,
      pagePath: params._splat,
      queryClient: context.queryClient,
      userId: session.user.id,
    });

    if (!result.organization) {
      throw notFound();
    }

    if (params._splat && !result.pageFound) {
      throw redirect({ href: buildOrgWikiHref(params.orgSlug) });
    }

    return result;
  },
  component: WikiPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: orgWikiRoutePath,
});

const accountRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(AccountSettingsPage);
  },
  component: AccountSettingsPage,
  getParentRoute: () => signedInAppFrameRoute,
  path: accountRoutePath,
});

const publicReleaseShareRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(PublicReleaseSharePageLazy);
  },
  component: () => <PublicReleaseSharePageLazy />,
  getParentRoute: () => rootRoute,
  path: "/shared/releases/$shareToken",
});

const publicWikiShareRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(PublicWikiPageLazy);
  },
  component: () => <PublicWikiPageLazy />,
  getParentRoute: () => rootRoute,
  path: "/shared/wiki/$shareToken",
});

const signedInShellLayoutRoute = createRoute({
  component: SignedInShellLayout,
  getParentRoute: () => signedInAppFrameRoute,
  id: "signed-in-shell-layout",
});

const utilityShellLayoutRoute = createRoute({
  component: UtilityShellLayout,
  getParentRoute: () => signedInShellLayoutRoute,
  id: "utility-shell-layout",
  loader: async ({ context, location, params }) => {
    const { session, workspaces } = await loadSignedInAppFrameData(context, location);
    const routeParams = params as Partial<{
      orgSlug: string;
      workspaceSlug: string;
    }>;
    const searchParams = new URL(
      location.href,
      "https://rocketboard.local",
    ).searchParams;
    const workspace = resolveShellWorkspace(
      workspaces,
      typeof routeParams.workspaceSlug === "string"
        ? routeParams.workspaceSlug
        : searchParams.get("workspaceSlug") ?? undefined,
      typeof routeParams.orgSlug === "string" ? routeParams.orgSlug : undefined,
    );

    prefetchSidebarData(context.queryClient, workspace?.id, session.user.id);
  },
});

// ── Project Layout + View Routes ─────────────────────────────────

const projectLayoutRoute = createRoute({
  component: ProjectShellLayout,
  getParentRoute: () => signedInShellLayoutRoute,
  path: projectLayoutRoutePath,
  loader: async ({ context, location, params }) => {
    if (!params.orgSlug || !params.workspaceSlug || !params.projectSlug) {
      throw notFound();
    }
    const { session, workspaces } = await loadSignedInAppFrameData(context, location);
    const defaultRoute = getDefaultProjectRoute(workspaces);
    if (!defaultRoute) {
      throw redirect({ to: emptyShellRoutePath });
    }
    const workspace = workspaces.find(
      (w) => w.organizationSlug === params.orgSlug && w.slug === params.workspaceSlug,
    );
    const project = workspace?.projects.find((p) => p.slug === params.projectSlug);
    if (!workspace || !project) {
      throw notFound();
    }
    const projectId = project.id;

    prefetchSidebarData(context.queryClient, workspace.id, session.user.id);

    const bootstrapped = await warmProjectShellBootstrap(
      context.queryClient,
      projectId,
    );

    if (!bootstrapped) {
      await Promise.all([
        context.queryClient.ensureQueryData(projectFieldsQueryOptions(projectId)),
        context.queryClient.ensureQueryData(projectStatusOptionsQueryOptions(projectId)),
        context.queryClient.ensureQueryData(projectPriorityOptionsQueryOptions(projectId)),
      ]);
      void context.queryClient.prefetchQuery(projectCardsQueryOptions(projectId));
      void context.queryClient.prefetchQuery(projectGroupsQueryOptions(projectId));
      void context.queryClient.prefetchQuery(projectSprintsQueryOptions(projectId));
      void context.queryClient.prefetchQuery(projectTableViewStatesQueryOptions(projectId));
    }
  },
});

// Index route: redirect bare project URL to default view
const projectIndexRoute = createRoute({
  getParentRoute: () => projectLayoutRoute,
  path: "/",
  beforeLoad: async ({ context, params }) => {
    const workspaces = await context.queryClient.ensureQueryData(
      workspaceSummariesQueryOptions(),
    );
    const workspace = workspaces.find(
      (w) => w.organizationSlug === params.orgSlug && w.slug === params.workspaceSlug,
    );
    const project = workspace?.projects.find((p) => p.slug === params.projectSlug);
    if (!workspace || !project) {
      throw notFound();
    }
    // Find default view
    const defaultView = project.projectViews.find((v) => v.id === project.defaultProjectViewId)
      ?? project.projectViews[0];
    if (!defaultView) {
      throw notFound();
    }
    throw redirect({
      href: buildViewHref({ ...params, viewId: defaultView.id, viewType: defaultView.viewType }),
    });
  },
});

// Child routes for each view type
const tableViewRoute = createRoute({
  component: LazyTableViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyTableViewRoute);
  },
  path: "/table/$viewId",
  validateSearch: validateTableSearch,
});

const boardViewRoute = createRoute({
  component: LazyBoardViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyBoardViewRoute);
  },
  path: "/board/$viewId",
  validateSearch: validateBoardSearch,
});

const ganttViewRoute = createRoute({
  component: LazyGanttViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyGanttViewRoute);
  },
  path: "/gantt/$viewId",
  validateSearch: validateGanttSearch,
});

const overviewViewRoute = createRoute({
  component: LazyOverviewViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyOverviewViewRoute);
  },
  path: "/overview/$viewId",
  validateSearch: validateOverviewSearch,
});

const documentViewRoute = createRoute({
  component: LazyDocumentViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyDocumentViewRoute);
  },
  path: "/doc/$viewId",
});

const canvasViewRoute = createRoute({
  component: LazyCanvasViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyCanvasViewRoute);
  },
  path: "/canvas/$viewId",
});

const githubViewRoute = createRoute({
  component: LazyGitHubViewRoute,
  getParentRoute: () => projectLayoutRoute,
  loader: async () => {
    await preloadLazyComponent(LazyGitHubViewRoute);
  },
  path: "/github/$viewId",
});

// ── Other routes ─────────────────────────────────────────────────

const trashRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(TrashPageLazy);
  },
  component: TrashPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: workspaceTrashRoutePath,
});

const archiveRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(ArchivePageLazy);
  },
  component: ArchivePageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: workspaceArchiveRoutePath,
});

const workspaceAccessRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(WorkspaceAccessPageLazy);
  },
  component: WorkspaceAccessPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: workspaceAccessRoutePath,
});

const projectAccessRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(ProjectAccessPageLazy);
  },
  component: ProjectAccessPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: projectAccessRoutePath,
});

const orgSettingsRoute = createRoute({
  loader: async ({ context, location, params }) => {
    await preloadLazyComponent(OrgSettingsUtilityPage);
    await requireOrganizationRoute(context, params.orgSlug, location);
  },
  component: OrgSettingsUtilityPage,
  getParentRoute: () => utilityShellLayoutRoute,
  path: orgSettingsRoutePath,
  validateSearch: validateOrgSettingsSearch,
});

const orgApiKeysRoute = createRoute({
  loader: async ({ context, location, params }) => {
    const { workspaces } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(ApiKeysUtilityPage);
    await requireOrganizationRoute(context, params.orgSlug, location);
    const organizationId =
      workspaces.find((workspace) => workspace.organizationSlug === params.orgSlug)
        ?.organizationId ?? null;

    if (organizationId) {
      void context.queryClient.prefetchQuery(apiKeyStatusQueryOptions(organizationId));
    }
  },
  component: ApiKeysUtilityPage,
  getParentRoute: () => utilityShellLayoutRoute,
  path: orgApiKeysRoutePath,
});

const githubIntegrationCallbackRoute = createRoute({
  loader: async () => {
    await preloadLazyComponent(GitHubCallbackPage);
  },
  component: GitHubCallbackPage,
  getParentRoute: () => signedInAppFrameRoute,
  path: "/integrations/github/callback",
});


const initiativesRoute = createRoute({
  loader: async ({ context, location, params }) => {
    const { workspaces } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(InitiativesListPageLazy);

    const workspace = workspaces.find(
      (item) =>
        item.organizationSlug === params.orgSlug
        && item.slug === params.workspaceSlug,
    );

    if (!workspace) {
      throw notFound();
    }

    await Promise.all([
      context.queryClient.ensureQueryData(
        workspaceInitiativesQueryOptions(workspace.id),
      ),
      context.queryClient.ensureQueryData(
        workspaceInitiativeSummariesQueryOptions(workspace.id),
      ),
      context.queryClient.ensureQueryData(
        workspaceInitiativeSparklineQueryOptions(workspace.id),
      ),
    ]);
  },
  component: InitiativesListPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: workspaceInitiativesRoutePath,
});

const initiativeDetailRoute = createRoute({
  loader: async ({ context, location, params }) => {
    const { workspaces } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(InitiativeDetailPageLazy);

    const workspace = workspaces.find(
      (item) =>
        item.organizationSlug === params.orgSlug
        && item.slug === params.workspaceSlug,
    );

    if (!workspace) {
      throw notFound();
    }

    const bootstrapped = await warmInitiativeStartupSnapshot(
      context.queryClient,
      workspace.id,
      params.initiativeId,
    );

    if (!bootstrapped) {
      await Promise.all([
        context.queryClient.ensureQueryData(
          workspaceInitiativesQueryOptions(workspace.id),
        ),
        context.queryClient.ensureQueryData(
          initiativeCardsQueryOptions(params.initiativeId),
        ),
        context.queryClient.ensureQueryData(
          initiativeUpdatesQueryOptions(params.initiativeId),
        ),
      ]);
    }
  },
  component: InitiativeDetailPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: workspaceInitiativeDetailRoutePath,
});

const planDetailRoute = createRoute({
  loader: async ({ context, location, params }) => {
    const { workspaces } = await loadSignedInAppFrameData(context, location);
    await preloadLazyComponent(PlanPageLazy);

    const workspace = workspaces.find(
      (item) =>
        item.organizationSlug === params.orgSlug
        && item.slug === params.workspaceSlug,
    );

    if (!workspace) {
      throw notFound();
    }

    const bootstrapped = await warmPlanStartupSnapshot(
      context.queryClient,
      workspace.id,
      params.planId,
    );

    if (!bootstrapped) {
      const plans = await context.queryClient.ensureQueryData(
        workspacePlansQueryOptions(workspace.id),
      );
      const plan = plans.find((item) => item.id === params.planId) ?? null;
      if (!plan) {
        throw notFound();
      }

      await Promise.all(
        plan.views.map((view) => {
          switch (view.viewType) {
            case "releases":
              return context.queryClient.ensureQueryData(
                planReleasesQueryOptions(view.id),
              );
            case "roadmap":
              return context.queryClient.ensureQueryData(
                roadmapDataQueryOptions(view.id),
              );
            case "scorecard":
              return context.queryClient.ensureQueryData(
                planScorecardQueryOptions(view.id),
              );
            default:
              return Promise.resolve();
          }
        }),
      );
    }
  },
  component: PlanPageLazy,
  getParentRoute: () => utilityShellLayoutRoute,
  path: workspacePlanDetailRoutePath,
});

const devThrowRoute = createRoute({
  component: DevThrowPage,
  getParentRoute: () => rootRoute,
  path: "/dev/throw",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authCallbackRoute,
  devThrowRoute,
  onboardingRoute,
  resetPasswordRoute,
  acceptInviteRoute,
  publicReleaseShareRoute,
  publicWikiShareRoute,
  signedInAppFrameRoute.addChildren([
    accountRoute,
    githubIntegrationCallbackRoute,
    signedInShellLayoutRoute.addChildren([
      utilityShellLayoutRoute.addChildren([
        aiAgentsRoute,
        myNotesRoute,
        wikiRoute,
        trashRoute,
        archiveRoute,
        workspaceAccessRoute,
        projectAccessRoute,
        orgSettingsRoute,
        orgApiKeysRoute,
        initiativesRoute,
        initiativeDetailRoute,
        planDetailRoute,
      ]),
      projectLayoutRoute.addChildren([
        projectIndexRoute,
        tableViewRoute,
        boardViewRoute,
        ganttViewRoute,
        overviewViewRoute,
        documentViewRoute,
        canvasViewRoute,
        githubViewRoute,
      ]),
    ]),
  ]),
]);

function DefaultPendingComponent() {
  return <div className="min-h-screen bg-canvas" />;
}

export const router = createRouter({
  context: {
    queryClient,
  },
  defaultPendingComponent: DefaultPendingComponent,
  defaultPendingMinMs: 0,
  defaultPendingMs: 180,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  routeTree,
  scrollRestoration: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
