/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSidebarChrome } from "./WorkspaceSidebarChrome";

describe("WorkspaceSidebarChrome", () => {
  it("keeps the footer outside the scroll body and applies sticky-stack scroll padding", () => {
    const { container } = render(
      <WorkspaceSidebarChrome
        darkSidebar={false}
        desktopSidebarWidth={320}
        footer={<div data-testid="sidebar-footer">Footer</div>}
        isDesktop
        isResizingSidebar={false}
        mobileSidebarOpen={false}
        mode={"ember" as any}
        onCollapsedToggle={vi.fn()}
        onMobileSidebarClose={vi.fn()}
        onResizeStart={vi.fn()}
        scrollPaddingTop={140}
        sidebarBase="bg-surface-base"
        sidebarButtonBase="text-text-muted"
        sidebarCollapsed={false}
      >
        <div data-testid="sidebar-body">Body</div>
      </WorkspaceSidebarChrome>,
    );

    const scrollBody = container.querySelector(".overflow-y-auto");

    expect(scrollBody).toHaveStyle({ scrollPaddingTop: "140px" });
    expect(scrollBody).toContainElement(screen.getByTestId("sidebar-body"));
    expect(scrollBody).not.toContainElement(
      screen.getByTestId("sidebar-footer"),
    );
  });
});
