import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  projectCardsQueryOptions,
  projectFieldsQueryOptions,
  projectGroupsQueryOptions,
  projectPriorityOptionsQueryOptions,
  projectSprintsQueryOptions,
  projectStatusOptionsQueryOptions,
  projectTableViewStatesQueryOptions,
} from "./project-shell.queries";
import {
  fetchProjectShellBootstrap,
  hydrateProjectShellBootstrap,
  warmProjectShellBootstrap,
  type ProjectShellBootstrapSnapshot,
} from "./project-shell.bootstrap";
import { projectShellRepository } from "./project-shell.repository";

vi.mock("./project-shell.repository", () => ({
  projectShellRepository: {
    getProjectCards: vi.fn(),
    getProjectCustomFields: vi.fn(),
    getProjectGroups: vi.fn(),
    getProjectPriorityOptions: vi.fn(),
    getProjectSprints: vi.fn(),
    getProjectStatusOptions: vi.fn(),
    getProjectTableViewStates: vi.fn(),
  },
}));

function createQueryClient() {
  return {
    setQueryData: vi.fn(),
  } as unknown as QueryClient;
}

const SNAPSHOT: ProjectShellBootstrapSnapshot = {
  cards: [],
  customFields: [],
  groups: [],
  priorityOptions: [],
  sprints: [],
  statusOptions: [],
  tableViewStates: {
    projectViewBackend: {
      message: null,
      status: "ready",
    },
    tableViewStates: {},
  },
};

describe("project-shell bootstrap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hydrates every existing project query key from the bootstrap snapshot", () => {
    const queryClient = createQueryClient();

    hydrateProjectShellBootstrap(queryClient, "project-1", SNAPSHOT);

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectCardsQueryOptions("project-1").queryKey,
      SNAPSHOT.cards,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectFieldsQueryOptions("project-1").queryKey,
      SNAPSHOT.customFields,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectStatusOptionsQueryOptions("project-1").queryKey,
      SNAPSHOT.statusOptions,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectPriorityOptionsQueryOptions("project-1").queryKey,
      SNAPSHOT.priorityOptions,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectGroupsQueryOptions("project-1").queryKey,
      SNAPSHOT.groups,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectSprintsQueryOptions("project-1").queryKey,
      SNAPSHOT.sprints,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      projectTableViewStatesQueryOptions("project-1").queryKey,
      SNAPSHOT.tableViewStates,
    );
  });

  it("returns true when the bootstrap snapshot fetch succeeds", async () => {
    vi.mocked(projectShellRepository.getProjectCards).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectCustomFields).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectStatusOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectPriorityOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectGroups).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectSprints).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectTableViewStates).mockResolvedValue(
      SNAPSHOT.tableViewStates,
    );

    const queryClient = createQueryClient();

    await expect(warmProjectShellBootstrap(queryClient, "project-1")).resolves.toBe(
      true,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledTimes(7);
  });

  it("hydrates the successful slices and returns false when one bootstrap query fails", async () => {
    vi.mocked(projectShellRepository.getProjectCards).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectCustomFields).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectStatusOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectPriorityOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectGroups).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectSprints).mockRejectedValue(
      new Error("auth lock timed out"),
    );
    vi.mocked(projectShellRepository.getProjectTableViewStates).mockResolvedValue(
      SNAPSHOT.tableViewStates,
    );

    const queryClient = createQueryClient();

    await expect(warmProjectShellBootstrap(queryClient, "project-1")).resolves.toBe(
      false,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledTimes(6);
    expect(queryClient.setQueryData).not.toHaveBeenCalledWith(
      projectSprintsQueryOptions("project-1").queryKey,
      expect.anything(),
    );
  });

  it("returns partial bootstrap data instead of rejecting the whole batch on one failed slice", async () => {
    vi.mocked(projectShellRepository.getProjectCards).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectCustomFields).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectStatusOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectPriorityOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectGroups).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectSprints).mockRejectedValue(
      new Error("auth lock timed out"),
    );
    vi.mocked(projectShellRepository.getProjectTableViewStates).mockResolvedValue(
      SNAPSHOT.tableViewStates,
    );

    await expect(fetchProjectShellBootstrap("project-1")).resolves.toEqual({
      isComplete: false,
      snapshot: {
        cards: [],
        customFields: [],
        groups: [],
        priorityOptions: [],
        statusOptions: [],
        tableViewStates: SNAPSHOT.tableViewStates,
      },
    });
  });

  it("returns false when the bootstrap snapshot fetch fails", async () => {
    vi.mocked(projectShellRepository.getProjectCards).mockRejectedValue(
      new Error("boom"),
    );
    vi.mocked(projectShellRepository.getProjectCustomFields).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectStatusOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectPriorityOptions).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectGroups).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectSprints).mockResolvedValue([]);
    vi.mocked(projectShellRepository.getProjectTableViewStates).mockResolvedValue(
      SNAPSHOT.tableViewStates,
    );

    const queryClient = createQueryClient();

    await expect(warmProjectShellBootstrap(queryClient, "project-1")).resolves.toBe(
      false,
    );
    expect(queryClient.setQueryData).toHaveBeenCalledTimes(6);
  });
});
