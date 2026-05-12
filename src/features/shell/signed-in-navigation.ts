import { inboxRoutePath } from "../inbox/inbox.routes";
import { buildMyNotesSearch, myNotesRoutePath } from "../notes/notes.routes";
import { buildOrgWikiHref } from "./route-helpers";

export const aiAgentsRoutePath = "/ai-agents" as const;
const DEFAULT_WARM_TIMEOUT_MS = 900;

type RouterLocation = {
  href?: string;
  search?: Record<string, string | undefined>;
  to?: string;
};

type SignedInRouter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preloadRoute: (location: any) => Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignedInNavigate = (location: any) => Promise<unknown> | unknown;

type NavigateWhenWarmArgs = {
  label?: string;
  location: RouterLocation;
  navigate: SignedInNavigate;
  router: SignedInRouter;
  timeoutMs?: number;
};

/*
hard refresh
   |
   v
current surface stays mounted
   |
pointerdown / focus / click
   |
   v
preload route + loader warm
   |
   +--> ready: commit navigation
   |
   '--> timeout/error: navigate anyway, log it
*/

function describeLocation(location: RouterLocation) {
  if (location.href) {
    return location.href;
  }

  if (location.to) {
    const query = location.search
      ? `?${new URLSearchParams(
          Object.entries(location.search).filter(([, value]) => value != null) as Array<
            [string, string]
          >,
        ).toString()}`
      : "";
    return `${location.to}${query}`;
  }

  return "unknown-signed-in-route";
}

function createTimeout(timeoutMs: number) {
  return new Promise<"timeout">((resolve) => {
    const schedule = typeof window === "undefined" ? setTimeout : window.setTimeout;
    schedule(() => resolve("timeout"), timeoutMs);
  });
}

export function buildAiAgentsLocation(): RouterLocation {
  return { to: aiAgentsRoutePath };
}

export function buildInboxLocation(): RouterLocation {
  return { to: inboxRoutePath };
}

export function buildMyNotesLocation(
  workspaceSlug?: string | null,
  noteId?: string | null,
): RouterLocation {
  return {
    search: buildMyNotesSearch(workspaceSlug, noteId),
    to: myNotesRoutePath,
  };
}

export function buildWikiLocation(orgSlug: string, pagePath?: string | null): RouterLocation {
  return { href: buildOrgWikiHref(orgSlug, pagePath ?? "") };
}

export function warmSignedInNavigationLocation(
  router: SignedInRouter,
  location: RouterLocation,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return router.preloadRoute(location as any);
}

export async function navigateWhenWarm({
  label,
  location,
  navigate,
  router,
  timeoutMs = DEFAULT_WARM_TIMEOUT_MS,
}: NavigateWhenWarmArgs) {
  const description = label ?? describeLocation(location);

  try {
    const warmupResult = await Promise.race([
      warmSignedInNavigationLocation(router, location),
      createTimeout(timeoutMs),
    ]);

    if (warmupResult === "timeout") {
      console.warn("[signed-in-navigation] warmup timed out", {
        location: description,
        timeoutMs,
      });
    }
  } catch (error) {
    console.warn("[signed-in-navigation] warmup failed", {
      error,
      location: description,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return navigate(location as any);
}
