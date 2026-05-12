// AI Kanban — Jobs & Schedules tab content.
//
// File name kept as `TemplatesAndSchedulesTab.tsx` for git history; the
// exported component is `JobsAndSchedulesTab` after the founder
// vocabulary call. Two stacked sections:
//   1. Active schedules (top, conditionally rendered when ≥1 exists)
//   2. Jobs (bottom, the prebuilt catalog)
//
// Edit flow: clicking Edit on an active schedule opens NewTaskDialog
// in edit mode. The dialog reuses the same picker + config inputs.
//
// Use-this-job flow: clicking "Use this job →" navigates to
// /ai-agents?tab=kanban&job=<slug>. MyAiKanbanTab picks up the param
// and opens its own dialog.
//
// Delete recovery: success toast points the user at the Jobs section.

import {useState} from 'react'
import {useNavigate} from '@tanstack/react-router'

import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useWorkspaceSummariesQuery} from '../../projects/project-shell.queries'
import {useSignedInAppFrame} from '../../shell/SignedInAppFrame'
import {
  useAssignablePersonasQuery,
  useFetchUrlAllowlistQuery,
} from '../ai.queries'
import {
  useAgentSchedulesQuery,
  useDeleteAgentScheduleMutation,
  usePauseAgentScheduleMutation,
  useResumeAgentScheduleMutation,
  useUpdateAgentScheduleMutation,
} from '../agent-schedule.queries'
import type {AgentSchedule} from '../agent.types'
import {ActiveSchedulesSection} from './ActiveSchedulesSection'
import {NewTaskDialog, type UpdateScheduleSubmit} from './NewTaskDialog'
import {JobsSection} from './TemplateSection'

export function JobsAndSchedulesTab() {
  const {currentUser, currentWorkspace, workspaces} = useSignedInAppFrame()
  const {toast} = useToast()
  const navigate = useNavigate()

  const userId = currentUser?.id ?? null
  const organizationId =
    currentWorkspace?.organizationId ?? workspaces[0]?.organizationId ?? null

  const schedulesQuery = useAgentSchedulesQuery({userId})
  const personasQuery = useAssignablePersonasQuery(organizationId)
  const fetchUrlAllowlistQuery = useFetchUrlAllowlistQuery(organizationId)
  const workspaceSummariesQuery = useWorkspaceSummariesQuery()

  const updateMutation = useUpdateAgentScheduleMutation({userId: userId ?? ''})
  const pauseMutation = usePauseAgentScheduleMutation({userId: userId ?? ''})
  const resumeMutation = useResumeAgentScheduleMutation({userId: userId ?? ''})
  const deleteMutation = useDeleteAgentScheduleMutation({userId: userId ?? ''})

  const [editingSchedule, setEditingSchedule] = useState<AgentSchedule | null>(null)
  const [pausingScheduleId, setPausingScheduleId] = useState<string | null>(null)
  const [resumingScheduleId, setResumingScheduleId] = useState<string | null>(null)
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null)

  const handleUseJob = (slug: string) => {
    void navigate({
      replace: false,
      search: () => ({job: slug, tab: 'kanban'}),
      to: '/ai-agents',
    } as never)
  }

  const handlePause = (schedule: AgentSchedule) => {
    setPausingScheduleId(schedule.id)
    pauseMutation.mutate(schedule.id, {
      onError: (error) => {
        toast({
          description: getErrorMessage(error, 'Could not pause schedule.'),
          title: 'Pause failed',
          variant: 'error',
        })
      },
      onSettled: () => setPausingScheduleId(null),
      onSuccess: () => {
        toast({title: 'Schedule paused'})
      },
    })
  }

  const handleResume = (schedule: AgentSchedule) => {
    setResumingScheduleId(schedule.id)
    resumeMutation.mutate(schedule.id, {
      onError: (error) => {
        toast({
          description: getErrorMessage(error, 'Could not resume schedule.'),
          title: 'Resume failed',
          variant: 'error',
        })
      },
      onSettled: () => setResumingScheduleId(null),
      onSuccess: () => {
        toast({title: 'Schedule resumed'})
      },
    })
  }

  const handleConfirmDelete = (schedule: AgentSchedule) => {
    setDeletingScheduleId(schedule.id)
    deleteMutation.mutate(schedule.id, {
      onError: (error) => {
        toast({
          description: getErrorMessage(error, 'Could not delete schedule.'),
          title: 'Delete failed',
          variant: 'error',
        })
      },
      onSettled: () => setDeletingScheduleId(null),
      onSuccess: () => {
        toast({
          description: 'Recreate it from Jobs below →',
          title: 'Schedule deleted',
        })
      },
    })
  }

  const handleSaveEdit = (values: UpdateScheduleSubmit) => {
    updateMutation.mutate(
      {
        cardTemplate: values.cardTemplate,
        newCronExpression: values.newCronExpression,
        newPersonaId: values.newPersonaId,
        newTimezone: values.newTimezone,
        scheduleId: values.scheduleId,
      },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Could not update schedule.'),
            title: 'Save failed',
            variant: 'error',
          })
        },
        onSuccess: () => {
          toast({title: 'Schedule updated'})
          setEditingSchedule(null)
        },
      },
    )
  }

  return (
    <div className='flex flex-col gap-8'>
      <ActiveSchedulesSection
        deletingScheduleId={deletingScheduleId}
        isError={schedulesQuery.isError}
        isLoading={schedulesQuery.isPending}
        onConfirmDelete={handleConfirmDelete}
        onEdit={setEditingSchedule}
        onPause={handlePause}
        onResume={handleResume}
        onRetry={() => {
          void schedulesQuery.refetch()
        }}
        pausingScheduleId={pausingScheduleId}
        personas={personasQuery.data ?? []}
        resumingScheduleId={resumingScheduleId}
        schedules={schedulesQuery.data ?? []}
      />
      <JobsSection onUseJob={handleUseJob}/>

      <NewTaskDialog
        editingSchedule={editingSchedule}
        fetchUrlAllowlist={fetchUrlAllowlistQuery.data ?? []}
        isOpen={editingSchedule !== null}
        isSubmitting={updateMutation.isPending}
        onClose={() => setEditingSchedule(null)}
        onNavigateToProfiles={() => {
          void navigate({search: {tab: 'profiles'}, to: '/ai-agents'} as never)
        }}
        onRetryPersonas={() => {
          void personasQuery.refetch()
        }}
        onSubmit={() => {
          // Edit mode dispatches via onUpdate; onSubmit is unused.
        }}
        onUpdate={handleSaveEdit}
        personas={personasQuery.data ?? []}
        personasIsError={personasQuery.isError}
        personasLoading={personasQuery.isPending}
        workspaceSummaries={workspaceSummariesQuery.data ?? []}
      />
    </div>
  )
}
