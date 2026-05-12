/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useIsDesktop } from "./useIsDesktop";

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("useIsDesktop", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    setWindowWidth(1280);
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
      writable: true,
    });
  });

  it("returns true on desktop viewports", () => {
    setWindowWidth(1440);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("returns false below the 1024px breakpoint", () => {
    setWindowWidth(768);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("updates when the viewport crosses the breakpoint", () => {
    setWindowWidth(1440);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);

    act(() => {
      setWindowWidth(500);
    });
    expect(result.current).toBe(false);

    act(() => {
      setWindowWidth(1200);
    });
    expect(result.current).toBe(true);
  });

  it("does not re-trigger subscribers when width changes but breakpoint stays", () => {
    setWindowWidth(1280);
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useIsDesktop();
    });

    const initialRenders = renderCount;
    expect(result.current).toBe(true);

    // Five mousemove-style resize events that stay above the breakpoint.
    // useSyncExternalStore bails out on Object.is-equal snapshots, so the
    // hook does not schedule re-renders for any of these.
    act(() => {
      setWindowWidth(1300);
      setWindowWidth(1260);
      setWindowWidth(1320);
      setWindowWidth(1100);
      setWindowWidth(1400);
    });

    expect(result.current).toBe(true);
    expect(renderCount).toBe(initialRenders);
  });
});
