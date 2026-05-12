/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  navigateMock,
  routerMock,
  setCommandPaletteOpenMock,
  useCreateDialogsMock,
  useResolvedWorkspaceMock,
  useRouterStateMock,
  useSignedInAppFrameMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerMock: { preloadRoute: vi.fn(() => Promise.resolve()) },
  setCommandPaletteOpenMock: vi.fn(),
  useCreateDialogsMock: vi.fn(),
  useResolvedWorkspaceMock: vi.fn(),
  useRouterStateMock: vi.fn(() => "/my-notes"),
  useSignedInAppFrameMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => routerMock,
  useRouterState: (opts: { select: (s: { location: { pathname: string } }) => string }) =>
    opts.select({ location: { pathname: useRouterStateMock() } }),
}));

vi.mock("./CreateDialogsContext", () => ({
  useCreateDialogs: () => useCreateDialogsMock(),
}));

vi.mock("./useResolvedWorkspace", () => ({
  useResolvedWorkspace: () => useResolvedWorkspaceMock(),
}));

vi.mock("./SignedInAppFrame", () => ({
  useSignedInAppFrame: () => useSignedInAppFrameMock(),
}));

vi.mock("../search/WorkspaceCommandPalette", () => ({
  WorkspaceCommandPalette: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="workspace-command-palette" /> : null,
}));

vi.mock("./signed-in-navigation", () => ({
  buildWikiLocation: (orgSlug: string, pagePath?: string | null) => ({
    href: `/wiki-href-stub/${orgSlug}/${pagePath ?? ""}`,
  }),
  navigateWhenWarm: vi.fn(),
}));

import { GlobalCommandPaletteHost } from "./GlobalCommandPaletteHost";

const WORKSPACE = {
  id: "ws-1",
  slug: "main",
  name: "Main",
  organizationId: "org-1",
  organizationSlug: "rocketboard",
  organizationName: "Rocketboard",
  colorToken: "blue",
  icon: "L",
  projects: [],
  timezone: "America/Los_Angeles",
};

describe("GlobalCommandPaletteHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCreateDialogsMock.mockReturnValue({
      commandPaletteOpen: false,
      setCommandPaletteOpen: setCommandPaletteOpenMock,
    });
    useResolvedWorkspaceMock.mockReturnValue(WORKSPACE);
    useSignedInAppFrameMock.mockReturnValue({ workspaces: [WORKSPACE] });
    useRouterStateMock.mockReturnValue("/my-notes");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders nothing when commandPaletteOpen is false", () => {
    render(<GlobalCommandPaletteHost />);
    expect(
      screen.queryByTestId("workspace-command-palette"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when workspace is null even if commandPaletteOpen is true", () => {
    useCreateDialogsMock.mockReturnValue({
      commandPaletteOpen: true,
      setCommandPaletteOpen: setCommandPaletteOpenMock,
    });
    useResolvedWorkspaceMock.mockReturnValue(undefined);

    render(<GlobalCommandPaletteHost />);
    expect(
      screen.queryByTestId("workspace-command-palette"),
    ).not.toBeInTheDocument();
  });

  it("renders the palette when open and workspace is resolved", async () => {
    useCreateDialogsMock.mockReturnValue({
      commandPaletteOpen: true,
      setCommandPaletteOpen: setCommandPaletteOpenMock,
    });

    render(<GlobalCommandPaletteHost />);
    expect(
      await screen.findByTestId("workspace-command-palette"),
    ).toBeInTheDocument();
  });

  it("opens the palette on Cmd+K window keydown", () => {
    render(<GlobalCommandPaletteHost />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(setCommandPaletteOpenMock).toHaveBeenCalledWith(true);
  });

  it("opens the palette on Ctrl+K window keydown", () => {
    render(<GlobalCommandPaletteHost />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(setCommandPaletteOpenMock).toHaveBeenCalledWith(true);
  });

  it("ignores Cmd+K when the target is an editable element", () => {
    const { container } = render(
      <div>
        <input data-testid="text-input" />
        <GlobalCommandPaletteHost />
      </div>,
    );

    const input = container.querySelector("[data-testid='text-input']") as HTMLInputElement;
    setCommandPaletteOpenMock.mockClear();
    input.focus();
    fireEvent.keyDown(input, { key: "k", metaKey: true });

    expect(setCommandPaletteOpenMock).not.toHaveBeenCalledWith(true);
  });

  it("ignores keydown without modifier", () => {
    render(<GlobalCommandPaletteHost />);

    fireEvent.keyDown(window, { key: "k" });

    expect(setCommandPaletteOpenMock).not.toHaveBeenCalledWith(true);
  });

  it("calls setCommandPaletteOpen(false) when pathname changes", () => {
    const view = render(<GlobalCommandPaletteHost />);

    setCommandPaletteOpenMock.mockClear();
    useRouterStateMock.mockReturnValue("/wiki/some-page");
    view.rerender(<GlobalCommandPaletteHost />);

    expect(setCommandPaletteOpenMock).toHaveBeenCalledWith(false);
  });

  it("calls setCommandPaletteOpen(false) on unmount", () => {
    const view = render(<GlobalCommandPaletteHost />);

    setCommandPaletteOpenMock.mockClear();
    view.unmount();

    expect(setCommandPaletteOpenMock).toHaveBeenCalledWith(false);
  });
});
