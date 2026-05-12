import { useParams, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { useSignedInAppFrame } from "./SignedInAppFrame";
import { resolveShellWorkspace } from "./workspace-sidebar-shell.utils";
import type { WorkspaceSummary } from "../projects/project-shell.types";

export function useResolvedWorkspace(): WorkspaceSummary | undefined {
  const { currentWorkspace, workspaces } = useSignedInAppFrame();

  const { orgSlug, workspaceSlug } = useParams({ strict: false }) as {
    orgSlug?: string;
    workspaceSlug?: string;
  };

  const searchWorkspaceSlug = useRouterState({
    select: (state) =>
      new URL(state.location.href, "https://rocketboard.local").searchParams.get(
        "workspaceSlug",
      ),
  });

  // Note: no id-only stabilization memo here. A prior version wrapped the
  // return in `useMemo(() => resolved, [resolved?.id])` to hold the
  // workspace reference stable across refetches, but that pinned
  // consumers to the first-loaded shape — project add/remove never
  // propagated to the sidebar until a full page reload, because the
  // workspace id hadn't changed. React Query's structural sharing already
  // keeps references equal when data is deep-equal, so the memo wasn't
  // buying stability; it was blocking legitimate updates.
  return useMemo(
    () =>
      resolveShellWorkspace(
        workspaces,
        workspaceSlug ?? searchWorkspaceSlug ?? undefined,
        orgSlug,
      ) ??
      currentWorkspace ??
      undefined,
    [workspaces, workspaceSlug, searchWorkspaceSlug, orgSlug, currentWorkspace],
  );
}
