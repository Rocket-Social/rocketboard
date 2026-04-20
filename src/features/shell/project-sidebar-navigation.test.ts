import { describe, expect, it, vi } from "vitest";

import { runProjectSidebarNavigationGuard } from "./project-sidebar-navigation";

describe("runProjectSidebarNavigationGuard", () => {
  it("closes shell layers after a confirmed discard", async () => {
    const closeNavigationLayers = vi.fn();
    const confirmDiscardNavigationChanges = vi.fn(async () => true);

    await expect(
      runProjectSidebarNavigationGuard({
        closeNavigationLayers,
        confirmDiscardNavigationChanges,
      }),
    ).resolves.toBe(true);

    expect(confirmDiscardNavigationChanges).toHaveBeenCalledTimes(1);
    expect(closeNavigationLayers).toHaveBeenCalledTimes(1);
  });

  it("blocks navigation without closing shell layers when discard is canceled", async () => {
    const closeNavigationLayers = vi.fn();
    const confirmDiscardNavigationChanges = vi.fn(async () => false);

    await expect(
      runProjectSidebarNavigationGuard({
        closeNavigationLayers,
        confirmDiscardNavigationChanges,
      }),
    ).resolves.toBe(false);

    expect(confirmDiscardNavigationChanges).toHaveBeenCalledTimes(1);
    expect(closeNavigationLayers).not.toHaveBeenCalled();
  });
});
