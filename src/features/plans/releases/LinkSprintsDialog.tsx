import {useQuery} from '@tanstack/react-query'
import {Check, Search} from 'lucide-react'
import {useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '../../../components/ui/dialog'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import {useLinkSprintsToReleaseMutation, workspaceReleasePickerSprintsQueryOptions} from '../plan.queries'
import type {ReleasePickerSprint} from '../plan.types'

type LinkSprintsDialogProps = {
  onClose: () => void
  planViewId: string
  releaseId: string
  workspaceId: string
}

type ProjectGroup = {
  projectId: string
  projectName: string
  sprints: ReleasePickerSprint[]
}

function sprintDateRange(sprint: ReleasePickerSprint) {
  if (!sprint.startDate && !sprint.endDate) return 'No dates'
  return [sprint.startDate ?? 'Start TBD', sprint.endDate ?? 'End TBD'].join(' → ')
}

export function LinkSprintsDialog({onClose, planViewId, releaseId, workspaceId}: LinkSprintsDialogProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const pickerQuery = useQuery(workspaceReleasePickerSprintsQueryOptions(workspaceId, releaseId))
  const linkSprintsMutation = useLinkSprintsToReleaseMutation(planViewId, workspaceId)
  const {toast} = useToast()

  const projectGroups = useMemo(() => {
    const map = new Map<string, ProjectGroup>()

    for (const sprint of pickerQuery.data ?? []) {
      const matchesSearch = !searchTerm
        || sprint.name.toLowerCase().includes(searchTerm.toLowerCase())
        || sprint.projectName.toLowerCase().includes(searchTerm.toLowerCase())

      if (!matchesSearch) continue

      const existing = map.get(sprint.projectId) ?? {
        projectId: sprint.projectId,
        projectName: sprint.projectName,
        sprints: [],
      }
      existing.sprints.push(sprint)
      map.set(sprint.projectId, existing)
    }

    return [...map.values()].sort((left, right) => left.projectName.localeCompare(right.projectName))
  }, [pickerQuery.data, searchTerm])

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || linkSprintsMutation.isPending) {
      return
    }

    try {
      await linkSprintsMutation.mutateAsync({
        releaseId,
        sprintIds: [...selectedIds],
      })
      onClose()
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Couldn’t link sprints',
        variant: 'error',
      })
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='flex max-h-[80vh] w-[min(50rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] bg-surface-base'>
        <DialogHeader className='border-b border-border-subtle px-6 py-4'>
          <DialogTitle>Link sprints to release</DialogTitle>
          <DialogDescription className='mt-1'>Capture which sprint cycles fed work into this release.</DialogDescription>
        </DialogHeader>

        <div className='border-b border-border-subtle px-6 py-3'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted'/>
            <input
              autoFocus
              className='h-10 w-full rounded-xl border border-border-subtle bg-surface-elevated pl-10 pr-4 text-sm text-text-strong outline-none transition-all placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft'
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder='Search by sprint or project name...'
              value={searchTerm}
            />
          </div>
        </div>

        <div className='flex-1 overflow-y-auto px-6 py-4'>
          {pickerQuery.isPending ? (
            <div className='space-y-3'>
              {Array.from({length: 5}).map((_, index) => (
                <div className='h-12 animate-pulse rounded-2xl bg-border-subtle/30' key={index}/>
              ))}
            </div>
          ) : projectGroups.length === 0 ? (
            <div className='py-16 text-center text-sm text-text-muted'>No sprints matched this search.</div>
          ) : (
            <div className='space-y-6'>
              {projectGroups.map((group) => (
                <section key={group.projectId}>
                  <div className='mb-2 flex items-center justify-between'>
                    <h3 className='text-sm font-medium text-text-strong'>{group.projectName}</h3>
                    <span className='font-mono text-[11px] text-text-muted'>{group.sprints.length} sprints</span>
                  </div>
                  <div className='space-y-2'>
                    {group.sprints.map((sprint) => {
                      const selected = selectedIds.has(sprint.sprintId)
                      return (
                        <button
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${
                            sprint.linked
                              ? 'border-border-subtle bg-surface-muted text-text-muted'
                              : selected
                                ? 'border-primary bg-primary/5'
                                : 'border-border-subtle bg-surface-elevated hover:border-primary/30'
                          }`}
                          disabled={sprint.linked}
                          key={sprint.sprintId}
                          onClick={() => {
                            setSelectedIds((current) => {
                              const next = new Set(current)
                              if (next.has(sprint.sprintId)) next.delete(sprint.sprintId)
                              else next.add(sprint.sprintId)
                              return next
                            })
                          }}
                          type='button'
                        >
                          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-white' : 'border-border-subtle bg-surface-base'}`}>
                            {selected ? <Check className='h-3.5 w-3.5'/> : null}
                          </div>
                          <div className='min-w-0 flex-1'>
                            <p className='truncate text-sm font-medium text-text-strong'>{sprint.name}</p>
                            <p className='truncate text-xs text-text-muted'>{sprint.status} · {sprintDateRange(sprint)}</p>
                          </div>
                          {sprint.linked ? (
                            <span className='rounded-full bg-canvas-accent px-2 py-1 text-[11px] font-medium text-text-muted'>Linked</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className='flex items-center justify-between border-t border-border-subtle px-6 py-4'>
          <span className='text-sm text-text-muted'>{selectedIds.size} selected</span>
          <div className='flex items-center gap-2'>
            <Button onClick={onClose} variant='ghost'>Cancel</Button>
            <Button disabled={selectedIds.size === 0 || linkSprintsMutation.isPending} onClick={() => void handleSubmit()} variant='primary'>
              {linkSprintsMutation.isPending ? 'Linking…' : 'Link sprints'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
