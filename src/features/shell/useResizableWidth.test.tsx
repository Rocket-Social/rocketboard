/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useResizableWidth } from "./useResizableWidth";

const STORAGE_KEY = "test.resizable-width";

function Harness({
  defaultWidth = 280,
  minWidth = 220,
  maxWidth = 520,
}: {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}) {
  const { width, isResizing, handleResizeStart } = useResizableWidth({
    defaultWidth,
    minWidth,
    maxWidth,
    storageKey: STORAGE_KEY,
  });

  return (
    <div>
      <div data-testid="width">{String(width)}</div>
      <div data-testid="resizing">{String(isResizing)}</div>
      <button
        onClick={() =>
          handleResizeStart({
            clientX: 100,
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

function startDrag() {
  fireEvent.click(screen.getByRole("button", { name: "Start resize" }));
}

describe("useResizableWidth", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("returns defaultWidth when localStorage is empty", () => {
    render(<Harness />);
    expect(screen.getByTestId("width")).toHaveTextContent("280");
  });

  it("returns persisted value when localStorage has a valid number", () => {
    window.localStorage.setItem(STORAGE_KEY, "350");
    render(<Harness />);
    expect(screen.getByTestId("width")).toHaveTextContent("350");
  });

  it("clamps persisted value above maxWidth down to maxWidth", () => {
    window.localStorage.setItem(STORAGE_KEY, "9999");
    render(<Harness />);
    expect(screen.getByTestId("width")).toHaveTextContent("520");
  });

  it("clamps persisted value below minWidth up to minWidth", () => {
    window.localStorage.setItem(STORAGE_KEY, "50");
    render(<Harness />);
    expect(screen.getByTestId("width")).toHaveTextContent("220");
  });

  it("falls back to defaultWidth when localStorage contains garbage", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-a-number");
    render(<Harness />);
    expect(screen.getByTestId("width")).toHaveTextContent("280");
  });

  it("handleResizeStart sets isResizing and body styles", () => {
    render(<Harness />);
    startDrag();
    expect(screen.getByTestId("resizing")).toHaveTextContent("true");
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");
  });

  it("mousemove during drag updates width from delta and clamps to bounds", () => {
    render(<Harness />);
    startDrag();

    fireEvent.mouseMove(document, { clientX: 180 });
    expect(screen.getByTestId("width")).toHaveTextContent("360");

    fireEvent.mouseMove(document, { clientX: 10_000 });
    expect(screen.getByTestId("width")).toHaveTextContent("520");

    fireEvent.mouseMove(document, { clientX: -10_000 });
    expect(screen.getByTestId("width")).toHaveTextContent("220");
  });

  it("mouseup clears isResizing, restores body styles, persists width", () => {
    render(<Harness />);
    startDrag();
    fireEvent.mouseMove(document, { clientX: 250 });
    fireEvent.mouseUp(document);

    expect(screen.getByTestId("resizing")).toHaveTextContent("false");
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("430");
  });

  it("cleans up body styles if unmounted mid-drag", () => {
    const { unmount } = render(<Harness />);
    startDrag();
    expect(document.body.style.cursor).toBe("col-resize");

    unmount();
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});
