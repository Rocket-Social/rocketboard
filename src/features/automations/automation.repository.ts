import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {
  PersistedAutomationRuleDraft,
  AutomationRule,
  AutomationRun,
} from './automation.types'

export type CreateProjectAutomationInput = PersistedAutomationRuleDraft & {
  projectId: string
}

export type UpdateProjectAutomationInput = PersistedAutomationRuleDraft & {
  automationId: string
}

export type ListProjectAutomationRunsInput = {
  cursor?: string | null
  limit?: number
  projectId: string
}

export type AutomationRepository = {
  createProjectAutomation(input: CreateProjectAutomationInput): Promise<AutomationRule>
  deleteProjectAutomation(automationId: string): Promise<void>
  listProjectAutomationRuns(input: ListProjectAutomationRunsInput): Promise<AutomationRun[]>
  listProjectAutomations(projectId: string): Promise<AutomationRule[]>
  pauseProjectAutomation(automationId: string): Promise<AutomationRule>
  reorderProjectAutomations(projectId: string, automationIds: string[]): Promise<void>
  resumeProjectAutomation(automationId: string): Promise<AutomationRule>
  updateProjectAutomation(input: UpdateProjectAutomationInput): Promise<AutomationRule>
}

export const automationRepository: AutomationRepository = {
  async createProjectAutomation(input) {
    return await rpcAdapter.callAndTransform<AutomationRule>('create_project_automation', {
      target_actions: input.actions,
      target_condition_clauses: input.conditionClauses,
      target_project_id: input.projectId,
      target_status: input.status,
      target_trigger_config: input.triggerConfig,
      target_trigger_type: input.triggerType,
    })
  },
  async deleteProjectAutomation(automationId) {
    await rpcAdapter.call('delete_project_automation', {
      target_automation_id: automationId,
    })
  },
  async listProjectAutomationRuns(input) {
    return (await rpcAdapter.callAndTransform<AutomationRun[]>('list_project_automation_runs', {
      target_cursor: input.cursor ?? null,
      target_limit: input.limit ?? 25,
      target_project_id: input.projectId,
    })) ?? []
  },
  async listProjectAutomations(projectId) {
    return (await rpcAdapter.callAndTransform<AutomationRule[]>('list_project_automations', {
      target_project_id: projectId,
    })) ?? []
  },
  async pauseProjectAutomation(automationId) {
    return await rpcAdapter.callAndTransform<AutomationRule>('pause_project_automation', {
      target_automation_id: automationId,
    })
  },
  async reorderProjectAutomations(projectId, automationIds) {
    await rpcAdapter.call('reorder_project_automations', {
      target_automation_ids: automationIds,
      target_project_id: projectId,
    })
  },
  async resumeProjectAutomation(automationId) {
    return await rpcAdapter.callAndTransform<AutomationRule>('resume_project_automation', {
      target_automation_id: automationId,
    })
  },
  async updateProjectAutomation(input) {
    return await rpcAdapter.callAndTransform<AutomationRule>('update_project_automation', {
      target_actions: input.actions,
      target_automation_id: input.automationId,
      target_condition_clauses: input.conditionClauses,
      target_status: input.status,
      target_trigger_config: input.triggerConfig,
      target_trigger_type: input.triggerType,
    })
  },
}
