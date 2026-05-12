import { describe, expect, it } from "vitest";

import { isProjectRoute, resolveLayoutVariant } from "./resolve-layout-variant";

describe("isProjectRoute", () => {
  it("matches project routes under /workspaces/<id>/projects/", () => {
    expect(
      isProjectRoute("/org/abc/workspaces/main/projects/getting-started/board"),
    ).toBe(true);
    expect(
      isProjectRoute("/workspaces/anything/projects/anything/table/v1"),
    ).toBe(true);
  });

  it("does not match non-project signed-in routes", () => {
    expect(isProjectRoute("/my-notes")).toBe(false);
    expect(isProjectRoute("/wiki")).toBe(false);
    expect(isProjectRoute("/wiki/some-page")).toBe(false);
    expect(isProjectRoute("/ai-agents")).toBe(false);
    expect(isProjectRoute("/")).toBe(false);
  });

  it("does not match partial-looking paths", () => {
    expect(isProjectRoute("/workspaces/main")).toBe(false);
    expect(isProjectRoute("/projects/foo")).toBe(false);
  });
});

describe("resolveLayoutVariant (regression)", () => {
  it("returns fixed-viewport for project routes via isProjectRoute", () => {
    expect(
      resolveLayoutVariant(
        "/org/abc/workspaces/main/projects/getting-started/board",
      ),
    ).toBe("fixed-viewport");
  });

  it("returns scroll for /wiki and /ai-agents", () => {
    expect(resolveLayoutVariant("/wiki")).toBe("scroll");
    expect(resolveLayoutVariant("/ai-agents")).toBe("scroll");
  });
});
