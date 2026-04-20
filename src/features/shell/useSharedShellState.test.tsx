/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSharedShellState } from "./useSharedShellState";

function SharedShellStateHarness() {
  const shellState = useSharedShellState();

  return (
    <div>
      <div data-testid="collapsed">
        {String(shellState.sidebarCollapsed)}
      </div>
      <div data-testid="width">{String(shellState.sidebarWidth)}</div>
      <button onClick={shellState.toggleSidebarCollapsed} type="button">
        Toggle collapsed
      </button>
      <button
        onClick={() =>
          shellState.handleResizeStart({
            clientX: 256,
            preventDefault() {},
          } as never)
        }
        type="button"
      >
        Start resize
      </button>
    </div>
  );
}

describe("useSharedShellState", () => {
  it("persists collapsed state and sidebar width across mounts", () => {
    window.localStorage.clear();
    const { unmount } = render(<SharedShellStateHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle collapsed" }));
    fireEvent.click(screen.getByRole("button", { name: "Start resize" }));
    fireEvent.mouseMove(document, { clientX: 320 });
    fireEvent.mouseUp(document);

    expect(window.localStorage.getItem("rocketboard.sidebar-collapsed")).toBe(
      "true",
    );
    expect(window.localStorage.getItem("rocketboard.sidebar-width")).toBe("320");

    unmount();
    render(<SharedShellStateHarness />);

    expect(screen.getByTestId("collapsed")).toHaveTextContent("true");
    expect(screen.getByTestId("width")).toHaveTextContent("320");
  });
});
