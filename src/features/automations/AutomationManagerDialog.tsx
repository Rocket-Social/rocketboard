import {useEffect, useMemo, useState} from 'react'
import {FilePlus2, History, Loader2, Sparkles} from 'lucide-react'

import {ConfirmDialog} from '../../components/ui/confirm-dialog'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../components/ui/dialog'
import {PillTabs} from '../../components/ui/pill-tabs'
import {useToast} from '../../components/ui/toast'
import {useConfirmDialog} from '../../hooks/useConfirmDialog'
import {getErrorMessage} from '../../platform/data/rpc-adapter'
import type {ProjectPriorityOption, ProjectStatusOption} from '../cards/card.types'
import type {CustomFieldDefinition} from '../fields/field.types'
import type {ProjectGroupRecord} from '../projects/project-group.types'
import type {ProjectMember} from '../access/access.types'
import {
  useCreateProjectAutomationMutation,
  useDeleteProjectAutomationMutation,
  usePauseProjectAutomationMutation,
  useProjectAutomationRunsQuery,
  useProjectAutomationsQuery,
  useReorderProjectAutomationsMutation,
  useResumeProjectAutomationMutation,
  useUpdateProjectAutomationMutation,
} from './automation.queries'
import {AutomationRuleEditor} from './AutomationRuleEditor'
import {AutomationRuleList} from './AutomationRuleList'
import {AutomationRunLog} from './AutomationRunLog'
import {
  createEmptyAutomationDraft,
  toAutomationDraft,
  toPersistedAutomationDraft,
  type AutomationRuleDraft,
} from './automation.types'

type AutomationManagerDialogProps = {
  canEditProject: boolean
  customFields: CustomFieldDefinition[]
  groups: ProjectGroupRecord[]
  isOpen: boolean
  members: ProjectMember[]
  onClose: () => void
  priorityOptions: ProjectPriorityOption[]
  projectId: string
  projectName: string
  statusOptions: ProjectStatusOption[]
}

type AutomationManagerTab = 'editor' | 'run_log'

export function AutomationManagerDialog({
  canEditProject,
  customFields,
  groups,
  isOpen,
  members,
  onClose,
  priorityOptions,
  projectId,
  projectName,
  statusOptions,
}: AutomationManagerDialogProps) {
  const {toast} = useToast()
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const automationsQuery = useProjectAutomationsQuery(projectId, {enabled: isOpen})
  const runsQuery = useProjectAutomationRunsQuery(projectId, 25, null, {enabled: isOpen})
  const createAutomationMutation = useCreateProjectAutomationMutation(projectId)
  const updateAutomationMutation = useUpdateProjectAutomationMutation(projectId)
  const pauseAutomationMutation = usePauseProjectAutomationMutation(projectId)
  const resumeAutomationMutation = useResumeProjectAutomationMutation(projectId)
  const deleteAutomationMutation = useDeleteProjectAutomationMutation(projectId)
  const reorderAutomationsMutation = useReorderProjectAutomationsMutation(projectId)
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | 'new' | null>(null)
  const [activeTab, setActiveTab] = useState<AutomationManagerTab>('editor')
  const [draft, setDraft] = useState<AutomationRuleDraft>(createEmptyAutomationDraft())

  const rules = automationsQuery.data ?? []
  const selectedRule = selectedAutomationId && selectedAutomationId !== 'new'
    ? rules.find((rule) => rule.id === selectedAutomationId) ?? null
    : null

  useEffect(() => {
    if (!isOpen || automationsQuery.isLoading) {
      return
    }

    if (selectedAutomationId === null) {
      if (rules[0]) {
        setSelectedAutomationId(rules[0].id)
        setDraft(toAutomationDraft(rules[0]))
      } else {
        setSelectedAutomationId('new')
        setDraft(createEmptyAutomationDraft())
      }
      return
    }

    if (selectedAutomationId !== 'new' && !rules.some((rule) => rule.id === selectedAutomationId)) {
      if (rules[0]) {
        setSelectedAutomationId(rules[0].id)
        setDraft(toAutomationDraft(rules[0]))
      } else {
        setSelectedAutomationId('new')
        setDraft(createEmptyAutomationDraft())
      }
    }
  }, [automationsQuery.isLoading, isOpen, rules, selectedAutomationId])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setActiveTab('editor')
  }, [isOpen])

  const isBusy = useMemo(
    () => (
      createAutomationMutation.isPending
      || updateAutomationMutation.isPending
      || pauseAutomationMutation.isPending
      || resumeAutomationMutation.isPending
      || deleteAutomationMutation.isPending
      || reorderAutomationsMutation.isPending
    ),
    [
      createAutomationMutation.isPending,
      deleteAutomationMutation.isPending,
      pauseAutomationMutation.isPending,
      reorderAutomationsMutation.isPending,
      resumeAutomationMutation.isPending,
      updateAutomationMutation.isPending,
    ],
  )


  const editorError = getErrorMessage(
    selectedRule ? updateAutomationMutation.error : createAutomationMutation.error,
    '',
  ) || null

  const handleSelectRule = (ruleId: string | 'new', nextDraft: AutomationRuleDraft) => {
    setSelectedAutomationId(ruleId)
    setActiveTab('editor')
    setDraft(nextDraft)
    createAutomationMutation.reset()
    updateAutomationMutation.reset()
  }

  const handleSubmit = () => {
    const payload = toPersistedAutomationDraft(draft)

    if (payload.actions.length === 0) {
      return
    }

    if (selectedRule) {
      updateAutomationMutation.mutate(
        {
          ...payload,
          automationId: selectedRule.id,
        },
        {
          onError: (error) => {
            toast({title: getErrorMessage(error, 'Failed to update automation'), variant: 'error'})
          },
          onSuccess: (rule) => {
            handleSelectRule(rule.id, toAutomationDraft(rule))
            toast({title: 'Automation updated'})
          },
        },
      )
      return
    }

    createAutomationMutation.mutate(payload, {
      onError: (error) => {
        toast({title: getErrorMessage(error, 'Failed to create automation'), variant: 'error'})
      },
      onSuccess: (rule) => {
        handleSelectRule(rule.id, toAutomationDraft(rule))
        toast({title: 'Automation created'})
      },
    })
  }

  const handleReorder = (automationId: string, direction: 'up' | 'down') => {
    const currentIndex = rules.findIndex((rule) => rule.id === automationId)

    if (currentIndex === -1) {
      return
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (targetIndex < 0 || targetIndex >= rules.length) {
      return
    }

    const reorderedIds = [...rules.map((rule) => rule.id)]
    const [movedId] = reorderedIds.splice(currentIndex, 1)
    reorderedIds.splice(targetIndex, 0, movedId)

    reorderAutomationsMutation.mutate(reorderedIds, {
      onError: (error) => {
        toast({title: getErrorMessage(error, 'Failed to reorder automations'), variant: 'error'})
      },
    })
  }

  const handlePauseResume = (automationId: string, nextStatus: 'active' | 'paused') => {
    const mutation = nextStatus === 'active' ? resumeAutomationMutation : pauseAutomationMutation

    mutation.mutate(automationId, {
      onError: (error) => {
        toast({
          title: getErrorMessage(
            error,
            nextStatus === 'active' ? 'Failed to resume automation' : 'Failed to pause automation',
          ),
          variant: 'error',
        })
      },
      onSuccess: (rule) => {
        if (selectedAutomationId === rule.id) {
          setDraft(toAutomationDraft(rule))
        }
        toast({title: nextStatus === 'active' ? 'Automation resumed' : 'Automation paused'})
      },
    })
  }

  const handleDelete = async (automationId: string) => {
    const targetRule = rules.find((rule) => rule.id === automationId)

    if (!targetRule) {
      return
    }

    if (!await confirm({title: 'Delete this automation?', description: 'Its run history will remain, but the rule will stop running.', variant: 'destructive', confirmLabel: 'Delete'})) {
      return
    }

    deleteAutomationMutation.mutate(automationId, {
      onError: (error) => {
        toast({title: getErrorMessage(error, 'Failed to delete automation'), variant: 'error'})
      },
      onSuccess: () => {
        if (selectedAutomationId === automationId) {
          setSelectedAutomationId(null)
          setDraft(createEmptyAutomationDraft())
        }
        toast({title: 'Automation deleted'})
      },
    })
  }

  const editorTabLabel = selectedRule ? 'Edit' : 'Create'
  const rightPaneTabs = [
    {icon: FilePlus2, id: 'editor', label: editorTabLabel},
    {icon: History, id: 'run_log', label: 'Run Log'},
  ] as const

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='h-[min(54rem,calc(100vh-2rem))] w-[min(88rem,calc(100vw-2rem))] overflow-hidden rounded-[30px] bg-surface-base p-0'>
        <DialogHeader className='px-6 py-5'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>Automation Manager</p>
          <DialogTitle className='mt-1 font-display text-2xl'>Automate work in {projectName}</DialogTitle>
          <DialogDescription className='mt-2'>
            Rules run synchronously when cards are created or updated. Matching stays deterministic and non-cascading.
          </DialogDescription>
        </DialogHeader>

        {!canEditProject ? (
          <div className='flex h-[calc(100%-5.5rem)] items-center justify-center px-6 py-8'>
            <div className='max-w-lg rounded-3xl border border-border-subtle bg-surface-elevated px-6 py-6 text-center shadow-panel'>
              <Sparkles className='mx-auto h-8 w-8 text-text-muted'/>
              <h3 className='mt-3 font-display text-xl font-semibold text-text-strong'>Automation access requires project write access</h3>
              <p className='mt-2 text-sm text-text-medium'>
                Ask someone with project write access to create or edit automation rules for this project.
              </p>
            </div>
          </div>
        ) : automationsQuery.isLoading ? (
          <div className='flex h-[calc(100%-5.5rem)] items-center justify-center px-6 py-8'>
            <div className='flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-elevated px-4 py-3 text-sm text-text-medium shadow-panel'>
              <Loader2 className='h-4 w-4 animate-spin'/>
              Loading automations…
            </div>
          </div>
        ) : (
          <div className='grid h-[calc(100%-5.5rem)] gap-5 overflow-hidden px-6 py-5 lg:grid-cols-[24rem_minmax(0,1fr)]'>
            <AutomationRuleList
              activeAutomationId={selectedRule?.id ?? (selectedAutomationId === 'new' ? null : selectedAutomationId)}
              customFields={customFields}
              groups={groups}
              isBusy={isBusy}
              members={members}
              onCreate={() => handleSelectRule('new', createEmptyAutomationDraft())}
              onDelete={handleDelete}
              onPauseResume={(rule) => handlePauseResume(rule.id, rule.status === 'active' ? 'paused' : 'active')}
              onReorder={handleReorder}
              onSelect={(rule) => handleSelectRule(rule.id, toAutomationDraft(rule))}
              priorityOptions={priorityOptions}
              rules={rules}
              statusOptions={statusOptions}
            />

            <div className='flex h-full min-h-0 flex-col overflow-hidden'>
              <div className='flex items-center justify-between gap-3 border-b border-border-subtle px-1 pb-4'>
                <PillTabs
                  activeTab={activeTab}
                  ariaLabel='Automation manager views'
                  onTabChange={(nextTabId) => setActiveTab(nextTabId as AutomationManagerTab)}
                  tabs={[...rightPaneTabs]}
                />
              </div>

              <div className='mt-5 min-h-0 flex-1 overflow-hidden'>
                {activeTab === 'editor' ? (
                  <AutomationRuleEditor
                    customFields={customFields}
                    draft={draft}
                    errorMessage={editorError}
                    groups={groups}
                    isSubmitting={createAutomationMutation.isPending || updateAutomationMutation.isPending}
                    members={members}
                    onCancel={() => {
                      if (selectedRule) {
                        handleSelectRule(selectedRule.id, toAutomationDraft(selectedRule))
                      } else {
                        handleSelectRule('new', createEmptyAutomationDraft())
                      }
                    }}
                    onChange={setDraft}
                    onSubmit={handleSubmit}
                    priorityOptions={priorityOptions}
                    selectedRule={selectedRule}
                    statusOptions={statusOptions}
                  />
                ) : (
                  <AutomationRunLog
                    customFields={customFields}
                    groups={groups}
                    isLoading={runsQuery.isLoading}
                    members={members}
                    priorityOptions={priorityOptions}
                    rules={rules}
                    runs={runsQuery.data ?? []}
                    statusOptions={statusOptions}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </Dialog>
  )
}
