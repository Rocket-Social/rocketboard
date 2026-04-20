import type { QueryClient } from "@tanstack/react-query";

import { planRepository } from "./plan.repository";
import {
  planReleasesQueryOptions,
  planScorecardQueryOptions,
  roadmapDataQueryOptions,
  workspacePlansQueryOptions,
} from "./plan.queries";
import type {
  PlanRecord,
  ReleaseRecord,
  RoadmapData,
  ScorecardItem,
} from "./plan.types";

export type PlanStartupSnapshot = {
  plans: PlanRecord[];
  releasesByViewId: Record<string, ReleaseRecord[]>;
  roadmapByViewId: Record<string, RoadmapData>;
  scorecardByViewId: Record<string, ScorecardItem[]>;
};

export async function fetchPlanStartupSnapshot(
  workspaceId: string,
  planId: string,
) {
  const plans = await planRepository.getWorkspacePlans(workspaceId);
  const plan = plans.find((candidate) => candidate.id === planId) ?? null;

  if (!plan) {
    throw new Error("PLAN_STARTUP_SNAPSHOT_NOT_FOUND");
  }

  const releasesViews = plan.views.filter((view) => view.viewType === "releases");
  const roadmapViews = plan.views.filter((view) => view.viewType === "roadmap");
  const scorecardViews = plan.views.filter((view) => view.viewType === "scorecard");

  const [releasesEntries, roadmapEntries, scorecardEntries] = await Promise.all([
    Promise.all(
      releasesViews.map(async (view) => [view.id, await planRepository.getReleases(view.id)] as const),
    ),
    Promise.all(
      roadmapViews.map(async (view) => [view.id, await planRepository.getRoadmapData(view.id)] as const),
    ),
    Promise.all(
      scorecardViews.map(
        async (view) => [view.id, await planRepository.getScorecardItems(view.id)] as const,
      ),
    ),
  ]);

  return {
    plans,
    releasesByViewId: Object.fromEntries(releasesEntries),
    roadmapByViewId: Object.fromEntries(roadmapEntries),
    scorecardByViewId: Object.fromEntries(scorecardEntries),
  } satisfies PlanStartupSnapshot;
}

export function hydratePlanStartupSnapshot(
  queryClient: QueryClient,
  workspaceId: string,
  snapshot: PlanStartupSnapshot,
) {
  queryClient.setQueryData(
    workspacePlansQueryOptions(workspaceId).queryKey,
    snapshot.plans,
  );

  Object.entries(snapshot.releasesByViewId).forEach(([viewId, releases]) => {
    queryClient.setQueryData(planReleasesQueryOptions(viewId).queryKey, releases);
  });

  Object.entries(snapshot.roadmapByViewId).forEach(([viewId, roadmap]) => {
    queryClient.setQueryData(roadmapDataQueryOptions(viewId).queryKey, roadmap);
  });

  Object.entries(snapshot.scorecardByViewId).forEach(([viewId, items]) => {
    queryClient.setQueryData(planScorecardQueryOptions(viewId).queryKey, items);
  });
}

export async function warmPlanStartupSnapshot(
  queryClient: QueryClient,
  workspaceId: string,
  planId: string,
) {
  try {
    const snapshot = await fetchPlanStartupSnapshot(workspaceId, planId);
    hydratePlanStartupSnapshot(queryClient, workspaceId, snapshot);
    return true;
  } catch {
    return false;
  }
}
