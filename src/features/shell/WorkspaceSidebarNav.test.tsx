/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSidebarNav } from "./WorkspaceSidebarNav";

describe("WorkspaceSidebarNav", () => {
  it("starts warmup on pointerdown before click", () => {
    const onPrefetch = vi.fn();
    const onSelect = vi.fn();

    render(
      <WorkspaceSidebarNav
        darkSidebar={false}
        onPrefetch={onPrefetch}
        onSelect={onSelect}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );

    const notesButton = screen.getByRole("button", { name: "My Notes" });
    fireEvent.pointerDown(notesButton);
    fireEvent.click(notesButton);

    expect(onPrefetch).toHaveBeenCalledWith("notes");
    expect(onSelect).toHaveBeenCalledWith("notes");
  });

  it("starts warmup on touchstart for mobile taps", () => {
    const onPrefetch = vi.fn();

    render(
      <WorkspaceSidebarNav
        darkSidebar={false}
        onPrefetch={onPrefetch}
        onSelect={vi.fn()}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );

    fireEvent.touchStart(screen.getByRole("button", { name: "AI Agents" }));

    expect(onPrefetch).toHaveBeenCalledWith("ai-agents");
  });
});
