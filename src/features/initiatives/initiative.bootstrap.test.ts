import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  initiativeCardsQueryOptions,
  initiativeUpdatesQueryOptions,
  workspaceInitiativeSparklineQueryOptions,
  workspaceInitiativeSummariesQueryOptions,
  workspaceInitiativesQueryOptions,
} from "./initiative.queries";
import {
  hydrateInitiativeStartupSnapshot,
  warmInitiativeStartupSnapshot,
  type InitiativeStartupSnapshot,
} from "./initiative.bootstrap";
import { initiativeRepository } from "./initiative.repository";

vi.mock("./initiative.repository", () => ({
  initiativeRepository: {
    getInitiativeCards: vi.fn(),
    getInitiativeUpdates: vi.fn(),
    getWorkspaceInitiativeSparklines: vi.fn(),
    getWorkspaceInitiativeSummaries: vi.fn(),
    getWorkspaceInitiatives: vi.fn(),
  },
}));

function createQueryClient() {
  return {
    setQueryData: vi.fn(),
  } as unknown as QueryClient;
}

const SNAPSHOT: InitiativeStartupSnapshot = {
  cards: [],
  initiatives: [],
  sparklines: [],
  summaries: [],
  updates: [],
};

describe("initiative bootstrap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hydrates every initiative cache slice", () => {
    const queryClient = createQueryClient();

    hydrateInitiativeStartupSnapshot(
      queryClient,
      "workspace-1",
      "initiative-1",
      SNAPSHOT,
    );

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      workspaceInitiativesQueryOptions("workspace-1").queryKey,
      SNAPSHOT.initiatives,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      workspaceInitiativeSummariesQueryOptions("workspace-1").queryKey,
      SNAPSHOT.summaries,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      workspaceInitiativeSparklineQueryOptions("workspace-1").queryKey,
      SNAPSHOT.sparklines,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      initiativeCardsQueryOptions("initiative-1").queryKey,
      SNAPSHOT.cards,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      initiativeUpdatesQueryOptions("initiative-1").queryKey,
      SNAPSHOT.updates,
    );
  });

  it("returns true when the startup snapshot succeeds", async () => {
    vi.mocked(initiativeRepository.getWorkspaceInitiatives).mockResolvedValue([]);
    vi.mocked(initiativeRepository.getWorkspaceInitiativeSummaries).mockResolvedValue([]);
    vi.mocked(initiativeRepository.getWorkspaceInitiativeSparklines).mockResolvedValue([]);
    vi.mocked(initiativeRepository.getInitiativeCards).mockResolvedValue([]);
    vi.mocked(initiativeRepository.getInitiativeUpdates).mockResolvedValue([]);

    const queryClient = createQueryClient();

    await expect(
      warmInitiativeStartupSnapshot(queryClient, "workspace-1", "initiative-1"),
    ).resolves.toBe(true);
    expect(queryClient.setQueryData).toHaveBeenCalledTimes(5);
  });

  it("returns false when the startup snapshot fails", async () => {
    vi.mocked(initiativeRepository.getWorkspaceInitiatives).mockRejectedValue(
      new Error("boom"),
    );

    const queryClient = createQueryClient();

    await expect(
      warmInitiativeStartupSnapshot(queryClient, "workspace-1", "initiative-1"),
    ).resolves.toBe(false);
    expect(queryClient.setQueryData).not.toHaveBeenCalled();
  });
});
