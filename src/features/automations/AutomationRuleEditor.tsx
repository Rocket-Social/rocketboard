import {AlertCircle, PlusCircle, Sparkles, X} from 'lucide-react'
import {useMemo} from 'react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import {Input} from '../../components/ui/input'
import {Textarea} from '../../components/ui/textarea'
import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectMember} from '../access/access.types'
import type {
  AutomationDraftAction,
  AutomationDraftActionType,
  AutomationConditionClause,
  AutomationConditionField,
  AutomationRule,
  AutomationRuleDraft,
  AutomationTriggerType,
} from './automation.types'
import {
  automationActionLabels,
  automationActionPlaceholder,
  automationConditionFieldLabels,
  automationConditionOperatorLabels,
  automationTriggerLabels,
  createEmptyAutomationAction,
  createEmptyAutomationCondition,
  summarizeAutomationRule,
} from './automation.types'

type AutomationRuleEditorProps = {
  customFields: CustomFieldDefinition[]
  draft: AutomationRuleDraft
  errorMessage: string | null
  groups: ProjectGroupRecord[]
  isSubmitting: boolean
  members: ProjectMember[]
  onCancel: () => void
  onChange: (nextDraft: AutomationRuleDraft) => void
  onSubmit: () => void
  priorityOptions: ProjectPriorityOption[]
  selectedRule: AutomationRule | null
  statusOptions: ProjectStatusOption[]
}

function normalizeActionForType(actionType: AutomationDraftActionType): AutomationDraftAction {
  switch (actionType) {
    case 'set_assignee':
      return {actionConfig: {userId: null}, actionType}
    case 'set_status':
      return {actionConfig: {statusOptionId: null}, actionType}
    case 'set_priority':
      return {actionConfig: {priorityOptionId: null}, actionType}
    case 'move_to_group':
      return {actionConfig: {groupId: null}, actionType}
    case 'add_comment':
      return {actionConfig: {bodyTemplate: ''}, actionType}
    default:
      return createEmptyAutomationAction()
  }
}

function normalizeConditionField(field: AutomationConditionField): AutomationConditionClause {
  if (field === 'custom_field') {
    return {
      field,
      fieldDefinitionId: null,
      operator: 'is',
      value: null,
    }
  }

  if (field === 'tags') {
    return {
      field,
      operator: 'is',
      value: '',
    }
  }

  return {
    field,
    operator: 'is',
    value: null,
  }
}

function normalizeTriggerConfig(triggerType: AutomationTriggerType, currentConfig: AutomationRuleDraft['triggerConfig']) {
  switch (triggerType) {
    case 'status_changed':
      return {
        fromStatusOptionId: currentConfig.fromStatusOptionId ?? null,
        toStatusOptionId: currentConfig.toStatusOptionId ?? null,
      }
    case 'assignee_changed':
      return {
        fromUserId: currentConfig.fromUserId ?? null,
        toUserId: currentConfig.toUserId ?? null,
      }
    case 'priority_changed':
      return {
        fromPriorityOptionId: currentConfig.fromPriorityOptionId ?? null,
        toPriorityOptionId: currentConfig.toPriorityOptionId ?? null,
      }
    default:
      return {}
  }
}

export function AutomationRuleEditor({
  customFields,
  draft,
  errorMessage,
  groups,
  isSubmitting,
  members,
  onCancel,
  onChange,
  onSubmit,
  priorityOptions,
  selectedRule,
  statusOptions,
}: AutomationRuleEditorProps) {
  const singleSelectFields = useMemo(
    () => customFields.filter((field) => field.fieldType === 'single_select'),
    [customFields],
  )

  const validationMessage = useMemo(() => {
    for (const condition of draft.conditionClauses) {
      if (condition.field === 'custom_field' && !condition.fieldDefinitionId) {
        return 'Select a custom field for each custom-field condition.'
      }

      if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
        continue
      }

      if (!condition.value || !condition.value.trim()) {
        return 'Finish each condition or remove it before saving.'
      }
    }

    if (draft.actions.length === 0) {
      return 'Add at least one action.'
    }

    for (const action of draft.actions) {
      if (action.actionType === automationActionPlaceholder) {
        return 'Select an action before saving.'
      }

      if (action.actionType === 'set_assignee' && !action.actionConfig.userId) {
        return 'Each assignee action needs a target user.'
      }

      if (action.actionType === 'set_status' && !action.actionConfig.statusOptionId) {
        return 'Each status action needs a target status.'
      }

      if (action.actionType === 'set_priority' && !action.actionConfig.priorityOptionId) {
        return 'Each priority action needs a target priority.'
      }

      if (action.actionType === 'move_to_group' && !action.actionConfig.groupId) {
        return 'Each move action needs a target group.'
      }

      if (action.actionType === 'add_comment' && !action.actionConfig.bodyTemplate?.trim()) {
        return 'Comment actions need a message template.'
      }
    }

    return null
  }, [draft.actions, draft.conditionClauses])

  const refs = {
    customFields,
    groups,
    members,
    priorityOptions,
    statusOptions,
  }

  const selectedCustomFieldOptions = (condition: AutomationConditionClause) =>
    singleSelectFields.find((field) => field.id === condition.fieldDefinitionId)?.options ?? []

  return (
    <section className='flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated shadow-panel'>
      <div className='flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4'>
        <div>
          <h3 className='font-display text-lg font-semibold text-text-strong'>
            {selectedRule ? 'Edit automation' : 'Create automation'}
          </h3>
          <p className='mt-2 text-sm text-text-medium'>
            {summarizeAutomationRule(draft, refs)}
          </p>
        </div>

        <Badge variant={draft.status === 'active' ? 'primary' : 'subtle'}>
          {draft.status === 'active' ? 'Active on save' : 'Paused on save'}
        </Badge>
      </div>

      <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5'>
        {selectedRule?.isBroken && selectedRule.brokenReason ? (
          <div className='flex items-start gap-2 rounded-2xl border border-error/20 bg-error/10 px-3 py-3 text-sm text-error'>
            <AlertCircle className='mt-0.5 h-4 w-4 shrink-0'/>
            <span>{selectedRule.brokenReason}</span>
          </div>
        ) : null}

        <section className='rounded-3xl border border-border-subtle bg-surface-base px-4 py-4'>
          <div className='flex items-center gap-2'>
            <Sparkles className='h-4 w-4 text-text-muted'/>
            <h4 className='font-display text-base font-semibold text-text-strong'>Trigger</h4>
          </div>

          <div className='mt-4 grid gap-4 md:grid-cols-2'>
            <label className='space-y-2'>
              <span className='text-sm font-medium text-text-strong'>When this happens</span>
              <select
                className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(event) =>
                  onChange({
                    ...draft,
                    triggerConfig: normalizeTriggerConfig(event.target.value as AutomationTriggerType, draft.triggerConfig),
                    triggerType: event.target.value as AutomationTriggerType,
                  })}
                value={draft.triggerType}
              >
                {Object.entries(automationTriggerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className='space-y-2'>
              <span className='text-sm font-medium text-text-strong'>Rule status</span>
              <select
                className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(event) => onChange({...draft, status: event.target.value as AutomationRuleDraft['status']})}
                value={draft.status}
              >
                <option value='active'>Active</option>
                <option value='paused'>Paused</option>
              </select>
            </label>
          </div>

          {draft.triggerType === 'status_changed' ? (
            <div className='mt-4 grid gap-4 md:grid-cols-2'>
              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>From status</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      triggerConfig: {
                        ...draft.triggerConfig,
                        fromStatusOptionId: event.target.value || null,
                      },
                    })}
                  value={draft.triggerConfig.fromStatusOptionId ?? ''}
                >
                  <option value=''>Any status</option>
                  {statusOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>To status</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      triggerConfig: {
                        ...draft.triggerConfig,
                        toStatusOptionId: event.target.value || null,
                      },
                    })}
                  value={draft.triggerConfig.toStatusOptionId ?? ''}
                >
                  <option value=''>Any status</option>
                  {statusOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {draft.triggerType === 'assignee_changed' ? (
            <div className='mt-4 grid gap-4 md:grid-cols-2'>
              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>From assignee</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      triggerConfig: {
                        ...draft.triggerConfig,
                        fromUserId: event.target.value || null,
                      },
                    })}
                  value={draft.triggerConfig.fromUserId ?? ''}
                >
                  <option value=''>Anyone</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>To assignee</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      triggerConfig: {
                        ...draft.triggerConfig,
                        toUserId: event.target.value || null,
                      },
                    })}
                  value={draft.triggerConfig.toUserId ?? ''}
                >
                  <option value=''>Anyone</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {draft.triggerType === 'priority_changed' ? (
            <div className='mt-4 grid gap-4 md:grid-cols-2'>
              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>From priority</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      triggerConfig: {
                        ...draft.triggerConfig,
                        fromPriorityOptionId: event.target.value || null,
                      },
                    })}
                  value={draft.triggerConfig.fromPriorityOptionId ?? ''}
                >
                  <option value=''>Any priority</option>
                  {priorityOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>To priority</span>
                <select
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      triggerConfig: {
                        ...draft.triggerConfig,
                        toPriorityOptionId: event.target.value || null,
                      },
                    })}
                  value={draft.triggerConfig.toPriorityOptionId ?? ''}
                >
                  <option value=''>Any priority</option>
                  {priorityOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </section>

        <section className='rounded-3xl border border-border-subtle bg-surface-base px-4 py-4'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h4 className='font-display text-base font-semibold text-text-strong'>Conditions</h4>
              <p className='mt-1 text-sm text-text-medium'>All conditions must match for the rule to run.</p>
            </div>
            <Button
              onClick={() =>
                onChange({
                  ...draft,
                  conditionClauses: [...draft.conditionClauses, createEmptyAutomationCondition()],
                })}
              size='compact'
              variant='ghost'
            >
              <PlusCircle className='h-4 w-4'/>
              Add condition
            </Button>
          </div>

          <div className='mt-4 space-y-3'>
            {draft.conditionClauses.length > 0 ? draft.conditionClauses.map((condition, index) => (
              <div className='rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-3' key={`${condition.field}-${index}`}>
                <div className='grid gap-3 md:grid-cols-[1.15fr_0.95fr_1.2fr_auto]'>
                  <label className='space-y-2'>
                    <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Field</span>
                    <select
                      className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                      onChange={(event) => {
                        const nextField = event.target.value as AutomationConditionField
                        onChange({
                          ...draft,
                          conditionClauses: draft.conditionClauses.map((entry, entryIndex) =>
                            entryIndex === index ? normalizeConditionField(nextField) : entry,
                          ),
                        })
                      }}
                      value={condition.field}
                    >
                      {Object.entries(automationConditionFieldLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className='space-y-2'>
                    <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Operator</span>
                    <select
                      className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          conditionClauses: draft.conditionClauses.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  operator: event.target.value as AutomationConditionClause['operator'],
                                  value:
                                    event.target.value === 'is_empty' || event.target.value === 'is_not_empty'
                                      ? null
                                      : entry.value ?? '',
                                }
                              : entry,
                          ),
                        })}
                      value={condition.operator}
                    >
                      {Object.entries(automationConditionOperatorLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className='space-y-2'>
                    <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Value</span>
                    {condition.field === 'custom_field' ? (
                      <div className='grid gap-2'>
                        <select
                          className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                          onChange={(event) =>
                            onChange({
                              ...draft,
                              conditionClauses: draft.conditionClauses.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      fieldDefinitionId: event.target.value || null,
                                      value: null,
                                    }
                                  : entry,
                              ),
                            })}
                          value={condition.fieldDefinitionId ?? ''}
                        >
                          <option value=''>Select field</option>
                          {singleSelectFields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.name}
                            </option>
                          ))}
                        </select>

                        {condition.operator === 'is_empty' || condition.operator === 'is_not_empty' ? null : (
                          <select
                            className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                            onChange={(event) =>
                              onChange({
                                ...draft,
                                conditionClauses: draft.conditionClauses.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        value: event.target.value || null,
                                      }
                                    : entry,
                                ),
                              })}
                            value={condition.value ?? ''}
                          >
                            <option value=''>Select option</option>
                            {selectedCustomFieldOptions(condition).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : condition.operator === 'is_empty' || condition.operator === 'is_not_empty' ? (
                      <div className='flex h-10 items-center rounded-xl border border-dashed border-border-subtle px-3 text-sm text-text-muted'>
                        No value needed
                      </div>
                    ) : condition.field === 'tags' ? (
                      <Input
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            conditionClauses: draft.conditionClauses.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    value: event.target.value,
                                  }
                                : entry,
                            ),
                          })}
                        placeholder='launch'
                        value={condition.value ?? ''}
                      />
                    ) : (
                      <select
                        className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            conditionClauses: draft.conditionClauses.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    value: event.target.value || null,
                                  }
                                : entry,
                            ),
                          })}
                        value={condition.value ?? ''}
                      >
                        <option value=''>Select value</option>
                        {condition.field === 'status' ? statusOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        )) : null}
                        {condition.field === 'priority' ? priorityOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        )) : null}
                        {condition.field === 'assignee' ? members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        )) : null}
                        {condition.field === 'group' ? groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.label}
                          </option>
                        )) : null}
                      </select>
                    )}
                  </div>

                  <div className='flex items-end justify-end'>
                    <Button
                      onClick={() =>
                        onChange({
                          ...draft,
                          conditionClauses: draft.conditionClauses.filter((_, entryIndex) => entryIndex !== index),
                        })}
                      size='compact'
                      variant='ghost'
                    >
                      <X className='h-4 w-4'/>
                    </Button>
                  </div>
                </div>
              </div>
            )) : (
              <div className='rounded-2xl border border-dashed border-border-subtle px-3 py-4 text-sm text-text-muted'>
                No conditions yet. Leave this empty if the trigger alone should fire the rule.
              </div>
            )}
          </div>
        </section>

        <section className='rounded-3xl border border-border-subtle bg-surface-base px-4 py-4'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h4 className='font-display text-base font-semibold text-text-strong'>Actions</h4>
              <p className='mt-1 text-sm text-text-medium'>Actions run in order against the original event snapshot.</p>
            </div>
            <Button
              onClick={() =>
                onChange({
                  ...draft,
                  actions: [...draft.actions, createEmptyAutomationAction()],
                })}
              size='compact'
              variant='ghost'
            >
              <PlusCircle className='h-4 w-4'/>
              Add action
            </Button>
          </div>

          <div className='mt-4 space-y-3'>
            {draft.actions.map((action, index) => (
              <div className='rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-3' key={`${action.actionType}-${index}`}>
                <div className='grid gap-3 md:grid-cols-[1fr_1.4fr_auto]'>
                  <label className='space-y-2'>
                    <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Action</span>
                    <select
                      className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          actions: draft.actions.map((entry, entryIndex) =>
                            entryIndex === index
                              ? normalizeActionForType(event.target.value as AutomationDraftActionType)
                              : entry,
                          ),
                        })}
                      value={action.actionType}
                    >
                      <option value={automationActionPlaceholder}>Select an action</option>
                      {Object.entries(automationActionLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className='space-y-2'>
                    <span className='text-xs font-medium uppercase tracking-wide text-text-muted'>Details</span>
                    {action.actionType === automationActionPlaceholder ? (
                      <div className='flex min-h-[96px] items-center rounded-2xl border border-dashed border-border-subtle px-3 text-sm text-text-muted'>
                        Choose an action to configure its details.
                      </div>
                    ) : null}

                    {action.actionType === 'set_assignee' ? (
                      <select
                        className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            actions: draft.actions.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    actionConfig: {
                                      userId: event.target.value || null,
                                    },
                                  }
                                : entry,
                            ),
                          })}
                        value={action.actionConfig.userId ?? ''}
                      >
                        <option value=''>Select person</option>
                        <option value='__creator__'>Card creator</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {action.actionType === 'set_status' ? (
                      <select
                        className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            actions: draft.actions.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    actionConfig: {
                                      statusOptionId: event.target.value || null,
                                    },
                                  }
                                : entry,
                            ),
                          })}
                        value={action.actionConfig.statusOptionId ?? ''}
                      >
                        <option value=''>Select status</option>
                        {statusOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {action.actionType === 'set_priority' ? (
                      <select
                        className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            actions: draft.actions.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    actionConfig: {
                                      priorityOptionId: event.target.value || null,
                                    },
                                  }
                                : entry,
                            ),
                          })}
                        value={action.actionConfig.priorityOptionId ?? ''}
                      >
                        <option value=''>Select priority</option>
                        {priorityOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {action.actionType === 'move_to_group' ? (
                      <select
                        className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            actions: draft.actions.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    actionConfig: {
                                      groupId: event.target.value || null,
                                    },
                                  }
                                : entry,
                            ),
                          })}
                        value={action.actionConfig.groupId ?? ''}
                      >
                        <option value=''>Select group</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.label}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {action.actionType === 'add_comment' ? (
                      <div className='space-y-2'>
                        <Textarea
                          className='min-h-[96px]'
                          onChange={(event) =>
                            onChange({
                              ...draft,
                              actions: draft.actions.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      actionConfig: {
                                        bodyTemplate: event.target.value,
                                      },
                                    }
                                  : entry,
                              ),
                            })}
                          placeholder='{{actor.name}} moved {{card.title}} into {{card.status}}.'
                          value={action.actionConfig.bodyTemplate ?? ''}
                        />
                        <p className='text-xs text-text-muted'>
                          Tokens: <code>{'{{actor.name}}'}</code>, <code>{'{{card.title}}'}</code>, <code>{'{{card.status}}'}</code>, <code>{'{{card.priority}}'}</code>, <code>{'{{card.assignee}}'}</code>, <code>{'{{card.group}}'}</code>
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className='flex items-end justify-end'>
                    <Button
                      disabled={draft.actions.length === 1}
                      onClick={() =>
                        onChange({
                          ...draft,
                          actions: draft.actions.filter((_, entryIndex) => entryIndex !== index),
                        })}
                      size='compact'
                      variant='ghost'
                    >
                      <X className='h-4 w-4'/>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {validationMessage || errorMessage ? (
          <div className='rounded-2xl border border-error/20 bg-error/10 px-3 py-3 text-sm text-error'>
            {validationMessage ?? errorMessage}
          </div>
        ) : null}
      </div>

      <div className='flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4'>
        <Button onClick={onCancel} variant='ghost'>
          Cancel
        </Button>
        <Button
          disabled={isSubmitting || Boolean(validationMessage)}
          onClick={onSubmit}
          variant='primary'
        >
          {isSubmitting ? 'Saving…' : selectedRule ? 'Save changes' : 'Save rule'}
        </Button>
      </div>
    </section>
  )
}
