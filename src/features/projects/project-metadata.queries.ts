import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ProjectPriorityOption,
  ProjectStatusOption,
  StatusCategory,
} from "../cards/card.types";
import {
  patchProjectPriorityOptions,
  patchProjectStatusOptions,
} from "./project-data.cache";
import {
  restoreQuerySnapshots,
  runInBackground,
  snapshotQueries,
} from "./project-mutation.utils";
import {
  invalidateAllProjectData,
  invalidateProjectDataSlices,
  workspaceSummariesQueryOptions,
} from "./project-shell.queries";
import {
  optimisticallyUpdateWorkspaceSummaries,
  restoreWorkspaceSummarySnapshots,
  type WorkspaceSummarySnapshot,
} from "./workspace-summary-cache";
import { projectMetadataRepository } from "./project-metadata.repository";
import type { BuiltinTableFieldKey } from "./builtin-fields";
const statusCategoryOrder: Record<StatusCategory, number> = {
  completed: 2,
  not_started: 0,
  started: 1,
};

function sortStatusOptions(options: ProjectStatusOption[]) {
  return [...options].sort(
    (left, right) =>
      statusCategoryOrder[left.category] -
        statusCategoryOrder[right.category] || left.position - right.position,
  );
}

function sortPriorityOptions(options: ProjectPriorityOption[]) {
  return [...options].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, { snapshots: WorkspaceSummarySnapshot[] }>({
    mutationFn: (projectId: string) =>
      projectMetadataRepository.deleteProject(projectId),
    // Optimistically drop the deleted project from the sidebar the moment
    // the user confirms. invalidateQueries alone (below) is supposed to
    // refetch and update the list, but in practice it leaves the sidebar
    // showing the dead project until a hard refresh. This keeps the UX
    // immediate and the invalidate still runs on success as a consistency
    // backstop.
    onMutate: async (projectId) => {
      const { workspaceSummarySnapshots } = await optimisticallyUpdateWorkspaceSummaries(
        queryClient,
        (workspaces) =>
          workspaces.map((workspace) => ({
            ...workspace,
            projects: workspace.projects.filter((project) => project.id !== projectId),
          })),
      );
      return { snapshots: workspaceSummarySnapshots };
    },
    onError: (_error, _projectId, context) => {
      if (context?.snapshots) {
        restoreWorkspaceSummarySnapshots(queryClient, context.snapshots);
      }
    },
    onSuccess: async (_data, projectId) => {
      // Force a fresh workspaces fetch (not just an invalidate) so any
      // server-side changes the optimistic update missed get reconciled.
      await queryClient.fetchQuery({
        ...workspaceSummariesQueryOptions(),
        staleTime: 0,
      });
      await invalidateAllProjectData(queryClient, projectId);
    },
  });
}

export function useRenameProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; projectId: string }) =>
      projectMetadataRepository.renameProject(input.projectId, input.name),
    onSuccess: async (_data, input) => {
      await invalidateAllProjectData(queryClient, input.projectId);
    },
  });
}

export function useSetProjectBuiltinFieldLabelMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      fieldKey: BuiltinTableFieldKey;
      label: string | null;
    }) =>
      projectMetadataRepository.setBuiltinFieldLabel(
        projectId,
        input.fieldKey,
        input.label,
      ),
    onSuccess: async () => {
      await invalidateAllProjectData(queryClient, projectId);
    },
  });
}

export function useAddStatusOptionMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { category: StatusCategory; label: string }) =>
      projectMetadataRepository.addStatusOption(
        projectId,
        input.label,
        input.category,
      ),
    onSuccess: (option) => {
      patchProjectStatusOptions(queryClient, projectId, (options) =>
        sortStatusOptions([...options, option]),
      );
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, ["status-options"]),
      );
    },
  });
}

export function useRenameStatusOptionMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { newLabel: string; optionId: string }) =>
      projectMetadataRepository.renameStatusOption(
        input.optionId,
        input.newLabel,
      ),
    onMutate: async (input) => {
      const statusSnapshots = await snapshotQueries<ProjectStatusOption[]>(
        queryClient,
        ["project", "status-options", projectId],
      );

      patchProjectStatusOptions(queryClient, projectId, (options) =>
        options.map((option) =>
          option.id === input.optionId
            ? { ...option, label: input.newLabel }
            : option,
        ),
      );

      return { statusSnapshots };
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.statusSnapshots ?? []);
    },
    onSuccess: () => {
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, ["status-options"]),
      );
    },
  });
}

export function useDeleteStatusOptionMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (optionId: string) =>
      projectMetadataRepository.deleteStatusOption(optionId),
    onSuccess: (_result, optionId) => {
      patchProjectStatusOptions(queryClient, projectId, (options) =>
        options.filter((option) => option.id !== optionId),
      );
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, [
          "cards",
          "status-options",
        ]),
      );
    },
  });
}

export function useSetStatusOptionColorMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { color: string | null; optionId: string }) =>
      projectMetadataRepository.setStatusOptionColor(
        input.optionId,
        input.color,
      ),
    onMutate: async (input) => {
      const statusSnapshots = await snapshotQueries<ProjectStatusOption[]>(
        queryClient,
        ["project", "status-options", projectId],
      );

      patchProjectStatusOptions(queryClient, projectId, (options) =>
        options.map((option) =>
          option.id === input.optionId
            ? { ...option, color: input.color }
            : option,
        ),
      );

      return { statusSnapshots };
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.statusSnapshots ?? []);
    },
    onSuccess: () => {
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, ["status-options"]),
      );
    },
  });
}

export function useAddPriorityOptionMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { color?: string | null; label: string }) =>
      projectMetadataRepository.addPriorityOption(
        projectId,
        input.label,
        input.color,
      ),
    onSuccess: (option) => {
      patchProjectPriorityOptions(queryClient, projectId, (options) =>
        sortPriorityOptions([...options, option]),
      );
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, [
          "priority-options",
        ]),
      );
    },
  });
}

export function useRenamePriorityOptionMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { newLabel: string; optionId: string }) =>
      projectMetadataRepository.renamePriorityOption(
        input.optionId,
        input.newLabel,
      ),
    onMutate: async (input) => {
      const prioritySnapshots = await snapshotQueries<ProjectPriorityOption[]>(
        queryClient,
        ["project", "priority-options", projectId],
      );

      patchProjectPriorityOptions(queryClient, projectId, (options) =>
        options.map((option) =>
          option.id === input.optionId
            ? { ...option, label: input.newLabel }
            : option,
        ),
      );

      return { prioritySnapshots };
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.prioritySnapshots ?? []);
    },
    onSuccess: () => {
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, [
          "priority-options",
        ]),
      );
    },
  });
}

export function useDeletePriorityOptionMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (optionId: string) =>
      projectMetadataRepository.deletePriorityOption(optionId),
    onSuccess: (_result, optionId) => {
      patchProjectPriorityOptions(queryClient, projectId, (options) =>
        options.filter((option) => option.id !== optionId),
      );
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, [
          "cards",
          "priority-options",
        ]),
      );
    },
  });
}

export function useSetPriorityOptionColorMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { color: string | null; optionId: string }) =>
      projectMetadataRepository.setPriorityOptionColor(
        input.optionId,
        input.color,
      ),
    onMutate: async (input) => {
      const prioritySnapshots = await snapshotQueries<ProjectPriorityOption[]>(
        queryClient,
        ["project", "priority-options", projectId],
      );

      patchProjectPriorityOptions(queryClient, projectId, (options) =>
        options.map((option) =>
          option.id === input.optionId
            ? { ...option, color: input.color }
            : option,
        ),
      );

      return { prioritySnapshots };
    },
    onError: (_error, _input, context) => {
      restoreQuerySnapshots(queryClient, context?.prioritySnapshots ?? []);
    },
    onSuccess: () => {
      runInBackground(
        invalidateProjectDataSlices(queryClient, projectId, [
          "priority-options",
        ]),
      );
    },
  });
}
