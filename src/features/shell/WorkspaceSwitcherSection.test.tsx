/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSwitcherSection } from "./WorkspaceSwitcherSection";

const WORKSPACE = {
  colorToken: "blue",
  icon: "M",
  id: "workspace-1",
  name: "Main",
  organizationId: "org-1",
  organizationName: "Rocketboard",
  organizationSlug: "rocketboard",
  projects: [],
  slug: "main",
  timezone: "America/Los_Angeles",
};

function makeWorkspace(index: number) {
  return {
    ...WORKSPACE,
    icon: String(index),
    id: `workspace-${index}`,
    name: `Workspace ${index}`,
    slug: `workspace-${index}`,
  };
}

describe("WorkspaceSwitcherSection", () => {
  it("keeps expanded workspace choices out of the measured pinned section", () => {
    let pinnedNode: HTMLDivElement | null = null;
    const { container } = render(
      <WorkspaceSwitcherSection
        currentWorkspace={WORKSPACE as any}
        darkSidebar={false}
        onCreateWorkspace={vi.fn()}
        onSelectWorkspace={vi.fn()}
        pinnedRef={(node) => {
          pinnedNode = node;
        }}
        sidebarButtonBase="text-text-muted"
        sidebarCollapsed={false}
        workspaces={Array.from({ length: 12 }, (_, index) =>
          makeWorkspace(index + 1),
        ) as any}
      />,
    );

    fireEvent.click(screen.getByText("Main").closest("button")!);

    const workspaceSearch = screen.getByPlaceholderText("Search workspaces");
    const workspaceListScroller = container.querySelector(
      ".max-h-64.overflow-y-auto",
    );

    expect(pinnedNode).toContainElement(screen.getByText("Workspaces"));
    expect(pinnedNode).toContainElement(screen.getByText("Main"));
    expect(pinnedNode).not.toContainElement(workspaceSearch);
    expect(workspaceListScroller).toContainElement(
      screen.getByRole("button", { name: "1 Workspace 1" }),
    );
  });

  it("renders workspace row actions outside the bounded workspace list scroller", async () => {
    const user = userEvent.setup();
    const onRenameWorkspace = vi.fn();
    const { container } = render(
      <WorkspaceSwitcherSection
        currentWorkspace={WORKSPACE as any}
        darkSidebar={false}
        onRenameWorkspace={onRenameWorkspace}
        onSelectWorkspace={vi.fn()}
        sidebarButtonBase="text-text-muted"
        sidebarCollapsed={false}
        workspaces={Array.from({ length: 12 }, (_, index) =>
          makeWorkspace(index + 1),
        ) as any}
      />,
    );

    fireEvent.click(screen.getByText("Main").closest("button")!);

    const workspaceListScroller = container.querySelector(
      ".max-h-64.overflow-y-auto",
    );
    expect(workspaceListScroller).not.toBeNull();

    await user.click(
      screen.getByLabelText("Workspace actions for Workspace 12"),
    );

    const renameItem = await screen.findByRole("menuitem", {
      name: "Rename",
    });
    expect(workspaceListScroller).not.toContainElement(renameItem);

    await user.click(renameItem);
    await waitFor(() => {
      expect(onRenameWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ id: "workspace-12" }),
      );
    });
  });
});
