import {useQuery} from '@tanstack/react-query'
import {Rows3, Unlink2} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {planReleaseLinkedSprintsQueryOptions, useUnlinkSprintFromReleaseMutation} from '../plan.queries'
import type {ReleaseLinkedSprint} from '../plan.types'
import {LinkSprintsDialog} from './LinkSprintsDialog'

type ReleaseLinkedSprintsPanelProps = {
  planViewId: string
  releaseId: string
  workspaceId: string
}

type ProjectGroup = {
  projectId: string
  projectName: string
  sprints: ReleaseLinkedSprint[]
}

function sprintDateRange(sprint: ReleaseLinkedSprint) {
  if (!sprint.startDate && !sprint.endDate) return 'No dates'
  return [sprint.startDate ?? 'Start TBD', sprint.endDate ?? 'End TBD'].join(' → ')
}

export function ReleaseLinkedSprintsPanel({planViewId, releaseId, workspaceId}: ReleaseLinkedSprintsPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const linkedSprintsQuery = useQuery(planReleaseLinkedSprintsQueryOptions(releaseId))
  const unlinkMutation = useUnlinkSprintFromReleaseMutation(planViewId, workspaceId)
  const {toast} = useToast()

  const projectGroups = useMemo(() => {
    const map = new Map<string, ProjectGroup>()

    for (const sprint of linkedSprintsQuery.data ?? []) {
      const existing = map.get(sprint.projectId) ?? {
        projectId: sprint.projectId,
        projectName: sprint.projectName,
        sprints: [],
      }
      existing.sprints.push(sprint)
      map.set(sprint.projectId, existing)
    }

    return [...map.values()].sort((left, right) => left.projectName.localeCompare(right.projectName))
  }, [linkedSprintsQuery.data])

  const handleUnlink = async (sprintId: string) => {
    try {
      await unlinkMutation.mutateAsync({releaseId, sprintId})
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t unlink sprint',
        variant: 'error',
      })
    }
  }

  return (
    <>
      <div className='rounded-3xl border border-border-subtle bg-surface-base p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3'>
          <div>
            <p className='text-sm font-medium text-text-strong'>Linked Sprints</p>
            <p className='mt-1 text-xs text-text-muted'>Trace the sprint windows that funneled work into this release.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} size='compact' variant='secondary'>
            <Rows3 className='h-3.5 w-3.5'/>
            Link sprints
          </Button>
        </div>

        {linkedSprintsQuery.isPending ? (
          <div className='mt-4 space-y-3'>
            {Array.from({length: 4}).map((_, index) => (
              <div className='h-12 animate-pulse rounded-2xl bg-border-subtle/30' key={index}/>
            ))}
          </div>
        ) : projectGroups.length === 0 ? (
          <div className='py-10 text-center'>
            <p className='text-sm text-text-medium'>No sprints linked yet.</p>
            <p className='mt-1 text-xs text-text-muted'>Add sprint context when you need the release train view across projects.</p>
          </div>
        ) : (
          <div className='mt-4 space-y-6'>
            {projectGroups.map((group) => (
              <section key={group.projectId}>
                <div className='mb-2 flex items-center justify-between'>
                  <h3 className='text-sm font-medium text-text-strong'>{group.projectName}</h3>
                  <span className='font-mono text-[11px] text-text-muted'>{group.sprints.length} linked</span>
                </div>
                <div className='space-y-2'>
                  {group.sprints.map((sprint) => (
                    <div className='flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-elevated px-3 py-3' key={sprint.sprintId}>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium text-text-strong'>{sprint.name}</p>
                        <p className='truncate text-xs text-text-muted'>{sprint.status} · {sprintDateRange(sprint)}</p>
                      </div>
                      <Button
                        onClick={() => void handleUnlink(sprint.sprintId)}
                        size='compact'
                        variant='ghost'
                      >
                        <Unlink2 className='h-3.5 w-3.5'/>
                        Unlink
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {dialogOpen ? (
        <LinkSprintsDialog
          onClose={() => setDialogOpen(false)}
          planViewId={planViewId}
          releaseId={releaseId}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  )
}
