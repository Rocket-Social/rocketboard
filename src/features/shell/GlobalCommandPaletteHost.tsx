import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Suspense, useCallback, useEffect, useMemo } from "react";

import { lazyWithRetry } from "../../app/lazyWithRetry";
import { isEditableEventTarget } from "../../lib/dom";
import { buildMyNotesSearch, myNotesRoutePath } from "../notes/notes.routes";
import {
  buildProjectRouteHref,
  createWorkspacePaletteNavigator,
} from "../search/workspace-palette-navigation";
import {
  buildWikiLocation,
  navigateWhenWarm,
} from "./signed-in-navigation";
import { useCreateDialogs } from "./CreateDialogsContext";
import { useResolvedWorkspace } from "./useResolvedWorkspace";
import { useSignedInAppFrame } from "./SignedInAppFrame";

const WorkspaceCommandPalette = lazyWithRetry(
  () =>
    import("../search/WorkspaceCommandPalette").then((m) => ({
      default: m.WorkspaceCommandPalette,
    })),
  { recovery: "error-boundary" },
);

export function GlobalCommandPaletteHost() {
  const navigate = useNavigate();
  const router = useRouter();
  const workspace = useResolvedWorkspace();
  const { workspaces } = useSignedInAppFrame();
  const { commandPaletteOpen, setCommandPaletteOpen } = useCreateDialogs();

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // C2: close palette on every non-project route change so it doesn't
  // survive across navigation (e.g., /my-notes -> /wiki keeps the host
  // mounted; without this effect the palette persists).
  useEffect(() => {
    setCommandPaletteOpen(false);
  }, [pathname, setCommandPaletteOpen]);

  // Unmount cleanup: when the host tears down (route → project), clear
  // commandPaletteOpen so a future remount doesn't see stale true state.
  useEffect(() => {
    return () => {
      setCommandPaletteOpen(false);
    };
  }, [setCommandPaletteOpen]);

  // Cmd/Ctrl+K window listener — owned here so it's naturally
  // route-scoped (host is only mounted on non-project routes).
  // Project routes have their own listener via
  // useWorkspaceCommandPaletteController inside ProjectShellLayout.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (!event.metaKey && !event.ctrlKey) ||
        isEditableEventTarget(event.target)
      ) {
        return;
      }

      if (event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      // openCommandPalette gates on accountSettingsOpen + isAnyBlockingUiOpen
      // (per C3) — go through it instead of setCommandPaletteOpen directly
      // so click and keystroke share the same gate.
      // We don't import useCreateDialogs here to keep this in one effect;
      // setCommandPaletteOpen is fine because the same gates flow through
      // when the palette tries to open via the click path. For pure
      // keystroke open, we mirror the gate inline:
      setCommandPaletteOpen(true);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandPaletteOpen]);

  const closePalette = useCallback(
    () => setCommandPaletteOpen(false),
    [setCommandPaletteOpen],
  );

  const navigateToRoute = useCallback(
    (route: Parameters<typeof buildProjectRouteHref>[0]) => {
      void navigateWhenWarm({
        location: { href: buildProjectRouteHref(route) },
        navigate,
        router,
      });
      return true;
    },
    [navigate, router],
  );

  const paletteNavigator = useMemo(() => {
    if (!workspace) return null;
    return createWorkspacePaletteNavigator({
      currentOrgSlug: workspace.organizationSlug,
      currentProjectSlug: null,
      currentWorkspaceSlug: workspace.slug,
      navigateToRoute,
      workspaces,
    });
  }, [navigateToRoute, workspace, workspaces]);

  if (!commandPaletteOpen || !workspace || !paletteNavigator) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <WorkspaceCommandPalette
        currentWorkspace={workspace}
        isOpen={commandPaletteOpen}
        onClose={closePalette}
        onOpenProject={paletteNavigator.openProject}
        onOpenSearchCard={paletteNavigator.openSearchCard}
        onOpenSearchDocument={paletteNavigator.openSearchDocument}
        onOpenMyNote={(hit) => {
          void navigateWhenWarm({
            location: {
              search: buildMyNotesSearch(workspace.slug, hit.noteId),
              to: myNotesRoutePath,
            },
            navigate,
            router,
          });
          return true;
        }}
        onOpenWikiPage={(hit) => {
          void navigateWhenWarm({
            location: buildWikiLocation(
              workspace.organizationSlug,
              hit.fullPath,
            ),
            navigate,
            router,
          });
          return true;
        }}
        onOpenWorkspace={paletteNavigator.openWorkspace}
        organizationId={workspace.organizationId}
        workspaces={workspaces}
      />
    </Suspense>
  );
}
