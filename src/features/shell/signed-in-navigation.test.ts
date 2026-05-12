import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { navigateWhenWarm } from "./signed-in-navigation";

describe("signed-in navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("falls back to navigation when preload rejects", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const navigate = vi.fn();
    const router = {
      preloadRoute: vi.fn(() => Promise.reject(new Error("boom"))),
    };

    await navigateWhenWarm({
      location: { href: "/target" },
      navigate,
      router,
    });

    expect(navigate).toHaveBeenCalledWith({ href: "/target" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[signed-in-navigation] warmup failed",
      expect.objectContaining({ location: "/target" }),
    );
  });

  it("falls back to navigation when preload stalls past the timeout", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const navigate = vi.fn();
    const router = {
      preloadRoute: vi.fn(() => new Promise(() => {})),
    };

    const navigationPromise = navigateWhenWarm({
      location: { href: "/target" },
      navigate,
      router,
      timeoutMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);
    await navigationPromise;

    expect(navigate).toHaveBeenCalledWith({ href: "/target" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[signed-in-navigation] warmup timed out",
      expect.objectContaining({ location: "/target", timeoutMs: 50 }),
    );
  });
});
