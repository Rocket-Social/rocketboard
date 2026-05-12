// Wave 2 AI Kanban — My AI Kanban tab.
//
// Phase 3 PR B scope: status-grouped grid + Realtime + +New Task modal.
// The component lazily provisions the Personal AI Workspace on mount
// (Phase 3 PR A's contract) and mounts a Realtime subscription that
// invalidates the run list whenever a row in `ai_agent_runs` for this
// (user, org) changes. The empty welcome panel renders only when the
// run list is empty and not loading.

import {useEffect, useRef, useState} from 'react'
import {Loader2, Plus} from 'lucide-react'
import {useNavigate, useSearch} from '@tanstack/react-router'

import {useSignedInAppFrame} from '../../shell/SignedInAppFrame'
import {Button} from '../../../components/ui/button'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useWorkspaceSummariesQuery} from '../../projects/project-shell.queries'
import {buildProjectBaseHref} from '../../shell/route-helpers'
import {findJobBySlug} from '../agent-recipes'
import {
  useAgentRunsForUserQuery,
  useAssignablePersonasQuery,
  useCreateOneOffPersonalTaskMutation,
  useCreateRecurringPersonalTaskMutation,
  useFetchUrlAllowlistQuery,
  usePersonalAiWorkspaceQuery,
} from '../ai.queries'
import {useAgentSchedulesQuery, useUpdateAgentScheduleMutation} from '../agent-schedule.queries'
import {useAgentRunsRealtime} from '../agent.realtime'
import {MyAiKanbanGrid} from './MyAiKanbanGrid'
import {NewTaskDialog, type NewTaskFormSubmit, type UpdateScheduleSubmit} from './NewTaskDialog'
import type {AgentRunWithContext, AgentSchedule} from '../agent.types'

type MyAiKanbanTabProps = {
  onNavigateToProfiles: () => void
  onNavigateToTemplates: () => void
}

const REPEAT_PRESET_TO_CRON: Record<'daily' | 'weekly', string> = {
  daily: '0 9 * * *',
  weekly: '0 9 * * 1',
}

function repeatToCron(repeat: NewTaskFormSubmit['repeat']): string | null {
  if (repeat.kind === 'one_off') return null
  if (repeat.kind === 'cron') return repeat.cron
  return REPEAT_PRESET_TO_CRON[repeat.kind]
}

export function MyAiKanbanTab({
  onNavigateToProfiles,
  onNavigateToTemplates,
}: MyAiKanbanTabProps) {
  const {currentUser, currentWorkspace, workspaces} = useSignedInAppFrame()
  const {toast} = useToast()
  const navigate = useNavigate()
  const search = useSearch({strict: false}) as {job?: string; tab?: string}
  const organizationId =
    currentWorkspace?.organizationId ?? workspaces[0]?.organizationId ?? null
  const userId = currentUser?.id ?? null
  const [isCreateOpen, setCreateOpen] = useState(false)
  const [initialJobSlug, setInitialJobSlug] = useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<AgentSchedule | null>(null)

  const workspaceProjectQuery = usePersonalAiWorkspaceQuery({
    organizationId,
    userId,
  })
  const runsQuery = useAgentRunsForUserQuery({organizationId, userId})
  const personasQuery = useAssignablePersonasQuery(organizationId)
  const fetchUrlAllowlistQuery = useFetchUrlAllowlistQuery(organizationId)
  const workspaceSummariesQuery = useWorkspaceSummariesQuery()
  const schedulesQuery = useAgentSchedulesQuery({userId})
  const updateScheduleMutation = useUpdateAgentScheduleMutation({userId: userId ?? ''})
  const oneOffMutation = useCreateOneOffPersonalTaskMutation({
    organizationId: organizationId ?? '',
    userId: userId ?? '',
  })
  const recurringMutation = useCreateRecurringPersonalTaskMutation({
    organizationId: organizationId ?? '',
    userId: userId ?? '',
  })

  useAgentRunsRealtime({organizationId, userId})

  const runs = runsQuery.data ?? []
  const personas = personasQuery.data ?? []
  const workspaceProjectId = workspaceProjectQuery.data ?? null
  const fetchUrlAllowlist = fetchUrlAllowlistQuery.data ?? []

  // `?job=<slug>` deep-link from the Jobs section. Open the dialog with
  // the job pre-selected, then strip the param so a refresh doesn't
  // re-open the modal. The initialJobSlug local state survives the
  // URL-strip so NewTaskDialog still receives initialJob.
  useEffect(() => {
    const slug = search.job
    if (!slug) return
    const job = findJobBySlug(slug)
    if (!job) {
      void navigate({
        replace: true,
        search: (prev: Record<string, unknown>) => {
          const {job: _drop, ...rest} = prev as {job?: string}
          return rest
        },
      } as never)
      return
    }
    setInitialJobSlug(slug)
    setCreateOpen(true)
    void navigate({
      replace: true,
      search: (prev: Record<string, unknown>) => {
        const {job: _drop, ...rest} = prev as {job?: string}
        return rest
      },
    } as never)
  }, [search.job, navigate])

  // Toast on personas-load failure. The useRef guard fires the toast
  // exactly once per error transition (false → true) so a flapping query
  // can't spam the corner of the screen on every re-render.
  const hasFiredErrorToastRef = useRef(false)
  useEffect(() => {
    if (personasQuery.isError) {
      if (!hasFiredErrorToastRef.current) {
        toast({
          description: getErrorMessage(personasQuery.error, 'Could not load AI agents.'),
          title: 'Could not load AI agents',
          variant: 'error',
        })
        hasFiredErrorToastRef.current = true
      }
    } else {
      hasFiredErrorToastRef.current = false
    }
  }, [personasQuery.isError, personasQuery.error, toast])

  // Action gating. The +New Task button is disabled when there's no
  // workspace yet, while personas are loading, when the picker would
  // be empty, or when the personas query is in an error state.
  const noAgentsAvailable = !personasQuery.isPending && personas.length === 0
  const newTaskDisabled =
    !workspaceProjectId
    || personasQuery.isPending
    || noAgentsAvailable
    || personasQuery.isError

  const handleProjectClick = (projectId: string) => {
    const summaries = workspaceSummariesQuery.data ?? []
    for (const ws of summaries) {
      const project = ws.projects.find((p) => p.id === projectId)
      if (project) {
        const href = `${buildProjectBaseHref(ws.organizationSlug, ws.slug, project.slug)}/board`
        void navigate({href})
        return
      }
    }
  }

  // Heartbeat run cards on My AI Kanban open the originating schedule's
  // editor when one can be located. We don't carry an explicit
  // run→schedule FK (yet), so we match on (target_project_id, persona_id)
  // for monitor runs and (workspaceProjectId, persona_id) for recurring
  // task runs in the user's Personal AI Workspace. If no schedule
  // matches, the click is a no-op (the user can still reach the
  // Jobs & Schedules tab manually).
  const handleRunClick = (run: AgentRunWithContext) => {
    const schedules = schedulesQuery.data ?? []
    const matchProjectId = run.projectId ?? workspaceProjectId
    if (!matchProjectId || !run.persona?.id) return
    const match = schedules.find(
      (s) => s.targetProjectId === matchProjectId && s.personaId === run.persona?.id,
    )
    if (!match) {
      toast({
        description: 'No schedule found for this run. Open Jobs & Schedules to manage your schedules.',
        title: 'Schedule not found',
        variant: 'info',
      })
      return
    }
    setEditingSchedule(match)
  }

  const handleUpdateSchedule = (values: UpdateScheduleSubmit) => {
    updateScheduleMutation.mutate(values, {
      onError: (error) => {
        toast({
          description: getErrorMessage(error, 'Could not update schedule.'),
          title: 'Update failed',
          variant: 'error',
        })
      },
      onSuccess: () => {
        setEditingSchedule(null)
        toast({
          description: 'Schedule updated.',
          title: 'Saved',
        })
      },
    })
  }

  const handleSubmitTask = (values: NewTaskFormSubmit) => {
    if (!workspaceProjectId || !userId || !organizationId) {
      toast({
        description: 'Personal AI Workspace not yet provisioned. Refresh and try again.',
        title: 'Cannot create task',
        variant: 'error',
      })
      return
    }
    const persona = personas.find((p) => p.id === values.assignToPersonaId)
    if (!persona) {
      toast({
        description: 'Selected agent is no longer available.',
        title: 'Cannot create task',
        variant: 'error',
      })
      return
    }

    const cron = repeatToCron(values.repeat)
    // Monitor Jobs route the schedule at a user-picked project (where
    // the agent will scan), not the user's Personal AI Workspace. Task
    // Jobs (the original three) leave `targetProjectId` undefined and
    // fall back to the workspaceProjectId default.
    const resolvedProjectId = values.targetProjectId ?? workspaceProjectId
    const onError = (error: unknown) => {
      const message = getErrorMessage(error, 'Could not create task.')
      // Phase 7-B: special-case the free-tier quota errors so the toast
      // copy + Upgrade nudge match D7-10 / TD7-1 instead of dumping the
      // raw `free_tier_dispatch_quota_exceeded` symbol.
      if (message.includes('free_tier_dispatch_quota_exceeded')) {
        toast({
          description: "You've used all 100 dispatches this month on the free tier. Upgrade to keep dispatching.",
          title: 'Free-tier dispatch limit reached',
          variant: 'error',
        })
        return
      }
      if (message.includes('free_tier_recurring_schedule_quota_exceeded')) {
        toast({
          description: 'Free-tier orgs can have one active recurring schedule. Pause one or upgrade to add another.',
          title: 'Recurring schedule limit reached',
          variant: 'error',
        })
        return
      }
      toast({
        description: message,
        title: 'Create failed',
        variant: 'error',
      })
    }
    const onSuccess = () => {
      setCreateOpen(false)
      toast({
        description:
          values.repeat.kind === 'one_off'
            ? 'Agent dispatched. Watch the grid for updates.'
            : 'Schedule created and one card dispatched now.',
        title: 'Task created',
      })
    }

    if (values.repeat.kind === 'one_off') {
      oneOffMutation.mutate(
        {
          agentUserId: persona.agentUserId,
          bodyMd: values.bodyMd,
          cardTemplateExtras: values.cardTemplateExtras,
          title: values.title,
          workspaceProjectId: resolvedProjectId,
        },
        {onError, onSuccess},
      )
      return
    }

    if (cron === null) return

    recurringMutation.mutate(
      {
        agentUserId: persona.agentUserId,
        bodyMd: values.bodyMd,
        cardTemplateExtras: values.cardTemplateExtras,
        cronExpression: cron,
        fireOnce: true,
        organizationId,
        personaId: persona.id,
        timezone: values.timezone,
        title: values.title,
        userId,
        workspaceProjectId: resolvedProjectId,
      },
      {onError, onSuccess},
    )
  }

  const isSubmitting = oneOffMutation.isPending || recurringMutation.isPending
  const isLoading = runsQuery.isPending || workspaceProjectQuery.isPending
  const showEmptyState = !isLoading && runs.length === 0

  // Phase 4 PR 4-C: mobile FAB taps mirror the desktop button, except
  // when the disabled-gate fires we surface a toast pointing the user
  // at AI Agent Profiles. The desktop disabled state already shows
  // <NoAgentsHelpText> inline; the FAB needs an alternative because
  // it floats above the canvas and there's no inline help to read.
  const handleFabClick = () => {
    if (newTaskDisabled) {
      toast({
        description: 'Set up an AI agent in AI Agent Profiles to dispatch a task.',
        title: 'No AI agents available',
        variant: 'info',
      })
      return
    }
    setCreateOpen(true)
  }

  return (
    <>
      <div className='mb-4 flex items-start justify-between gap-4'>
        <p className='text-sm text-text-muted'>
          Your in-flight AI tasks across this organization. Free-form tasks live in your
          Personal AI Workspace.
        </p>
        <div className='hidden flex-col items-end gap-1 sm:flex'>
          <Button
            disabled={newTaskDisabled}
            onClick={() => setCreateOpen(true)}
            type='button'
            variant='primary'
          >
            <Plus className='h-4 w-4'/>
            New task
          </Button>
          {(noAgentsAvailable || personasQuery.isError) && !personasQuery.isPending ? (
            <NoAgentsHelpText onNavigateToProfiles={onNavigateToProfiles}/>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className='flex items-center justify-center py-12 text-sm text-text-muted'>
          <Loader2 className='mr-2 h-4 w-4 animate-spin'/>
          Loading your AI tasks…
        </div>
      ) : showEmptyState ? (
        <div className='flex justify-center py-12'>
          <div className='w-full max-w-md rounded-3xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-panel'>
            <h2 className='font-display text-lg font-semibold text-text-strong'>
              Nothing in flight
            </h2>
            <p className='mt-2 text-sm text-text-muted'>
              Dispatch an AI agent to a task and it will land here. Free-form tasks live in
              your Personal AI Workspace.
            </p>
            <div className='mt-6 flex flex-col items-center gap-3'>
              <Button
                disabled={newTaskDisabled}
                onClick={() => setCreateOpen(true)}
                type='button'
                variant='primary'
              >
                Create your first task
              </Button>
              {(noAgentsAvailable || personasQuery.isError) && !personasQuery.isPending ? (
                <NoAgentsHelpText onNavigateToProfiles={onNavigateToProfiles}/>
              ) : null}
              <button
                className='text-sm font-medium text-primary underline-offset-2 hover:underline'
                onClick={onNavigateToTemplates}
                type='button'
              >
                Browse jobs →
              </button>
            </div>
          </div>
        </div>
      ) : (
        <MyAiKanbanGrid
          onProjectClick={handleProjectClick}
          onRunClick={handleRunClick}
          runs={runs}
        />
      )}

      <NewTaskDialog
        editingSchedule={editingSchedule}
        fetchUrlAllowlist={fetchUrlAllowlist}
        initialJob={findJobBySlug(initialJobSlug)}
        isOpen={isCreateOpen || editingSchedule !== null}
        isSubmitting={isSubmitting || updateScheduleMutation.isPending}
        onClose={() => {
          setCreateOpen(false)
          setInitialJobSlug(null)
          setEditingSchedule(null)
        }}
        onNavigateToProfiles={onNavigateToProfiles}
        onRetryPersonas={() => {
          void personasQuery.refetch()
        }}
        onSubmit={handleSubmitTask}
        onUpdate={handleUpdateSchedule}
        organizationId={organizationId}
        personas={personas}
        personasIsError={personasQuery.isError}
        personasLoading={personasQuery.isPending}
        workspaceSummaries={workspaceSummariesQuery.data ?? []}
      />

      {/*
        Phase 4 PR 4-C: mobile FAB. Only renders below the `sm` breakpoint
        (640px) so the desktop "New task" pill button stays the primary
        affordance. We don't disable the button at the DOM level — taps on
        the FAB always succeed; the gating logic lives in handleFabClick so
        the user gets a guidance toast pointing at AI Agent Profiles when
        no agents are configured (mirrors the desktop NoAgentsHelpText).
      */}
      <button
        aria-label='Create new task'
        className='fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90 active:bg-primary/80 sm:hidden'
        data-testid='mobile-fab-new-task'
        onClick={handleFabClick}
        type='button'
      >
        <Plus className='h-6 w-6'/>
      </button>
    </>
  )
}

// Inline help text rendered below a gated +New task button. The
// "AI Agent Profiles" link mirrors the API-key-warning pattern in
// AgentProfilesTab.tsx (font-medium underline + py-1.5 px-1 to hit the
// 44px tap-target on touch devices).
function NoAgentsHelpText({onNavigateToProfiles}: {onNavigateToProfiles: () => void}) {
  return (
    <p className='mt-2 text-xs text-text-muted'>
      Set up an agent in{' '}
      <button
        className='font-medium underline underline-offset-2 hover:no-underline py-1.5 px-1'
        onClick={onNavigateToProfiles}
        type='button'
      >
        AI Agent Profiles
      </button>{' '}
      to dispatch a task.
    </p>
  )
}
