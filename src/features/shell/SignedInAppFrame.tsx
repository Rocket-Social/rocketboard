import { useQuery } from "@tanstack/react-query";
import { Outlet, useParams, useRouter, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo } from "react";

import { sessionQueryOptions, type SessionState } from "../auth/data";
import { workspaceSummariesQueryOptions } from "../projects/project-shell.queries";
import type { WorkspaceSummary } from "../projects/project-shell.types";
import {
  buildAiAgentsLocation,
  buildMyNotesLocation,
  buildWikiLocation,
  warmSignedInNavigationLocation,
} from "./signed-in-navigation";
import { resolveShellWorkspace } from "./workspace-sidebar-shell.utils";

export const signedInAppFrameRouteId = "signed-in-app-frame";

const WARMUP_DEFER_MS = 500;

type AuthenticatedSession = Extract<SessionState, { status: "authenticated" }>;

type SignedInAppFrameContextValue = {
  currentOrganizationSlug: string | null;
  currentProjectSlug: string | null;
  currentUser: AuthenticatedSession["user"];
  currentWorkspace: WorkspaceSummary | null;
  currentWorkspaceSlug: string | null;
  session: AuthenticatedSession;
  workspaces: WorkspaceSummary[];
};

const SignedInAppFrameContext = createContext<SignedInAppFrameContextValue | null>(
  null,
);

export function SignedInAppFrame() {
  const router = useRouter();
  const sessionQuery = useQuery(sessionQueryOptions());
  const workspacesQuery = useQuery(workspaceSummariesQueryOptions());
  const { orgSlug, projectSlug, workspaceSlug } = useParams({ strict: false }) as {
    orgSlug?: string;
    projectSlug?: string;
    workspaceSlug?: string;
  };
  const workspaceSlugFromSearch = useRouterState({
    select: (state) =>
      new URL(state.location.href, "https://rocketboard.local").searchParams.get(
        "workspaceSlug",
      ),
  });
  const session = sessionQuery.data as AuthenticatedSession;
  const workspaces = workspacesQuery.data ?? [];

  const currentWorkspace = useMemo(
    () =>
      resolveShellWorkspace(
        workspaces,
        workspaceSlug ?? workspaceSlugFromSearch ?? undefined,
        orgSlug,
      ) ?? null,
    [orgSlug, workspaceSlug, workspaceSlugFromSearch, workspaces],
  );

  const currentWorkspaceSlug =
    workspaceSlug ?? workspaceSlugFromSearch ?? currentWorkspace?.slug ?? null;
  const currentOrganizationSlug =
    orgSlug ?? currentWorkspace?.organizationSlug ?? workspaces[0]?.organizationSlug ?? null;

  const currentWorkspaceSlugForWarmup = currentWorkspace?.slug ?? null;

  useEffect(() => {
    if (!currentWorkspaceSlugForWarmup || !currentOrganizationSlug) {
      return;
    }

    const timer = setTimeout(() => {
      void Promise.allSettled([
        warmSignedInNavigationLocation(router, buildAiAgentsLocation()),
        warmSignedInNavigationLocation(
          router,
          buildMyNotesLocation(currentWorkspaceSlugForWarmup),
        ),
        warmSignedInNavigationLocation(
          router,
          buildWikiLocation(currentOrganizationSlug),
        ),
      ]);
    }, WARMUP_DEFER_MS);

    return () => clearTimeout(timer);
  }, [currentOrganizationSlug, currentWorkspaceSlugForWarmup, router]);

  const value = useMemo<SignedInAppFrameContextValue>(
    () => ({
      currentOrganizationSlug,
      currentProjectSlug: projectSlug ?? null,
      currentUser: session.user,
      currentWorkspace,
      currentWorkspaceSlug,
      session,
      workspaces,
    }),
    [
      currentOrganizationSlug,
      projectSlug,
      currentWorkspace,
      currentWorkspaceSlug,
      session,
      workspaces,
    ],
  );

  return (
    <SignedInAppFrameContext.Provider value={value}>
      <div className="min-h-screen bg-canvas">
        <Outlet />
      </div>
    </SignedInAppFrameContext.Provider>
  );
}

export function useSignedInAppFrame() {
  const value = useContext(SignedInAppFrameContext);

  if (!value) {
    throw new Error("Signed-in app frame context is unavailable.");
  }

  return value;
}
