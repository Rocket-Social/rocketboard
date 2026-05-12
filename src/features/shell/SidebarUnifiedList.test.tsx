/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock("./sidebar-ordering.queries", () => ({
  sidebarOrderQueryOptions: () => ({}),
  useReorderSidebarItemsMutation: () => ({
    mutate: vi.fn(),
  }),
}));

import { SidebarUnifiedList } from "./SidebarUnifiedList";

describe("SidebarUnifiedList", () => {
  it("renders the projects header as a sticky peer of the project rows", () => {
    const { container } = render(
      <div style={{ height: "320px", width: "320px" }}>
        <SidebarUnifiedList
          darkSidebar
          initiatives={[]}
          onClickInitiative={vi.fn()}
          onClickPlan={vi.fn()}
          onClickProject={vi.fn()}
          onCreateInitiative={vi.fn()}
          onCreatePlan={vi.fn()}
          onCreateProject={vi.fn()}
          plans={[]}
          projects={[]}
          sidebarButtonBase="text-text-inverse-muted"
          workspaceId="workspace-1"
        />
      </div>,
    );

    const addButton = screen.getByRole("button", { name: "Add new item" });
    const stickyHeader = screen.getByText("Projects").closest(".sticky");

    expect(container.querySelector(".overflow-y-auto")).toBeNull();
    expect(stickyHeader).toContainElement(addButton);
  });
});
