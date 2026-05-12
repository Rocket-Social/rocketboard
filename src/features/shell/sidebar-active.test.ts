import { describe, expect, it } from "vitest";

import { resolveActiveSidebarItemId } from "./sidebar-active";

describe("resolveActiveSidebarItemId", () => {
  it("returns the project row when a project route is active", () => {
    expect(
      resolveActiveSidebarItemId({
        planId: "plan-1",
        projectId: "project-1",
      }),
    ).toBe("project:project-1");
  });

  it("returns the plan row when a plan route is active", () => {
    expect(resolveActiveSidebarItemId({ planId: "plan-1" })).toBe("plan:plan-1");
  });

  it("returns the initiative row when an initiative detail route is active", () => {
    expect(resolveActiveSidebarItemId({ initiativeId: "initiative-1" })).toBe(
      "initiative:initiative-1",
    );
  });

  it("returns null when the current route has no sidebar-backed item", () => {
    expect(resolveActiveSidebarItemId({})).toBeNull();
  });
});
