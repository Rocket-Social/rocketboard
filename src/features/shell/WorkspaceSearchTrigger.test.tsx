/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSearchTrigger } from "./WorkspaceSearchTrigger";

describe("WorkspaceSearchTrigger", () => {
  it("renders the canonical expanded trigger copy", () => {
    render(
      <WorkspaceSearchTrigger
        collapsed={false}
        darkSidebar
        onOpen={vi.fn()}
        sidebarButtonBase=""
      />,
    );

    expect(screen.getByText("Search…")).toBeInTheDocument();
    expect(screen.getByText("⌘")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("uses the canonical collapsed title and aria label", () => {
    render(
      <WorkspaceSearchTrigger
        collapsed
        darkSidebar
        onOpen={vi.fn()}
        sidebarButtonBase=""
      />,
    );

    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toHaveAttribute("title", "Search");
  });
});
