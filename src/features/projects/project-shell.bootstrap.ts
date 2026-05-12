import type { QueryClient } from "@tanstack/react-query";

import type { CustomFieldDefinition } from "../fields/field.types";
import type { ProjectSprintRecord } from "../sprints/sprint.types";
import type { CardRecord, ProjectPriorityOption, ProjectStatusOption } from "../cards/card.types";
import {
  projectCardsQueryOptions,
  projectFieldsQueryOptions,
  projectGroupsQueryOptions,
  projectPriorityOptionsQueryOptions,
  projectSprintsQueryOptions,
  projectStatusOptionsQueryOptions,
  projectTableViewStatesQueryOptions,
} from "./project-shell.queries";
import { projectShellRepository, type ProjectTableViewStatesResult } from "./project-shell.repository";
import type { ProjectGroupRecord } from "./project-group.types";

export type ProjectShellBootstrapSnapshot = {
  cards: CardRecord[];
  customFields: CustomFieldDefinition[];
  groups: ProjectGroupRecord[];
  priorityOptions: ProjectPriorityOption[];
  sprints: ProjectSprintRecord[];
  statusOptions: ProjectStatusOption[];
  tableViewStates: ProjectTableViewStatesResult;
};

export type ProjectShellBootstrapFetchResult = {
  isComplete: boolean;
  snapshot: Partial<ProjectShellBootstrapSnapshot>;
};

export async function fetchProjectShellBootstrap(projectId: string) {
  const results = await Promise.allSettled([
    projectShellRepository.getProjectCards(projectId),
    projectShellRepository.getProjectCustomFields(projectId),
    projectShellRepository.getProjectStatusOptions(projectId),
    projectShellRepository.getProjectPriorityOptions(projectId),
    projectShellRepository.getProjectGroups(projectId),
    projectShellRepository.getProjectSprints(projectId),
    projectShellRepository.getProjectTableViewStates(projectId),
  ]);

  const snapshot: Partial<ProjectShellBootstrapSnapshot> = {};
  let isComplete = true;

  const [
    cardsResult,
    customFieldsResult,
    statusOptionsResult,
    priorityOptionsResult,
    groupsResult,
    sprintsResult,
    tableViewStatesResult,
  ] = results;

  if (cardsResult?.status === "fulfilled") snapshot.cards = cardsResult.value;
  else isComplete = false;

  if (customFieldsResult?.status === "fulfilled") snapshot.customFields = customFieldsResult.value;
  else isComplete = false;

  if (statusOptionsResult?.status === "fulfilled") snapshot.statusOptions = statusOptionsResult.value;
  else isComplete = false;

  if (priorityOptionsResult?.status === "fulfilled") snapshot.priorityOptions = priorityOptionsResult.value;
  else isComplete = false;

  if (groupsResult?.status === "fulfilled") snapshot.groups = groupsResult.value;
  else isComplete = false;

  if (sprintsResult?.status === "fulfilled") snapshot.sprints = sprintsResult.value;
  else isComplete = false;

  if (tableViewStatesResult?.status === "fulfilled") snapshot.tableViewStates = tableViewStatesResult.value;
  else isComplete = false;

  return {
    isComplete,
    snapshot,
  } satisfies ProjectShellBootstrapFetchResult;
}

export function hydrateProjectShellBootstrap(
  queryClient: QueryClient,
  projectId: string,
  snapshot: Partial<ProjectShellBootstrapSnapshot>,
) {
  if (snapshot.cards !== undefined) {
    queryClient.setQueryData(
      projectCardsQueryOptions(projectId).queryKey,
      snapshot.cards,
    );
  }
  if (snapshot.customFields !== undefined) {
    queryClient.setQueryData(
      projectFieldsQueryOptions(projectId).queryKey,
      snapshot.customFields,
    );
  }
  if (snapshot.statusOptions !== undefined) {
    queryClient.setQueryData(
      projectStatusOptionsQueryOptions(projectId).queryKey,
      snapshot.statusOptions,
    );
  }
  if (snapshot.priorityOptions !== undefined) {
    queryClient.setQueryData(
      projectPriorityOptionsQueryOptions(projectId).queryKey,
      snapshot.priorityOptions,
    );
  }
  if (snapshot.groups !== undefined) {
    queryClient.setQueryData(
      projectGroupsQueryOptions(projectId).queryKey,
      snapshot.groups,
    );
  }
  if (snapshot.sprints !== undefined) {
    queryClient.setQueryData(
      projectSprintsQueryOptions(projectId).queryKey,
      snapshot.sprints,
    );
  }
  if (snapshot.tableViewStates !== undefined) {
    queryClient.setQueryData(
      projectTableViewStatesQueryOptions(projectId).queryKey,
      snapshot.tableViewStates,
    );
  }
}

export async function warmProjectShellBootstrap(
  queryClient: QueryClient,
  projectId: string,
) {
  try {
    const {isComplete, snapshot} = await fetchProjectShellBootstrap(projectId);
    hydrateProjectShellBootstrap(queryClient, projectId, snapshot);
    return isComplete;
  } catch {
    return false;
  }
}
