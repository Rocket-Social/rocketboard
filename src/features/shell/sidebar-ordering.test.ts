import { describe, expect, it } from "vitest";

import { mergeSidebarItems, type SidebarOrderEntry } from "./sidebar-ordering";
import type { WorkspaceProjectSummary } from "../projects/project-shell.types";
import type { PlanRecord } from "../plans/plan.types";
import type { InitiativeRecord } from "../initiatives/initiative.types";

function makeProject(id: string, name: string): WorkspaceProjectSummary {
  return {
    access: "open",
    builtinFieldLabels: {},
    builtinOptionLabels: {},
    defaultProjectViewId: `${id}-table`,
    icon: name[0]!,
    id,
    lastUpdatedLabel: "just now",
    memberCount: 1,
    name,
    priorityOptions: [],
    projectViews: [],
    slug: name.toLowerCase().replace(/\s/g, "-"),
    statusOptions: [],
    taskCount: 0,
  };
}

function makePlan(id: string, name: string): PlanRecord {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    description: null,
    id,
    name,
    position: 0,
    views: [],
    workspaceId: "ws-1",
  };
}

function makeInitiative(id: string, name: string): InitiativeRecord {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    description: null,
    health: "on_track",
    id,
    latestUpdateAt: null,
    latestUpdateText: null,
    leadName: null,
    leadUserId: null,
    name,
    position: 0,
    status: "active",
    targetDate: null,
    updatedAt: "2026-01-01T00:00:00Z",
    visibility: "open",
    workspaceId: "ws-1",
  };
}

describe("mergeSidebarItems", () => {
  it("returns items in saved order, appends new items at bottom", () => {
    const savedOrder: SidebarOrderEntry[] = [
      { type: "plan", id: "plan-1" },
      { type: "project", id: "proj-1" },
      { type: "initiative", id: "init-1" },
    ];

    const projects = [makeProject("proj-1", "Alpha"), makeProject("proj-2", "Beta")];
    const plans = [makePlan("plan-1", "Q2 Roadmap")];
    const initiatives = [makeInitiative("init-1", "Design Goals")];

    const result = mergeSidebarItems(savedOrder, projects, plans, initiatives);

    expect(result.map((item) => `${item.type}:${item.id}`)).toEqual([
      "plan:plan-1",
      "project:proj-1",
      "initiative:init-1",
      "project:proj-2", // new item appended at bottom
    ]);
  });

  it("silently drops items from saved order that no longer exist in data", () => {
    const savedOrder: SidebarOrderEntry[] = [
      { type: "project", id: "proj-deleted" },
      { type: "project", id: "proj-1" },
    ];

    const projects = [makeProject("proj-1", "Alpha")];
    const plans: PlanRecord[] = [];
    const initiatives: InitiativeRecord[] = [];

    const result = mergeSidebarItems(savedOrder, projects, plans, initiatives);

    expect(result.map((item) => `${item.type}:${item.id}`)).toEqual([
      "project:proj-1",
    ]);
  });

  it("with no saved order returns items in insertion order", () => {
    const savedOrder: SidebarOrderEntry[] = [];

    const projects = [makeProject("proj-1", "Alpha")];
    const plans = [makePlan("plan-1", "Roadmap")];
    const initiatives = [makeInitiative("init-1", "Goals")];

    const result = mergeSidebarItems(savedOrder, projects, plans, initiatives);

    // All items appended in the order they were added to the map
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe("project");
    expect(result[1]!.type).toBe("plan");
    expect(result[2]!.type).toBe("initiative");
  });
});
