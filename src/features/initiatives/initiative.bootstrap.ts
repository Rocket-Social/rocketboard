import type { QueryClient } from "@tanstack/react-query";

import { initiativeRepository } from "./initiative.repository";
import {
  initiativeCardsQueryOptions,
  initiativeUpdatesQueryOptions,
  workspaceInitiativeSparklineQueryOptions,
  workspaceInitiativeSummariesQueryOptions,
  workspaceInitiativesQueryOptions,
} from "./initiative.queries";
import type {
  InitiativeCardRecord,
  InitiativeRecord,
  InitiativeSparklinePoint,
  InitiativeSummary,
  InitiativeUpdateRecord,
} from "./initiative.types";

export type InitiativeStartupSnapshot = {
  cards: InitiativeCardRecord[];
  initiatives: InitiativeRecord[];
  sparklines: InitiativeSparklinePoint[];
  summaries: InitiativeSummary[];
  updates: InitiativeUpdateRecord[];
};

export async function fetchInitiativeStartupSnapshot(
  workspaceId: string,
  initiativeId: string,
) {
  const [initiatives, summaries, sparklines, cards, updates] = await Promise.all([
    initiativeRepository.getWorkspaceInitiatives(workspaceId),
    initiativeRepository.getWorkspaceInitiativeSummaries(workspaceId),
    initiativeRepository.getWorkspaceInitiativeSparklines(workspaceId),
    initiativeRepository.getInitiativeCards(initiativeId),
    initiativeRepository.getInitiativeUpdates(initiativeId),
  ]);

  return {
    cards,
    initiatives,
    sparklines,
    summaries,
    updates,
  } satisfies InitiativeStartupSnapshot;
}

export function hydrateInitiativeStartupSnapshot(
  queryClient: QueryClient,
  workspaceId: string,
  initiativeId: string,
  snapshot: InitiativeStartupSnapshot,
) {
  queryClient.setQueryData(
    workspaceInitiativesQueryOptions(workspaceId).queryKey,
    snapshot.initiatives,
  );
  queryClient.setQueryData(
    workspaceInitiativeSummariesQueryOptions(workspaceId).queryKey,
    snapshot.summaries,
  );
  queryClient.setQueryData(
    workspaceInitiativeSparklineQueryOptions(workspaceId).queryKey,
    snapshot.sparklines,
  );
  queryClient.setQueryData(
    initiativeCardsQueryOptions(initiativeId).queryKey,
    snapshot.cards,
  );
  queryClient.setQueryData(
    initiativeUpdatesQueryOptions(initiativeId).queryKey,
    snapshot.updates,
  );
}

export async function warmInitiativeStartupSnapshot(
  queryClient: QueryClient,
  workspaceId: string,
  initiativeId: string,
) {
  try {
    const snapshot = await fetchInitiativeStartupSnapshot(workspaceId, initiativeId);
    hydrateInitiativeStartupSnapshot(queryClient, workspaceId, initiativeId, snapshot);
    return true;
  } catch {
    return false;
  }
}
