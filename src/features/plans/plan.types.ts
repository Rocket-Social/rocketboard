import type {RichTextDocument} from '../rich-text/rich-text'
import type {SprintStatus} from '../sprints/sprint.types'

export type PlanViewType = 'releases' | 'roadmap' | 'scorecard'

export type PlanRecord = {
  createdAt: string
  description: string | null
  id: string
  name: string
  position: number
  views: PlanViewRecord[]
  workspaceId: string
}

export type PlanViewRecord = {
  configJson: Record<string, unknown> | null
  id: string
  name: string
  position: number
  viewType: PlanViewType
}

export type ReleaseStatus = 'draft' | 'planned' | 'in_progress' | 'released' | 'archived'
export type ReleaseHealth = 'on_track' | 'at_risk' | 'blocked'

export type ReleaseNoteSection = {
  content: RichTextDocument
  label: string
}

export type ReleaseChecklistItem = {
  checked: boolean
  checkedAt: string | null
  checkedByName: string | null
  checkedByUserId: string | null
  id: string
  label: string
}

export type ReleaseRecord = {
  abVariations: string | null
  actualDate: string | null
  archivedAt: string | null
  buildNumber: string | null
  checklistItems: ReleaseChecklistItem[]
  checklistCompletedCount: number
  checklistTotalCount: number
  createdAt: string
  createdByUserId: string
  drift: number | null
  forceUpgrade: boolean
  health: ReleaseHealth
  id: string
  linkedCardCount: number
  linkedSprintCount: number
  name: string
  noteSections: ReleaseNoteSection[]
  plannedDate: string | null
  planViewId: string
  position: number
  releaseNotes: string | null
  retroNotes: string | null
  retroUrl: string | null
  status: ReleaseStatus
  updatedAt: string
}

export type ReleaseLinkedCard = {
  assigneeName: string
  cardId: string
  projectId: string
  projectName: string
  statusCategory: string
  statusLabel: string
  title: string
}

export type ReleasePickerCard = ReleaseLinkedCard & {
  linked: boolean
}

export type ReleaseLinkedSprint = {
  endDate: string | null
  name: string
  projectId: string
  projectName: string
  sprintId: string
  startDate: string | null
  status: SprintStatus
}

export type ReleasePickerSprint = ReleaseLinkedSprint & {
  linked: boolean
}

export type ReleaseShareSnapshot = {
  createdAt: string | null
  revokedAt: string | null
  shareToken: string | null
}

export type PublicReleaseBoardSnapshot = {
  planId: string
  planName: string
  planViewId: string
  releases: ReleaseRecord[]
  sharedAt: string | null
  viewName: string
  workspaceName: string
}

export type RoadmapLane = {
  color: string | null
  createdAt: string
  group: string | null
  groupType: string
  id: string
  position: number
  title: string
}

export type RoadmapItemType = 'bar' | 'phase'

export type RoadmapItem = {
  color: string | null
  description: string | null
  endPeriod: string
  id: string
  initiativeId: string | null
  itemType: RoadmapItemType
  label: string
  laneId: string
  position: number
  startPeriod: string
}

export type RoadmapMilestoneType = 'circle' | 'diamond' | 'flag'

export type RoadmapMilestone = {
  color: string | null
  id: string
  label: string
  laneId: string | null
  milestoneDate: string
  milestoneType: RoadmapMilestoneType
  position: number
}

export type RoadmapMatrixCell = {
  contentText: string
  id: string
  laneId: string
  periodKey: string
}

export type RoadmapData = {
  cells: RoadmapMatrixCell[]
  items: RoadmapItem[]
  lanes: RoadmapLane[]
  milestones: RoadmapMilestone[]
}

export type RoadmapViewConfig = {
  bucketCutoffDays: [number, number]
  bucketLabels: [string, string, string]
  collapsedGroups: string[]
  layoutMode: 'matrix' | 'timeline'
  showMilestones: boolean
  showProgress: boolean
  showTodayMarker: boolean
  timeMode: 'bucket' | 'calendar'
  timeScale: 'month' | 'quarter' | 'week'
  visibleEndDate: string | null
  visibleStartDate: string | null
}

export const defaultRoadmapViewConfig: RoadmapViewConfig = {
  bucketCutoffDays: [30, 90],
  bucketLabels: ['Now', 'Next', 'Later'],
  collapsedGroups: [],
  layoutMode: 'timeline',
  showMilestones: true,
  showProgress: false,
  showTodayMarker: true,
  timeMode: 'calendar',
  timeScale: 'month',
  visibleEndDate: null,
  visibleStartDate: null,
}

export type CreatePlanInput = {
  description?: string | null
  name: string
  viewTypes: PlanViewType[]
  workspaceId: string
}

export type CreateReleaseInput = {
  buildNumber?: string | null
  name: string
  plannedDate?: string | null
  planViewId: string
  status?: ReleaseStatus
}

export type UpdateReleaseInput = {
  abVariations?: string | null
  actualDate?: string | null
  buildNumber?: string | null
  forceUpgrade?: boolean
  name?: string
  plannedDate?: string | null
  releaseId: string
  releaseNotes?: string | null
  retroNotes?: string | null
  retroUrl?: string | null
}

export type UpdateReleaseNotesInput = {
  noteSections: ReleaseNoteSection[]
  releaseId: string
}

export type UpdateReleaseChecklistInput = {
  checklistItems: ReleaseChecklistItem[]
  releaseId: string
}

export type ScorecardFramework = 'custom' | 'ice' | 'rice' | 'wsjf'

export type ScorecardDimension = {
  key: string
  label: string
  scale: [number, number]
}

export type ScorecardFormulaType = 'divide_last' | 'multiply' | 'weighted_sum'

export type ScorecardViewConfig = {
  dimensions: ScorecardDimension[]
  formulaType: ScorecardFormulaType
  framework: ScorecardFramework
  sortMode: 'auto' | 'manual'
}

export const defaultScorecardViewConfig: ScorecardViewConfig = {
  dimensions: [
    {key: 'impact', label: 'Impact', scale: [1, 10]},
    {key: 'confidence', label: 'Confidence', scale: [1, 10]},
    {key: 'ease', label: 'Ease', scale: [1, 10]},
  ],
  formulaType: 'multiply',
  framework: 'ice',
  sortMode: 'auto',
}

export const scorecardFrameworkPresets: Record<ScorecardFramework, Omit<ScorecardViewConfig, 'sortMode'>> = {
  custom: {
    dimensions: [
      {key: 'impact', label: 'Impact', scale: [1, 10]},
      {key: 'confidence', label: 'Confidence', scale: [1, 10]},
      {key: 'ease', label: 'Ease', scale: [1, 10]},
    ],
    formulaType: 'multiply',
    framework: 'custom',
  },
  ice: {
    dimensions: [
      {key: 'impact', label: 'Impact', scale: [1, 10]},
      {key: 'confidence', label: 'Confidence', scale: [1, 10]},
      {key: 'ease', label: 'Ease', scale: [1, 10]},
    ],
    formulaType: 'multiply',
    framework: 'ice',
  },
  rice: {
    dimensions: [
      {key: 'reach', label: 'Reach', scale: [1, 10]},
      {key: 'impact', label: 'Impact', scale: [1, 10]},
      {key: 'confidence', label: 'Confidence', scale: [1, 10]},
      {key: 'effort', label: 'Effort', scale: [1, 10]},
    ],
    formulaType: 'divide_last',
    framework: 'rice',
  },
  wsjf: {
    dimensions: [
      {key: 'business_value', label: 'Business Value', scale: [1, 10]},
      {key: 'time_criticality', label: 'Time Criticality', scale: [1, 10]},
      {key: 'risk_reduction', label: 'Risk Reduction', scale: [1, 10]},
      {key: 'job_size', label: 'Job Size', scale: [1, 10]},
    ],
    formulaType: 'divide_last',
    framework: 'wsjf',
  },
}

export type ScorecardItem = {
  compositeScore: number
  createdAt: string
  description: string | null
  id: string
  linkedReleaseId: string | null
  linkedReleaseName: string | null
  linkedRoadmapItemId: string | null
  linkedRoadmapItemLabel: string | null
  planViewId: string
  position: number
  scores: Record<string, number>
  title: string
  tracked: boolean
  updatedAt: string
}

export type CreateScorecardItemInput = {
  planViewId: string
  title?: string
}

export type UpdateScorecardItemInput = {
  compositeScore?: number
  description?: string | null
  itemId: string
  linkedReleaseId?: string | null
  linkedRoadmapItemId?: string | null
  scores?: Record<string, number>
  title?: string
  tracked?: boolean
}

export type CreateRoadmapLaneInput = {
  color?: string | null
  group?: string | null
  groupType?: string
  planViewId: string
  title: string
}

export type CreateRoadmapItemInput = {
  color?: string | null
  endPeriod: string
  initiativeId?: string | null
  itemType?: RoadmapItemType
  laneId: string
  label: string
  startPeriod: string
}

export type UpdateRoadmapItemInput = {
  color?: string | null
  endPeriod?: string | null
  initiativeId?: string | null
  itemId: string
  label?: string | null
  laneId?: string | null
  startPeriod?: string | null
}
