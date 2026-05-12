import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectMember} from '../access/access.types'

export type AutomationStatus = 'active' | 'paused'

export type AutomationTriggerType =
  | 'card_created'
  | 'status_changed'
  | 'assignee_changed'
  | 'priority_changed'
  | 'card_completed'

export type AutomationTriggerConfig = {
  creationSource?: string | null
  fromPriorityOptionId?: string | null
  fromStatusOptionId?: string | null
  fromUserId?: string | null
  toPriorityOptionId?: string | null
  toStatusOptionId?: string | null
  toUserId?: string | null
}

export type AutomationConditionField = 'status' | 'priority' | 'assignee' | 'group' | 'tags' | 'custom_field'

export type AutomationConditionOperator = 'is' | 'is_not' | 'is_empty' | 'is_not_empty'

export type AutomationConditionClause = {
  field: AutomationConditionField
  fieldDefinitionId?: string | null
  operator: AutomationConditionOperator
  value?: string | null
}

export type AutomationActionType = 'set_assignee' | 'set_status' | 'set_priority' | 'move_to_group' | 'add_comment'
export const automationActionPlaceholder = '__select_action__' as const
export type AutomationDraftActionType = AutomationActionType | typeof automationActionPlaceholder

export type AutomationActionConfig = {
  bodyTemplate?: string | null
  groupId?: string | null
  priorityOptionId?: string | null
  statusOptionId?: string | null
  userId?: string | null
}

export type AutomationAction = {
  actionConfig: AutomationActionConfig
  actionType: AutomationActionType
}

export type AutomationDraftAction = {
  actionConfig: AutomationActionConfig
  actionType: AutomationDraftActionType
}

type AutomationRuleBase = {
  conditionClauses: AutomationConditionClause[]
  status: AutomationStatus
  triggerConfig: AutomationTriggerConfig
  triggerType: AutomationTriggerType
}

export type AutomationRuleDraft = AutomationRuleBase & {
  actions: AutomationDraftAction[]
}

export type PersistedAutomationRuleDraft = AutomationRuleBase & {
  actions: AutomationAction[]
}

export type AutomationRule = PersistedAutomationRuleDraft & {
  brokenReason: string | null
  createdAt: string
  createdByUserId: string | null
  id: string
  isBroken: boolean
  position: number
  projectId: string
  updatedAt: string
  updatedByUserId: string | null
}

export type AutomationRunOutcome = 'applied' | 'skipped' | 'failed'

export type AutomationRun = {
  actionsExecuted: Array<Record<string, unknown>>
  automationId: string | null
  cardId: string | null
  cardTitle: string | null
  createdAt: string
  id: string
  metadata: Record<string, unknown>
  outcome: AutomationRunOutcome
  projectId: string
  reasonCode: string
  triggerType: AutomationTriggerType
}

export type AutomationReferenceData = {
  customFields: CustomFieldDefinition[]
  groups: ProjectGroupRecord[]
  members: ProjectMember[]
  priorityOptions: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
}

export const automationTriggerLabels: Record<AutomationTriggerType, string> = {
  assignee_changed: 'Assignee changes',
  card_completed: 'Card is completed',
  card_created: 'Card is created',
  priority_changed: 'Priority changes',
  status_changed: 'Status changes',
}

export const automationConditionFieldLabels: Record<AutomationConditionField, string> = {
  assignee: 'Assignee',
  custom_field: 'Custom field',
  group: 'Group',
  priority: 'Priority',
  status: 'Status',
  tags: 'Tag',
}

export const automationConditionOperatorLabels: Record<AutomationConditionOperator, string> = {
  is: 'is',
  is_empty: 'is empty',
  is_not: 'is not',
  is_not_empty: 'is not empty',
}

export const automationActionLabels: Record<AutomationActionType, string> = {
  add_comment: 'Add comment',
  move_to_group: 'Move to group',
  set_assignee: 'Set assignee',
  set_priority: 'Set priority',
  set_status: 'Set status',
}

function findCustomFieldOptionLabel(
  fieldDefinitionId: string | null | undefined,
  optionId: string | null | undefined,
  refs: AutomationReferenceData,
) {
  if (!fieldDefinitionId || !optionId) {
    return 'Unknown option'
  }

  const field = refs.customFields.find((candidate) => candidate.id === fieldDefinitionId)
  return field?.options.find((candidate) => candidate.id === optionId)?.label ?? 'Unknown option'
}

function findCustomFieldLabel(fieldDefinitionId: string | null | undefined, refs: AutomationReferenceData) {
  if (!fieldDefinitionId) {
    return 'custom field'
  }

  return refs.customFields.find((candidate) => candidate.id === fieldDefinitionId)?.name ?? 'custom field'
}

function findGroupLabel(groupId: string | null | undefined, refs: AutomationReferenceData) {
  if (!groupId) {
    return 'No group'
  }

  return refs.groups.find((candidate) => candidate.id === groupId)?.label ?? 'Unknown group'
}

function findMemberLabel(userId: string | null | undefined, refs: AutomationReferenceData) {
  if (!userId) {
    return 'Unassigned'
  }

  if (userId === '__creator__') {
    return 'card creator'
  }

  return refs.members.find((candidate) => candidate.id === userId)?.name ?? 'Unknown member'
}

function findPriorityLabel(priorityOptionId: string | null | undefined, refs: AutomationReferenceData) {
  if (!priorityOptionId) {
    return 'No priority'
  }

  return refs.priorityOptions.find((candidate) => candidate.id === priorityOptionId)?.label ?? 'Unknown priority'
}

function findStatusLabel(statusOptionId: string | null | undefined, refs: AutomationReferenceData) {
  if (!statusOptionId) {
    return 'No status'
  }

  return refs.statusOptions.find((candidate) => candidate.id === statusOptionId)?.label ?? 'Unknown status'
}

function joinClauses(parts: string[]) {
  const normalizedParts = parts.filter(Boolean)

  if (normalizedParts.length === 0) {
    return ''
  }

  return normalizedParts.join(', ')
}

export function createEmptyAutomationCondition(): AutomationConditionClause {
  return {
    field: 'status',
    operator: 'is',
    value: null,
  }
}

export function createEmptyAutomationAction(): AutomationDraftAction {
  return {
    actionConfig: {},
    actionType: automationActionPlaceholder,
  }
}

export function createEmptyAutomationDraft(): AutomationRuleDraft {
  return {
    actions: [createEmptyAutomationAction()],
    conditionClauses: [],
    status: 'active',
    triggerConfig: {},
    triggerType: 'card_created',
  }
}

export function toAutomationDraft(rule: AutomationRule): AutomationRuleDraft {
  return {
    actions: rule.actions.map((action) => ({
      actionConfig: {...action.actionConfig},
      actionType: action.actionType,
    })),
    conditionClauses: rule.conditionClauses.map((condition) => ({...condition})),
    status: rule.status,
    triggerConfig: {...rule.triggerConfig},
    triggerType: rule.triggerType,
  }
}

export function isConfiguredAutomationAction(action: AutomationDraftAction): action is AutomationAction {
  return action.actionType !== automationActionPlaceholder
}

export function toPersistedAutomationDraft(rule: AutomationRuleDraft): PersistedAutomationRuleDraft {
  return {
    actions: rule.actions
      .filter((action): action is AutomationAction => isConfiguredAutomationAction(action))
      .map((action) => ({
        actionConfig: {...action.actionConfig},
        actionType: action.actionType,
      })),
    conditionClauses: rule.conditionClauses.map((condition) => ({...condition})),
    status: rule.status,
    triggerConfig: {...rule.triggerConfig},
    triggerType: rule.triggerType,
  }
}

export function describeAutomationTrigger(
  triggerType: AutomationTriggerType,
  triggerConfig: AutomationTriggerConfig,
  refs: AutomationReferenceData,
) {
  switch (triggerType) {
    case 'card_created':
      return 'When a card is created'
    case 'card_completed':
      return 'When a card is completed'
    case 'status_changed':
      return joinClauses([
        'When status changes',
        triggerConfig.fromStatusOptionId ? `from ${findStatusLabel(triggerConfig.fromStatusOptionId, refs)}` : '',
        triggerConfig.toStatusOptionId ? `to ${findStatusLabel(triggerConfig.toStatusOptionId, refs)}` : '',
      ])
    case 'assignee_changed':
      return joinClauses([
        'When assignee changes',
        triggerConfig.fromUserId ? `from ${findMemberLabel(triggerConfig.fromUserId, refs)}` : '',
        triggerConfig.toUserId ? `to ${findMemberLabel(triggerConfig.toUserId, refs)}` : '',
      ])
    case 'priority_changed':
      return joinClauses([
        'When priority changes',
        triggerConfig.fromPriorityOptionId ? `from ${findPriorityLabel(triggerConfig.fromPriorityOptionId, refs)}` : '',
        triggerConfig.toPriorityOptionId ? `to ${findPriorityLabel(triggerConfig.toPriorityOptionId, refs)}` : '',
      ])
    default:
      return 'When something changes'
  }
}

export function describeAutomationCondition(condition: AutomationConditionClause, refs: AutomationReferenceData) {
  const operator = automationConditionOperatorLabels[condition.operator]

  if (condition.field === 'custom_field') {
    const fieldLabel = findCustomFieldLabel(condition.fieldDefinitionId, refs)

    if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
      return `${fieldLabel} ${operator}`
    }

    return `${fieldLabel} ${operator} ${findCustomFieldOptionLabel(condition.fieldDefinitionId, condition.value, refs)}`
  }

  if (condition.field === 'tags') {
    if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
      return `Tags ${operator}`
    }

    return `Tag ${operator} ${condition.value ?? 'Unknown tag'}`
  }

  const fieldLabel = automationConditionFieldLabels[condition.field]

  if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
    return `${fieldLabel} ${operator}`
  }

  switch (condition.field) {
    case 'status':
      return `${fieldLabel} ${operator} ${findStatusLabel(condition.value, refs)}`
    case 'priority':
      return `${fieldLabel} ${operator} ${findPriorityLabel(condition.value, refs)}`
    case 'assignee':
      return `${fieldLabel} ${operator} ${findMemberLabel(condition.value, refs)}`
    case 'group':
      return `${fieldLabel} ${operator} ${findGroupLabel(condition.value, refs)}`
    default:
      return `${fieldLabel} ${operator}`
  }
}

export function describeAutomationAction(action: AutomationDraftAction | AutomationAction, refs: AutomationReferenceData) {
  switch (action.actionType) {
    case 'set_assignee':
      return `assign to ${findMemberLabel(action.actionConfig.userId, refs)}`
    case 'set_status':
      return `set status to ${findStatusLabel(action.actionConfig.statusOptionId, refs)}`
    case 'set_priority':
      return `set priority to ${findPriorityLabel(action.actionConfig.priorityOptionId, refs)}`
    case 'move_to_group':
      return `move to ${findGroupLabel(action.actionConfig.groupId, refs)}`
    case 'add_comment':
      return `add comment`
    default:
      return ''
  }
}

export function summarizeAutomationRule(rule: AutomationRuleDraft | AutomationRule, refs: AutomationReferenceData) {
  const trigger = describeAutomationTrigger(rule.triggerType, rule.triggerConfig, refs)
  const conditionSummary = rule.conditionClauses.length > 0
    ? ` if ${rule.conditionClauses.map((condition) => describeAutomationCondition(condition, refs)).join(' and ')}`
    : ''
  const actionLabels = rule.actions
    .map((action) => describeAutomationAction(action, refs))
    .filter((label) => label.length > 0)
  const actionSummary = actionLabels.length > 0
    ? `, then ${actionLabels.join(' and ')}`
    : ''

  return `${trigger}${conditionSummary}${actionSummary}`
}

export function formatAutomationRunReason(reasonCode: string) {
  switch (reasonCode) {
    case 'action_failed':
      return 'Action failed'
    case 'actions_applied':
      return 'Actions applied'
    case 'conditions_not_met':
      return 'Conditions not met'
    case 'invalid_rule_config':
      return 'Rule is broken'
    default:
      return reasonCode.replaceAll('_', ' ')
  }
}
