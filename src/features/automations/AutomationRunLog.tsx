import {useMemo} from 'react'
import {AlertCircle, CheckCircle2, Clock3, XCircle} from 'lucide-react'

import {Badge} from '../../components/ui/badge'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectMember} from '../access/access.types'
import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {AutomationRule, AutomationRun} from './automation.types'
import {
  automationActionLabels,
  automationTriggerLabels,
  formatAutomationRunReason,
  summarizeAutomationRule,
} from './automation.types'

type AutomationRunLogProps = {
  customFields: CustomFieldDefinition[]
  groups: ProjectGroupRecord[]
  isLoading: boolean
  members: ProjectMember[]
  priorityOptions: ProjectPriorityOption[]
  rules: AutomationRule[]
  runs: AutomationRun[]
  statusOptions: ProjectStatusOption[]
}

function getMetadataText(metadata: Record<string, unknown>) {
  if (typeof metadata.error === 'string' && metadata.error.trim().length > 0) {
    return metadata.error
  }

  if (typeof metadata.brokenReason === 'string' && metadata.brokenReason.trim().length > 0) {
    return metadata.brokenReason
  }

  return null
}

function getRunIcon(outcome: AutomationRun['outcome']) {
  switch (outcome) {
    case 'applied':
      return <CheckCircle2 className='h-4 w-4 text-emerald-600'/>
    case 'failed':
      return <XCircle className='h-4 w-4 text-error'/>
    default:
      return <Clock3 className='h-4 w-4 text-amber-600'/>
  }
}

export function AutomationRunLog({
  customFields,
  groups,
  isLoading,
  members,
  priorityOptions,
  rules,
  runs,
  statusOptions,
}: AutomationRunLogProps) {
  const rulesById = useMemo(
    () => new Map(rules.map((rule) => [rule.id, rule])),
    [rules],
  )

  return (
    <section className='overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated shadow-panel'>
      <div className='border-b border-border-subtle px-5 py-4'>
        <h3 className='font-display text-lg font-semibold text-text-strong'>Latest executions</h3>
      </div>

      <div className='max-h-[20rem] space-y-3 overflow-y-auto px-4 py-4'>
        {isLoading ? (
          <div className='rounded-3xl border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted'>
            Loading automation runs…
          </div>
        ) : runs.length > 0 ? (
          runs.map((run) => {
            const linkedRule = run.automationId ? rulesById.get(run.automationId) ?? null : null
            const metadataText = getMetadataText(run.metadata)
            const actionLabels = run.actionsExecuted
              .map((entry) => {
                const actionType = entry.actionType
                return typeof actionType === 'string'
                  ? automationActionLabels[actionType as keyof typeof automationActionLabels] ?? actionType
                  : null
              })
              .filter((value): value is string => Boolean(value))

            return (
              <div className='rounded-3xl border border-border-subtle bg-surface-base px-4 py-4' key={run.id}>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='flex items-center gap-2 text-sm font-medium text-text-strong'>
                        {getRunIcon(run.outcome)}
                        {linkedRule
                          ? summarizeAutomationRule(linkedRule, {
                              customFields,
                              groups,
                              members,
                              priorityOptions,
                              statusOptions,
                            })
                          : automationTriggerLabels[run.triggerType]}
                      </span>
                      <Badge
                        className={
                          run.outcome === 'failed'
                            ? 'bg-error/10 text-error'
                            : run.outcome === 'applied'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                        }
                        variant='subtle'
                      >
                        {run.outcome}
                      </Badge>
                    </div>

                    <p className='mt-2 text-sm text-text-medium'>
                      {run.cardTitle ? `Card: ${run.cardTitle}` : 'Card deleted'} · {formatAutomationRunReason(run.reasonCode)}
                    </p>

                    {actionLabels.length > 0 ? (
                      <p className='mt-1 text-xs text-text-muted'>
                        Executed: {actionLabels.join(', ')}
                      </p>
                    ) : null}

                    {metadataText ? (
                      <div className='mt-3 flex items-start gap-2 rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-xs text-error'>
                        <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0'/>
                        <span>{metadataText}</span>
                      </div>
                    ) : null}
                  </div>

                  <span className='shrink-0 text-xs text-text-muted'>
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            )
          })
        ) : (
          <div className='rounded-3xl border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted'>
            No automation runs yet. Executions will appear here as cards match your rules.
          </div>
        )}
      </div>
    </section>
  )
}
