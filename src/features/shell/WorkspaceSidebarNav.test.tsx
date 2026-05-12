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

  it("renders an Inbox row that wires onSelect to 'inbox'", () => {
    const onSelect = vi.fn();
    render(
      <WorkspaceSidebarNav
        darkSidebar={false}
        onSelect={onSelect}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );

    fireEvent.click(screen.getByTestId("sidebar-inbox-link"));
    expect(onSelect).toHaveBeenCalledWith("inbox");
  });

  it("hides the unread badge when count is 0 or missing", () => {
    const {rerender} = render(
      <WorkspaceSidebarNav
        darkSidebar={false}
        inboxUnreadCount={0}
        onSelect={vi.fn()}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );
    expect(screen.queryByTestId("sidebar-inbox-badge")).toBeNull();

    rerender(
      <WorkspaceSidebarNav
        darkSidebar={false}
        onSelect={vi.fn()}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );
    expect(screen.queryByTestId("sidebar-inbox-badge")).toBeNull();
  });

  it("shows the unread badge with raw count when 1-99", () => {
    render(
      <WorkspaceSidebarNav
        darkSidebar={false}
        inboxUnreadCount={7}
        onSelect={vi.fn()}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );
    expect(screen.getByTestId("sidebar-inbox-badge")).toHaveTextContent("7");
  });

  it("clamps the unread badge to 99+ when over 99", () => {
    render(
      <WorkspaceSidebarNav
        darkSidebar={false}
        inboxUnreadCount={250}
        onSelect={vi.fn()}
        sidebarButtonBase=""
        sidebarCollapsed={false}
      />,
    );
    expect(screen.getByTestId("sidebar-inbox-badge")).toHaveTextContent("99+");
  });
});
