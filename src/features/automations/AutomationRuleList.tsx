import {AlertCircle, ArrowDown, ArrowUp, Pause, Play, PlusCircle, Trash2} from 'lucide-react'

import {Badge} from '../../components/ui/badge'
import {Button} from '../../components/ui/button'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectMember} from '../access/access.types'
import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {AutomationRule} from './automation.types'
import {summarizeAutomationRule} from './automation.types'

type AutomationRuleListProps = {
  activeAutomationId: string | null
  customFields: CustomFieldDefinition[]
  groups: ProjectGroupRecord[]
  isBusy: boolean
  members: ProjectMember[]
  onCreate: () => void
  onDelete: (automationId: string) => void
  onPauseResume: (rule: AutomationRule) => void
  onReorder: (automationId: string, direction: 'up' | 'down') => void
  onSelect: (rule: AutomationRule) => void
  priorityOptions: ProjectPriorityOption[]
  rules: AutomationRule[]
  statusOptions: ProjectStatusOption[]
}

export function AutomationRuleList({
  activeAutomationId,
  customFields,
  groups,
  isBusy,
  members,
  onCreate,
  onDelete,
  onPauseResume,
  onReorder,
  onSelect,
  priorityOptions,
  rules,
  statusOptions,
}: AutomationRuleListProps) {
  const activeCount = rules.filter((rule) => rule.status === 'active').length

  return (
    <section className='overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated shadow-panel'>
      <div className='flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4'>
        <div>
          <p className='font-mono text-xs uppercase tracking-[0.22em] text-text-muted'>Rules</p>
          <h3 className='mt-1 font-display text-lg font-semibold text-text-strong'>
            {rules.length} automations
          </h3>
          <p className='mt-1 text-sm text-text-medium'>
            {activeCount} active, {rules.filter((rule) => rule.isBroken).length} broken
          </p>
        </div>

        <Button onClick={onCreate} variant='primary'>
          <PlusCircle className='h-4 w-4'/>
          New rule
        </Button>
      </div>

      <div className='max-h-[32rem] space-y-3 overflow-y-auto px-4 py-4'>
        {rules.length > 0 ? (
          rules.map((rule, index) => {
            const selected = rule.id === activeAutomationId

            return (
              <div
                className={`w-full cursor-pointer rounded-3xl border px-4 py-4 text-left transition-colors ${
                  selected
                    ? 'border-primary bg-primary-soft/30'
                    : 'border-border-subtle bg-surface-base hover:border-primary/30'
                }`}
                key={rule.id}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(rule)
                  }
                }}
                onClick={() => onSelect(rule)}
                role='button'
                tabIndex={0}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant={rule.status === 'active' ? 'primary' : 'subtle'}>
                        {rule.status === 'active' ? 'Active' : 'Paused'}
                      </Badge>
                      {rule.isBroken ? (
                        <Badge className='bg-error/10 text-error' variant='subtle'>
                          Broken
                        </Badge>
                      ) : null}
                    </div>

                    <p className='mt-3 text-sm font-medium leading-6 text-text-strong'>
                      {summarizeAutomationRule(rule, {
                        customFields,
                        groups,
                        members,
                        priorityOptions,
                        statusOptions,
                      })}
                    </p>

                    {rule.isBroken && rule.brokenReason ? (
                      <div className='mt-3 flex items-start gap-2 rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-xs text-error'>
                        <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0'/>
                        <span>{rule.brokenReason}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className='flex shrink-0 items-center gap-1'>
                    <Button
                      disabled={isBusy || index === 0}
                      onClick={(event) => {
                        event.stopPropagation()
                        onReorder(rule.id, 'up')
                      }}
                      size='compact'
                      title='Move up'
                      variant='ghost'
                    >
                      <ArrowUp className='h-4 w-4'/>
                    </Button>
                    <Button
                      disabled={isBusy || index === rules.length - 1}
                      onClick={(event) => {
                        event.stopPropagation()
                        onReorder(rule.id, 'down')
                      }}
                      size='compact'
                      title='Move down'
                      variant='ghost'
                    >
                      <ArrowDown className='h-4 w-4'/>
                    </Button>
                    <Button
                      disabled={isBusy}
                      onClick={(event) => {
                        event.stopPropagation()
                        onPauseResume(rule)
                      }}
                      size='compact'
                      title={rule.status === 'active' ? 'Pause rule' : 'Resume rule'}
                      variant='ghost'
                    >
                      {rule.status === 'active'
                        ? <Pause className='h-4 w-4'/>
                        : <Play className='h-4 w-4'/>}
                    </Button>
                    <Button
                      disabled={isBusy}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(rule.id)
                      }}
                      size='compact'
                      title='Delete rule'
                      variant='ghost'
                    >
                      <Trash2 className='h-4 w-4'/>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className='rounded-3xl border border-dashed border-border-subtle px-4 py-6 text-sm text-text-muted'>
            No automations yet. Start with a trigger, optional conditions, and one or more actions.
          </div>
        )}
      </div>
    </section>
  )
}
