import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  planReleasesQueryOptions,
  planScorecardQueryOptions,
  roadmapDataQueryOptions,
  workspacePlansQueryOptions,
} from "./plan.queries";
import {
  hydratePlanStartupSnapshot,
  warmPlanStartupSnapshot,
  type PlanStartupSnapshot,
} from "./plan.bootstrap";
import { planRepository } from "./plan.repository";
import type { PlanRecord } from "./plan.types";

vi.mock("./plan.repository", () => ({
  planRepository: {
    getReleases: vi.fn(),
    getRoadmapData: vi.fn(),
    getScorecardItems: vi.fn(),
    getWorkspacePlans: vi.fn(),
  },
}));

function createQueryClient() {
  return {
    setQueryData: vi.fn(),
  } as unknown as QueryClient;
}

const plans: PlanRecord[] = [
  {
    createdAt: "2026-04-11T00:00:00Z",
    description: null,
    id: "plan-1",
    name: "Plan",
    position: 0,
    views: [
      { configJson: null, id: "releases-view", name: "Releases", position: 0, viewType: "releases" as const },
      { configJson: null, id: "roadmap-view", name: "Roadmap", position: 1, viewType: "roadmap" as const },
      { configJson: null, id: "scorecard-view", name: "Scorecard", position: 2, viewType: "scorecard" as const },
    ],
    workspaceId: "workspace-1",
  },
];

const SNAPSHOT: PlanStartupSnapshot = {
  plans,
  releasesByViewId: {
    "releases-view": [],
  },
  roadmapByViewId: {
    "roadmap-view": { cells: [], items: [], lanes: [], milestones: [] },
  },
  scorecardByViewId: {
    "scorecard-view": [],
  },
};

describe("plan bootstrap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hydrates workspace plans and per-view caches", () => {
    const queryClient = createQueryClient();

    hydratePlanStartupSnapshot(queryClient, "workspace-1", SNAPSHOT);

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      workspacePlansQueryOptions("workspace-1").queryKey,
      SNAPSHOT.plans,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      planReleasesQueryOptions("releases-view").queryKey,
      SNAPSHOT.releasesByViewId["releases-view"],
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      roadmapDataQueryOptions("roadmap-view").queryKey,
      SNAPSHOT.roadmapByViewId["roadmap-view"],
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      planScorecardQueryOptions("scorecard-view").queryKey,
      SNAPSHOT.scorecardByViewId["scorecard-view"],
    );
  });

  it("returns true when the snapshot succeeds", async () => {
    vi.mocked(planRepository.getWorkspacePlans).mockResolvedValue(plans);
    vi.mocked(planRepository.getReleases).mockResolvedValue([]);
    vi.mocked(planRepository.getRoadmapData).mockResolvedValue({
      cells: [],
      items: [],
      lanes: [],
      milestones: [],
    });
    vi.mocked(planRepository.getScorecardItems).mockResolvedValue([]);

    const queryClient = createQueryClient();

    await expect(
      warmPlanStartupSnapshot(queryClient, "workspace-1", "plan-1"),
    ).resolves.toBe(true);
    expect(queryClient.setQueryData).toHaveBeenCalled();
  });

  it("returns false when the snapshot cannot find the requested plan", async () => {
    vi.mocked(planRepository.getWorkspacePlans).mockResolvedValue([]);

    const queryClient = createQueryClient();

    await expect(
      warmPlanStartupSnapshot(queryClient, "workspace-1", "plan-1"),
    ).resolves.toBe(false);
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
  });
});
