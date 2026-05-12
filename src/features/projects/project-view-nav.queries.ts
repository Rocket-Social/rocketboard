import { useMutation, useQueryClient } from "@tanstack/react-query";

import { projectViewRepository } from "./project-view.repository";
import { invalidateAllProjectData } from "./project-shell.queries";
import type {
  WorkspaceProjectSummary,
  WorkspaceSummary,
} from "./project-shell.types";
import {
  sortProjectViews,
  type ProjectViewNavItem,
  type ProjectViewType,
} from "./project-view.model";
import {
  optimisticallyUpdateWorkspaceSummaries,
  restoreWorkspaceSummarySnapshots,
  updateWorkspaceSummaries,
} from "./workspace-summary-cache";

function setProjectDefaultView(
  project: WorkspaceProjectSummary,
  projectViewId: string,
): WorkspaceProjectSummary {
  if (!project.projectViews.some((view) => view.id === projectViewId)) {
    return project;
  }

  return {
    ...project,
    defaultProjectViewId: projectViewId,
    projectViews: project.projectViews.map((view) => ({
      ...view,
      isDefault: view.id === projectViewId,
    })),
  };
}

function setDefaultViewInWorkspaceSummaries(
  workspaces: WorkspaceSummary[],
  projectViewId: string,
): WorkspaceSummary[] {
  return updateWorkspaceSummaries(workspaces, (project) =>
    setProjectDefaultView(project, projectViewId),
  );
}

function appendProjectView(
  project: WorkspaceProjectSummary,
  projectId: string,
  nextView: ProjectViewNavItem,
): WorkspaceProjectSummary {
  if (
    project.id !== projectId ||
    project.projectViews.some((view) => view.id === nextView.id)
  ) {
    return project;
  }

  return {
    ...project,
    projectViews: sortProjectViews([...project.projectViews, nextView]),
  };
}

function appendProjectViewInWorkspaceSummaries(
  workspaces: WorkspaceSummary[],
  projectId: string,
  nextView: ProjectViewNavItem,
): WorkspaceSummary[] {
  return updateWorkspaceSummaries(workspaces, (project) =>
    appendProjectView(project, projectId, nextView),
  );
}

function renameProjectView(
  project: WorkspaceProjectSummary,
  projectViewId: string,
  name: string,
): WorkspaceProjectSummary {
  let didChange = false;

  const projectViews = project.projectViews.map((view) => {
    if (view.id !== projectViewId || view.name === name) {
      return view;
    }

    didChange = true;
    return {
      ...view,
      name,
    };
  });

  return didChange
    ? {
        ...project,
        projectViews,
      }
    : project;
}

function renameProjectViewInWorkspaceSummaries(
  workspaces: WorkspaceSummary[],
  projectViewId: string,
  name: string,
): WorkspaceSummary[] {
  return updateWorkspaceSummaries(workspaces, (project) =>
    renameProjectView(project, projectViewId, name),
  );
}

function setProjectViewHidden(
  project: WorkspaceProjectSummary,
  projectViewId: string,
  hidden: boolean,
): WorkspaceProjectSummary {
  let didChange = false;

  const projectViews = project.projectViews.map((view) => {
    if (view.id !== projectViewId || view.isHidden === hidden) {
      return view;
    }

    didChange = true;
    return {
      ...view,
      isHidden: hidden,
    };
  });

  return didChange
    ? {
        ...project,
        projectViews,
      }
    : project;
}

function setProjectViewHiddenInWorkspaceSummaries(
  workspaces: WorkspaceSummary[],
  projectViewId: string,
  hidden: boolean,
): WorkspaceSummary[] {
  return updateWorkspaceSummaries(workspaces, (project) =>
    setProjectViewHidden(project, projectViewId, hidden),
  );
}

function refreshProjectData(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  void invalidateAllProjectData(queryClient, projectId);
}

export function useCreateProjectViewMutation(
  _workspaceSlug: string,
  _projectSlug: string,
  projectId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (viewType: ProjectViewType) =>
      projectViewRepository.createView(projectId, viewType),
    onSuccess: (view) => {
      const workspaceSummarySnapshots = queryClient.getQueriesData<
        WorkspaceSummary[]
      >({
        queryKey: ["project", "workspace-summaries"],
      });

      for (const [queryKey, workspaceSummaries] of workspaceSummarySnapshots) {
        if (!workspaceSummaries) {
          continue;
        }

        queryClient.setQueryData(
          queryKey,
          appendProjectViewInWorkspaceSummaries(
            workspaceSummaries,
            projectId,
            view,
          ),
        );
      }

      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useRenameProjectViewMutation(
  _workspaceSlug: string,
  _projectSlug: string,
  projectId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; projectViewId: string }) =>
      projectViewRepository.renameView(input.projectViewId, input.name),
    onMutate: (input) =>
      optimisticallyUpdateWorkspaceSummaries(
        queryClient,
        (workspaceSummaries) =>
          renameProjectViewInWorkspaceSummaries(
            workspaceSummaries,
            input.projectViewId,
            input.name,
          ),
      ),
    onError: (_error, _input, context) => {
      restoreWorkspaceSummarySnapshots(
        queryClient,
        context?.workspaceSummarySnapshots ?? [],
      );
    },
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useSetDefaultProjectViewMutation(
  _workspaceSlug: string,
  _projectSlug: string,
  projectId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectViewId: string) =>
      projectViewRepository.setDefaultView(projectViewId),
    onMutate: (projectViewId) =>
      optimisticallyUpdateWorkspaceSummaries(
        queryClient,
        (workspaceSummaries) =>
          setDefaultViewInWorkspaceSummaries(workspaceSummaries, projectViewId),
      ),
    onError: (_error, _projectViewId, context) => {
      restoreWorkspaceSummarySnapshots(
        queryClient,
        context?.workspaceSummarySnapshots ?? [],
      );
    },
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useSetProjectViewHiddenMutation(
  _workspaceSlug: string,
  _projectSlug: string,
  projectId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { hidden: boolean; projectViewId: string }) =>
      projectViewRepository.setHidden(input.projectViewId, input.hidden),
    onMutate: (input) =>
      optimisticallyUpdateWorkspaceSummaries(
        queryClient,
        (workspaceSummaries) =>
          setProjectViewHiddenInWorkspaceSummaries(
            workspaceSummaries,
            input.projectViewId,
            input.hidden,
          ),
      ),
    onError: (_error, _input, context) => {
      restoreWorkspaceSummarySnapshots(
        queryClient,
        context?.workspaceSummarySnapshots ?? [],
      );
    },
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}

export function useReorderProjectViewsMutation(
  _workspaceSlug: string,
  _projectSlug: string,
  projectId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedVisibleViewIds: string[]) =>
      projectViewRepository.reorderViews(projectId, orderedVisibleViewIds),
    onSuccess: () => {
      refreshProjectData(queryClient, projectId);
    },
  });
}
