/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preloadRouteMock = vi.fn(() => Promise.resolve());

const SESSION_DATA = {
  status: "authenticated" as const,
  user: {
    avatarUrl: null,
    email: "user@example.com",
    githubLogin: null,
    id: "user-1",
    initials: "TU",
    isInternalAdmin: false,
    name: "Test User",
    weekStartsOn: "sunday" as const,
  },
};

const WORKSPACES_DATA = [
  {
    canManageWorkspace: true,
    colorToken: "slate",
    defaultProjectSlug: "growth",
    icon: "R",
    id: "workspace-1",
    name: "Rocketboard",
    organizationId: "org-1",
    organizationName: "Rocketboard Inc.",
    organizationSlug: "rocketboard",
    projects: [],
    slug: "rocketboard",
    timezone: "America/Los_Angeles",
  },
];

type MockQueryOptions = { queryKey: readonly unknown[] };

vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  // Branch on queryKey[0] rather than call index. The prior call-index
  // mock returned the right data on calls 1 and 2 but broke the moment
  // the component re-rendered a third time - strict mode, a future
  // useState, or a Tanstack Query internal commit could all tip the
  // third call into the workspaces branch and crash `session.user`.
  useQuery: (options: MockQueryOptions) => {
    const key = options?.queryKey?.[0];
    if (key === "session") {
      return { data: SESSION_DATA };
    }
    return { data: WORKSPACES_DATA };
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div>Signed in child</div>,
  useParams: () => ({}),
  useRouter: () => ({ preloadRoute: preloadRouteMock }),
  useRouterState: ({ select }: { select: (state: { location: { href: string } }) => unknown }) =>
    select({ location: { href: "https://rocketboard.local/" } }),
}));

import { SignedInAppFrame } from "./SignedInAppFrame";

describe("SignedInAppFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    preloadRouteMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the shell mounted and warms the core signed-in routes after first paint", async () => {
    render(<SignedInAppFrame />);

    expect(screen.getByText("Signed in child")).toBeInTheDocument();
    expect(screen.queryByText(/^Loading$/)).not.toBeInTheDocument();

    // Warmups are deferred via setTimeout(..., WARMUP_DEFER_MS) so first
    // paint doesn't wait on three speculative route loaders. Verify the
    // deferral before advancing fake timers past the threshold.
    expect(preloadRouteMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(preloadRouteMock).toHaveBeenCalledTimes(3);
    expect(preloadRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/ai-agents" }),
    );
    expect(preloadRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/my-notes" }),
    );
    expect(preloadRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/org/rocketboard/wiki/" }),
    );
  });

  it("clears the warmup timer if the component unmounts first", async () => {
    const { unmount } = render(<SignedInAppFrame />);

    expect(preloadRouteMock).not.toHaveBeenCalled();

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(preloadRouteMock).not.toHaveBeenCalled();
  });
});
