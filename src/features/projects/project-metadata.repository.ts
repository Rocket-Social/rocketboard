import { rpcAdapter } from "../../platform/data/rpc-adapter";
import type {
  ProjectPriorityOption,
  ProjectStatusOption,
  StatusCategory,
} from "../cards/card.types";
import type { BuiltinTableFieldKey } from "./builtin-fields";

export type ProjectBuiltinLabelsPayload = Record<string, unknown>;

type AddProjectStatusOptionRow = {
  optionCategory: StatusCategory;
  optionId: string;
  optionIsDefault: boolean;
  optionKey: string;
  optionLabel: string;
  optionPosition: number;
};

type AddProjectPriorityOptionRow = {
  optionColor: string | null;
  optionId: string;
  optionIsDefault: boolean;
  optionKey: string;
  optionLabel: string;
  optionSortOrder: number;
};

export type ProjectMetadataRepository = {
  addPriorityOption(
    projectId: string,
    label: string,
    color?: string | null,
  ): Promise<ProjectPriorityOption>;
  addStatusOption(
    projectId: string,
    label: string,
    category: StatusCategory,
  ): Promise<ProjectStatusOption>;
  deleteProject(projectId: string): Promise<void>;
  deletePriorityOption(optionId: string): Promise<{ reassignedCount: number }>;
  deleteStatusOption(
    optionId: string,
  ): Promise<{ reassignedCount: number; reassignedTo: string }>;
  renamePriorityOption(optionId: string, newLabel: string): Promise<void>;
  renameProject(projectId: string, name: string): Promise<void>;
  renameStatusOption(optionId: string, newLabel: string): Promise<void>;
  setPriorityOptionColor(optionId: string, color: string | null): Promise<void>;
  setStatusOptionColor(optionId: string, color: string | null): Promise<void>;
  setBuiltinFieldLabel(
    projectId: string,
    fieldKey: BuiltinTableFieldKey,
    label: string | null,
  ): Promise<ProjectBuiltinLabelsPayload>;
};

export const projectMetadataRepository: ProjectMetadataRepository = {
  async deleteProject(projectId) {
    await rpcAdapter.call("delete_project", { target_project_id: projectId });
  },
  async renameProject(projectId, name) {
    await rpcAdapter.call("rename_project", {
      target_name: name,
      target_project_id: projectId,
    });
  },
  async setBuiltinFieldLabel(projectId, fieldKey, label) {
    return (
      (await rpcAdapter.call("set_project_builtin_field_label", {
        target_field_key: fieldKey,
        target_label: label?.trim() || null,
        target_project_id: projectId,
      })) ?? {}
    );
  },
  async addStatusOption(
    projectId: string,
    label: string,
    category: StatusCategory,
  ) {
    const option = await rpcAdapter.callSingle<AddProjectStatusOptionRow>(
      "add_project_status_option",
      {
        target_category: category,
        target_label: label,
        target_project_id: projectId,
      },
    );

    if (!option) {
      throw new Error("Status option could not be created.");
    }

    return {
      category: option.optionCategory,
      color: null,
      id: option.optionId,
      isDefault: option.optionIsDefault,
      key: option.optionKey,
      label: option.optionLabel,
      position: option.optionPosition,
    };
  },
  async renameStatusOption(optionId: string, newLabel: string) {
    await rpcAdapter.call("rename_project_status_option", {
      target_new_label: newLabel,
      target_option_id: optionId,
    });
  },
  async setStatusOptionColor(optionId: string, color: string | null) {
    await rpcAdapter.call("set_project_status_option_color", {
      target_color: color,
      target_option_id: optionId,
    });
  },
  async deleteStatusOption(
    optionId: string,
  ): Promise<{ reassignedCount: number; reassignedTo: string }> {
    return (
      (await rpcAdapter.callSingle<{
        reassignedCount: number;
        reassignedTo: string;
      }>("delete_project_status_option", {
        target_option_id: optionId,
      })) ?? { reassignedCount: 0, reassignedTo: "" }
    );
  },
  async addPriorityOption(
    projectId: string,
    label: string,
    color?: string | null,
  ) {
    const option = await rpcAdapter.callSingle<AddProjectPriorityOptionRow>(
      "add_project_priority_option",
      {
        target_color: color ?? null,
        target_label: label,
        target_project_id: projectId,
      },
    );

    if (!option) {
      throw new Error("Priority option could not be created.");
    }

    return {
      color: option.optionColor,
      id: option.optionId,
      isDefault: option.optionIsDefault,
      key: option.optionKey,
      label: option.optionLabel,
      sortOrder: option.optionSortOrder,
    };
  },
  async renamePriorityOption(optionId: string, newLabel: string) {
    await rpcAdapter.call("rename_project_priority_option", {
      target_new_label: newLabel,
      target_option_id: optionId,
    });
  },
  async setPriorityOptionColor(optionId: string, color: string | null) {
    await rpcAdapter.call("set_project_priority_option_color", {
      target_color: color,
      target_option_id: optionId,
    });
  },
  async deletePriorityOption(
    optionId: string,
  ): Promise<{ reassignedCount: number }> {
    return (
      (await rpcAdapter.callSingle<{ reassignedCount: number }>(
        "delete_project_priority_option",
        {
          target_option_id: optionId,
        },
      )) ?? { reassignedCount: 0 }
    );
  },
};
