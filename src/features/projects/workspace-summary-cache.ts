import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "./project-shell.types";

export type WorkspaceSummarySnapshot = [
  QueryKey,
  WorkspaceSummary[] | undefined,
];

export function updateWorkspaceSummaries(
  workspaces: WorkspaceSummary[],
  updateProject: (project: WorkspaceProjectSummary) => WorkspaceProjectSummary,
): WorkspaceSummary[] {
  let didChange = false;

  const nextWorkspaces = workspaces.map((workspace) => {
    let workspaceDidChange = false;
    const nextProjects = workspace.projects.map((project) => {
      const nextProject = updateProject(project);

      if (nextProject !== project) {
        didChange = true;
        workspaceDidChange = true;
      }

      return nextProject;
    });

    return workspaceDidChange
      ? {
          ...workspace,
          projects: nextProjects,
        }
      : workspace;
  });

  return didChange ? nextWorkspaces : workspaces;
}

export async function optimisticallyUpdateWorkspaceSummaries(
  queryClient: QueryClient,
  updater: (workspaces: WorkspaceSummary[]) => WorkspaceSummary[],
) {
  await queryClient.cancelQueries({ queryKey: ["project", "workspace-summaries"] });

  const workspaceSummarySnapshots = queryClient.getQueriesData<
    WorkspaceSummary[]
  >({
    queryKey: ["project", "workspace-summaries"],
  });

  for (const [queryKey, workspaceSummaries] of workspaceSummarySnapshots) {
    if (!workspaceSummaries) {
      continue;
    }

    queryClient.setQueryData(queryKey, updater(workspaceSummaries));
  }

  return { workspaceSummarySnapshots };
}

export function restoreWorkspaceSummarySnapshots(
  queryClient: QueryClient,
  snapshots: WorkspaceSummarySnapshot[],
) {
  for (const [queryKey, workspaceSummaries] of snapshots) {
    queryClient.setQueryData(queryKey, workspaceSummaries);
  }
}

export function reorderWorkspaceProjectsInSummaries(
  workspaces: WorkspaceSummary[],
  workspaceId: string,
  orderedProjectIds: string[],
): WorkspaceSummary[] {
  let didChange = false;

  const nextWorkspaces = workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace;
    }

    const projectsById = new Map(
      workspace.projects.map((project) => [project.id, project]),
    );
    const seenProjectIds = new Set<string>();
    const nextProjects: WorkspaceProjectSummary[] = [];

    for (const projectId of orderedProjectIds) {
      const project = projectsById.get(projectId);

      if (!project || seenProjectIds.has(projectId)) {
        continue;
      }

      seenProjectIds.add(projectId);
      nextProjects.push(project);
    }

    for (const project of workspace.projects) {
      if (!seenProjectIds.has(project.id)) {
        nextProjects.push(project);
      }
    }

    const projectsChanged = nextProjects.some(
      (project, index) => project !== workspace.projects[index],
    );
    const nextDefaultProjectSlug =
      nextProjects[0]?.slug ?? workspace.defaultProjectSlug;

    if (
      !projectsChanged &&
      nextDefaultProjectSlug === workspace.defaultProjectSlug
    ) {
      return workspace;
    }

    didChange = true;

    return {
      ...workspace,
      defaultProjectSlug: nextDefaultProjectSlug,
      projects: nextProjects,
    };
  });

  return didChange ? nextWorkspaces : workspaces;
}
