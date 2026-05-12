/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarSectionHeader } from "./SidebarSectionHeader";

describe("SidebarSectionHeader", () => {
  it("pins the trailing action to a dedicated right-aligned slot", () => {
    render(
      <SidebarSectionHeader
        action={<button type="button">Action</button>}
        darkSidebar={false}
        title="Projects"
      />,
    );

    const actionButton = screen.getByRole("button", { name: "Action" });
    expect(actionButton.parentElement).toHaveClass("ml-auto", "shrink-0");
  });

  it("renders the title without an action slot when no action is provided", () => {
    render(<SidebarSectionHeader darkSidebar title="Wiki" />);

    expect(screen.getByText("Wiki")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
