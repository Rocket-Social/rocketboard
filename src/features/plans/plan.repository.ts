import {normalizeRichTextDocument} from '../rich-text/rich-text'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {
  CreateReleaseInput,
  CreatePlanInput,
  CreateRoadmapItemInput,
  CreateRoadmapLaneInput,
  CreateScorecardItemInput,
  PlanRecord,
  PublicReleaseBoardSnapshot,
  ReleaseChecklistItem,
  ReleaseHealth,
  ReleaseLinkedCard,
  ReleaseLinkedSprint,
  ReleaseNoteSection,
  ReleasePickerCard,
  ReleasePickerSprint,
  ReleaseRecord,
  ReleaseShareSnapshot,
  ReleaseStatus,
  RoadmapData,
  RoadmapMilestoneType,
  ScorecardItem,
  UpdateReleaseChecklistInput,
  UpdateReleaseInput,
  UpdateReleaseNotesInput,
  UpdateRoadmapItemInput,
  UpdateScorecardItemInput,
} from './plan.types'

export type PlanRepository = {
  createPlan(input: CreatePlanInput): Promise<PlanRecord>
  createRelease(input: CreateReleaseInput): Promise<ReleaseRecord>
  createReleaseShareLink(planViewId: string): Promise<ReleaseShareSnapshot>
  createRoadmapItem(input: CreateRoadmapItemInput): Promise<{id: string}>
  createRoadmapLane(input: CreateRoadmapLaneInput): Promise<{id: string; position: number; title: string}>
  createRoadmapMilestone(input: {
    color?: string | null
    date: string
    label: string
    laneId?: string | null
    planViewId: string
    type?: RoadmapMilestoneType
  }): Promise<{id: string}>
  createScorecardItem(input: CreateScorecardItemInput): Promise<ScorecardItem>
  deletePlan(planId: string): Promise<void>
  deleteRelease(releaseId: string): Promise<void>
  renamePlan(planId: string, name: string): Promise<void>
  deleteRoadmapItem(itemId: string): Promise<void>
  deleteRoadmapLane(laneId: string): Promise<void>
  deleteRoadmapMilestone(milestoneId: string): Promise<void>
  deleteScorecardItem(itemId: string): Promise<void>
  getPublicReleaseShare(shareToken: string): Promise<PublicReleaseBoardSnapshot>
  getReleaseLinkedCards(releaseId: string): Promise<ReleaseLinkedCard[]>
  getReleaseLinkedSprints(releaseId: string): Promise<ReleaseLinkedSprint[]>
  getReleaseShareSnapshot(planViewId: string): Promise<ReleaseShareSnapshot | null>
  getReleases(planViewId: string): Promise<ReleaseRecord[]>
  getRoadmapData(planViewId: string): Promise<RoadmapData>
  getScorecardItems(planViewId: string): Promise<ScorecardItem[]>
  getWorkspacePlans(workspaceId: string): Promise<PlanRecord[]>
  getWorkspaceReleasePickerCards(workspaceId: string, releaseId: string): Promise<ReleasePickerCard[]>
  getWorkspaceReleasePickerSprints(workspaceId: string, releaseId: string): Promise<ReleasePickerSprint[]>
  linkCardsToRelease(releaseId: string, cardIds: string[]): Promise<void>
  linkSprintsToRelease(releaseId: string, sprintIds: string[]): Promise<void>
  reorderRelease(releaseId: string, newPosition: number): Promise<void>
  reorderScorecardItem(itemId: string, newPosition: number): Promise<void>
  revokeReleaseShareLink(planViewId: string): Promise<void>
  unlinkCardFromRelease(releaseId: string, cardId: string): Promise<void>
  unlinkSprintFromRelease(releaseId: string, sprintId: string): Promise<void>
  updatePlanViewConfig(viewId: string, config: Record<string, unknown>): Promise<void>
  updateRelease(input: UpdateReleaseInput): Promise<ReleaseRecord>
  updateReleaseChecklist(input: UpdateReleaseChecklistInput): Promise<ReleaseRecord>
  updateReleaseHealth(releaseId: string, health: ReleaseHealth): Promise<ReleaseRecord>
  updateReleaseNotes(input: UpdateReleaseNotesInput): Promise<ReleaseRecord>
  updateReleaseStatus(releaseId: string, status: ReleaseStatus): Promise<ReleaseRecord>
  updateRoadmapItem(input: UpdateRoadmapItemInput): Promise<void>
  updateRoadmapLane(input: {color?: string | null; group?: string | null; laneId: string; title?: string | null}): Promise<void>
  updateRoadmapMilestone(input: {color?: string | null; date?: string | null; label?: string | null; laneId?: string | null; milestoneId: string; type?: string | null}): Promise<void>
  updateScorecardItem(input: UpdateScorecardItemInput): Promise<ScorecardItem>
  upsertMatrixCell(input: {contentText: string; laneId: string; periodKey: string; planViewId: string}): Promise<void>
}

function hasOwn<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function asNumber(value: number | string | null | undefined) {
  return Number(value ?? 0)
}

function mapReleaseNoteSection(raw: Record<string, unknown>): ReleaseNoteSection {
  const rawContent = raw.content

  return {
    content: typeof rawContent === 'string'
      ? normalizeRichTextDocument(null, rawContent)
      : normalizeRichTextDocument(rawContent as Parameters<typeof normalizeRichTextDocument>[0]),
    label: typeof raw.label === 'string' ? raw.label : '',
  }
}

function mapReleaseChecklistItem(raw: Record<string, unknown>, fallbackId: string): ReleaseChecklistItem {
  return {
    checked: Boolean(raw.checked),
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null,
    checkedByName: typeof raw.checkedByName === 'string' ? raw.checkedByName : null,
    checkedByUserId: typeof raw.checkedByUserId === 'string' ? raw.checkedByUserId : null,
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : fallbackId,
    label: typeof raw.label === 'string' ? raw.label : '',
  }
}

/**
 * Post-process a snakeToCamel-converted release row to finalize embedded JSONB
 * arrays (noteSections, checklistItems) and coerce bigint count fields to number.
 */
function finalizeReleaseRecord(row: Record<string, unknown>): ReleaseRecord {
  const id = row.id as string
  const noteSections = Array.isArray(row.noteSections) ? row.noteSections : []
  const checklistItems = Array.isArray(row.checklistItems) ? row.checklistItems : []

  return {
    abVariations: (row.abVariations as string | null) ?? null,
    actualDate: (row.actualDate as string | null) ?? null,
    archivedAt: (row.archivedAt as string | null) ?? null,
    buildNumber: (row.buildNumber as string | null) ?? null,
    checklistCompletedCount: asNumber(row.checklistCompletedCount as number | string | null),
    checklistItems: checklistItems.map((item, index) =>
      mapReleaseChecklistItem(item as Record<string, unknown>, `${id}:checklist:${index}`),
    ),
    checklistTotalCount: asNumber(row.checklistTotalCount as number | string | null),
    createdAt: row.createdAt as string,
    createdByUserId: row.createdByUserId as string,
    drift: (row.drift as number | null) ?? null,
    forceUpgrade: row.forceUpgrade as boolean,
    health: row.health as ReleaseHealth,
    id,
    linkedCardCount: asNumber(row.linkedCardCount as number | string | null),
    linkedSprintCount: asNumber(row.linkedSprintCount as number | string | null),
    name: row.name as string,
    noteSections: noteSections.map((section) => mapReleaseNoteSection(section as Record<string, unknown>)),
    planViewId: row.planViewId as string,
    plannedDate: (row.plannedDate as string | null) ?? null,
    position: row.position as number,
    releaseNotes: (row.releaseNotes as string | null) ?? null,
    retroNotes: (row.retroNotes as string | null) ?? null,
    retroUrl: (row.retroUrl as string | null) ?? null,
    status: row.status as ReleaseStatus,
    updatedAt: row.updatedAt as string,
  }
}

function finalizeScorecardItem(row: Record<string, unknown>): ScorecardItem {
  return {
    compositeScore: asNumber(row.compositeScore as number | string | null),
    createdAt: row.createdAt as string,
    description: (row.description as string | null) ?? null,
    id: row.id as string,
    linkedReleaseId: (row.linkedReleaseId as string | null) ?? null,
    linkedReleaseName: (row.linkedReleaseName as string | null) ?? null,
    linkedRoadmapItemId: (row.linkedRoadmapItemId as string | null) ?? null,
    linkedRoadmapItemLabel: (row.linkedRoadmapItemLabel as string | null) ?? null,
    planViewId: row.planViewId as string,
    position: asNumber(row.position as number | string | null),
    scores: (row.scores as Record<string, number> | null) ?? {},
    title: row.title as string,
    tracked: row.tracked as boolean,
    updatedAt: row.updatedAt as string,
  }
}

export const planRepository: PlanRepository = {
  async createPlan(input) {
    const result = await rpcAdapter.callSingle<PlanRecord>('create_workspace_plan', {
      target_description: input.description ?? null,
      target_name: input.name,
      target_view_types: input.viewTypes,
      target_workspace_id: input.workspaceId,
    })
    return result!
  },

  async createRelease(input) {
    const row = await rpcAdapter.callSingle<Record<string, unknown>>('create_release', {
      target_build_number: input.buildNumber ?? null,
      target_name: input.name,
      target_plan_view_id: input.planViewId,
      target_planned_date: input.plannedDate ?? null,
      target_status: input.status ?? 'draft',
    })
    return finalizeReleaseRecord(row!)
  },

  async createReleaseShareLink(planViewId) {
    const result = await rpcAdapter.callSingle<ReleaseShareSnapshot>('create_release_share_link', {
      target_plan_view_id: planViewId,
    })
    return result!
  },

  async createRoadmapItem(input) {
    const result = await rpcAdapter.callSingle<{id: string}>('create_roadmap_item', {
      target_color: input.color ?? null,
      target_end_period: input.endPeriod,
      target_initiative_id: input.initiativeId ?? null,
      target_item_type: input.itemType ?? 'bar',
      target_label: input.label,
      target_lane_id: input.laneId,
      target_start_period: input.startPeriod,
    })
    return result!
  },

  async createRoadmapLane(input) {
    const result = await rpcAdapter.callSingle<{id: string; position: number; title: string}>('create_roadmap_lane', {
      target_color: input.color ?? null,
      target_group: input.group ?? null,
      target_group_type: input.groupType ?? 'custom',
      target_plan_view_id: input.planViewId,
      target_title: input.title,
    })
    return result!
  },

  async createRoadmapMilestone(input) {
    const result = await rpcAdapter.callSingle<{id: string}>('create_roadmap_milestone', {
      target_color: input.color ?? null,
      target_date: input.date,
      target_label: input.label,
      target_lane_id: input.laneId ?? null,
      target_plan_view_id: input.planViewId,
      target_type: input.type ?? 'diamond',
    })
    return result!
  },

  async createScorecardItem(input) {
    const row = await rpcAdapter.callSingle<Record<string, unknown>>('create_scorecard_item', {
      target_plan_view_id: input.planViewId,
      target_title: input.title ?? 'Untitled item',
    })
    return finalizeScorecardItem(row!)
  },

  async deletePlan(planId) {
    await rpcAdapter.call('delete_workspace_plan', {target_plan_id: planId})
  },

  async renamePlan(planId, name) {
    await rpcAdapter.call('rename_plan', {target_plan_id: planId, target_name: name})
  },

  async deleteRelease(releaseId) {
    await rpcAdapter.call('delete_release', {target_release_id: releaseId})
  },

  async deleteRoadmapItem(itemId) {
    await rpcAdapter.call('delete_roadmap_item', {target_item_id: itemId})
  },

  async deleteRoadmapLane(laneId) {
    await rpcAdapter.call('delete_roadmap_lane', {target_lane_id: laneId})
  },

  async deleteRoadmapMilestone(milestoneId) {
    await rpcAdapter.call('delete_roadmap_milestone', {target_milestone_id: milestoneId})
  },

  async deleteScorecardItem(itemId) {
    await rpcAdapter.call('delete_scorecard_item', {target_item_id: itemId})
  },

  async getPublicReleaseShare(shareToken) {
    const data = await rpcAdapter.callSingle<Record<string, unknown>>('get_public_release_share', {
      target_share_token: shareToken,
    })

    const raw = data!
    const releases = Array.isArray(raw.releases) ? raw.releases : []

    return {
      planId: raw.planId as string,
      planName: raw.planName as string,
      planViewId: raw.planViewId as string,
      releases: releases.map((release) => finalizeReleaseRecord(release as Record<string, unknown>)),
      sharedAt: (raw.sharedAt as string | null) ?? null,
      viewName: raw.viewName as string,
      workspaceName: raw.workspaceName as string,
    }
  },

  async getReleaseLinkedCards(releaseId) {
    return rpcAdapter.callAndTransform<ReleaseLinkedCard[]>('get_release_linked_cards', {
      target_release_id: releaseId,
    })
  },

  async getReleaseLinkedSprints(releaseId) {
    return rpcAdapter.callAndTransform<ReleaseLinkedSprint[]>('get_release_linked_sprints', {
      target_release_id: releaseId,
    })
  },

  async getReleaseShareSnapshot(planViewId) {
    return rpcAdapter.callSingle<ReleaseShareSnapshot | null>('get_release_share_snapshot', {
      target_plan_view_id: planViewId,
    })
  },

  async getReleases(planViewId) {
    const rows = await rpcAdapter.callAndTransform<Record<string, unknown>[]>('get_releases_data', {
      target_plan_view_id: planViewId,
    })
    return rows.map(finalizeReleaseRecord)
  },

  async getRoadmapData(planViewId) {
    const result = await rpcAdapter.callSingle<RoadmapData>('get_roadmap_data', {target_plan_view_id: planViewId})
    return result!
  },

  async getScorecardItems(planViewId) {
    const rows = await rpcAdapter.callAndTransform<Record<string, unknown>[]>('get_scorecard_data', {
      target_plan_view_id: planViewId,
    })
    return rows.map(finalizeScorecardItem)
  },

  async getWorkspacePlans(workspaceId) {
    return rpcAdapter.callAndTransform<PlanRecord[]>('get_workspace_plans', {target_workspace_id: workspaceId})
  },

  async getWorkspaceReleasePickerCards(workspaceId, releaseId) {
    return rpcAdapter.callAndTransform<ReleasePickerCard[]>('get_workspace_release_picker_cards', {
      target_release_id: releaseId,
      target_workspace_id: workspaceId,
    })
  },

  async getWorkspaceReleasePickerSprints(workspaceId, releaseId) {
    return rpcAdapter.callAndTransform<ReleasePickerSprint[]>('get_workspace_release_picker_sprints', {
      target_release_id: releaseId,
      target_workspace_id: workspaceId,
    })
  },

  async linkCardsToRelease(releaseId, cardIds) {
    await rpcAdapter.call('link_cards_to_release', {
      target_card_ids: cardIds,
      target_release_id: releaseId,
    })
  },

  async linkSprintsToRelease(releaseId, sprintIds) {
    await rpcAdapter.call('link_sprints_to_release', {
      target_release_id: releaseId,
      target_sprint_ids: sprintIds,
    })
  },

  async reorderRelease(releaseId, newPosition) {
    await rpcAdapter.call('reorder_release', {
      target_new_position: newPosition,
      target_release_id: releaseId,
    })
  },

  async reorderScorecardItem(itemId, newPosition) {
    await rpcAdapter.call('reorder_scorecard_item', {
      target_item_id: itemId,
      target_new_position: newPosition,
    })
  },

  async revokeReleaseShareLink(planViewId) {
    await rpcAdapter.call('revoke_release_share_link', {
      target_plan_view_id: planViewId,
    })
  },

  async unlinkCardFromRelease(releaseId, cardId) {
    await rpcAdapter.call('unlink_card_from_release', {
      target_card_id: cardId,
      target_release_id: releaseId,
    })
  },

  async unlinkSprintFromRelease(releaseId, sprintId) {
    await rpcAdapter.call('unlink_sprint_from_release', {
      target_release_id: releaseId,
      target_sprint_id: sprintId,
    })
  },

  async updateRelease(input) {
    const row = await rpcAdapter.callSingle<Record<string, unknown>>('update_release', {
      target_ab_variations: input.abVariations ?? null,
      target_actual_date: input.actualDate ?? null,
      target_build_number: input.buildNumber ?? null,
      target_clear_ab_variations: hasOwn(input, 'abVariations') && input.abVariations === null,
      target_clear_actual_date: hasOwn(input, 'actualDate') && input.actualDate === null,
      target_clear_build_number: hasOwn(input, 'buildNumber') && input.buildNumber === null,
      target_clear_planned_date: hasOwn(input, 'plannedDate') && input.plannedDate === null,
      target_clear_release_notes: hasOwn(input, 'releaseNotes') && input.releaseNotes === null,
      target_clear_retro_notes: hasOwn(input, 'retroNotes') && input.retroNotes === null,
      target_clear_retro_url: hasOwn(input, 'retroUrl') && input.retroUrl === null,
      target_force_upgrade: input.forceUpgrade ?? null,
      target_name: input.name ?? null,
      target_planned_date: input.plannedDate ?? null,
      target_release_id: input.releaseId,
      target_release_notes: input.releaseNotes ?? null,
      target_retro_notes: input.retroNotes ?? null,
      target_retro_url: input.retroUrl ?? null,
    })
    return finalizeReleaseRecord(row!)
  },

  async updateReleaseChecklist(input) {
    const items = input.checklistItems.map((item) => ({
      checked: item.checked,
      checkedAt: item.checkedAt,
      checkedByUserId: item.checkedByUserId,
      id: item.id,
      label: item.label,
    }))

    const row = await rpcAdapter.callSingle<Record<string, unknown>>('update_release_checklist', {
      target_checklist_json: {items},
      target_release_id: input.releaseId,
    })
    return finalizeReleaseRecord(row!)
  },

  async updateReleaseHealth(releaseId, health) {
    const row = await rpcAdapter.callSingle<Record<string, unknown>>('update_release_health', {
      target_new_health: health,
      target_release_id: releaseId,
    })
    return finalizeReleaseRecord(row!)
  },

  async updateReleaseNotes(input) {
    const noteSections = input.noteSections.map((section: ReleaseNoteSection) => ({
      content: section.content,
      label: section.label,
    }))

    const row = await rpcAdapter.callSingle<Record<string, unknown>>('update_release_notes', {
      target_notes_json: {sections: noteSections},
      target_release_id: input.releaseId,
    })
    return finalizeReleaseRecord(row!)
  },

  async updateReleaseStatus(releaseId, status) {
    const row = await rpcAdapter.callSingle<Record<string, unknown>>('update_release_status', {
      target_new_status: status,
      target_release_id: releaseId,
    })
    return finalizeReleaseRecord(row!)
  },

  async updatePlanViewConfig(viewId, config) {
    await rpcAdapter.call('update_plan_view_config', {
      target_config_json: config,
      target_view_id: viewId,
    })
  },

  async updateRoadmapItem(input) {
    await rpcAdapter.call('update_roadmap_item', {
      target_color: input.color,
      target_end_period: input.endPeriod,
      target_initiative_id: input.initiativeId,
      target_item_id: input.itemId,
      target_label: input.label,
      target_lane_id: input.laneId,
      target_start_period: input.startPeriod,
    })
  },

  async updateRoadmapLane(input) {
    await rpcAdapter.call('update_roadmap_lane', {
      target_color: input.color,
      target_group: input.group,
      target_lane_id: input.laneId,
      target_title: input.title,
    })
  },

  async updateRoadmapMilestone(input) {
    await rpcAdapter.call('update_roadmap_milestone', {
      target_color: input.color,
      target_date: input.date,
      target_label: input.label,
      target_lane_id: input.laneId,
      target_milestone_id: input.milestoneId,
      target_type: input.type,
    })
  },

  async updateScorecardItem(input) {
    const row = await rpcAdapter.callSingle<Record<string, unknown>>('update_scorecard_item', {
      target_clear_description: hasOwn(input, 'description') && input.description === null,
      target_clear_linked_release_id: hasOwn(input, 'linkedReleaseId') && input.linkedReleaseId === null,
      target_clear_linked_roadmap_item_id: hasOwn(input, 'linkedRoadmapItemId') && input.linkedRoadmapItemId === null,
      target_composite_score: input.compositeScore ?? null,
      target_description: input.description ?? null,
      target_item_id: input.itemId,
      target_linked_release_id: input.linkedReleaseId ?? null,
      target_linked_roadmap_item_id: input.linkedRoadmapItemId ?? null,
      target_scores_json: input.scores ?? null,
      target_title: input.title ?? null,
      target_tracked: input.tracked ?? null,
    })
    return finalizeScorecardItem(row!)
  },

  async upsertMatrixCell(input) {
    await rpcAdapter.call('upsert_roadmap_matrix_cell', {
      target_content_text: input.contentText,
      target_lane_id: input.laneId,
      target_period_key: input.periodKey,
      target_plan_view_id: input.planViewId,
    })
  },
}
