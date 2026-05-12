import {useCallback, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {Popover, PopoverContent, PopoverTrigger} from '../../../components/ui/popover'
import {useUpdateInitiativeMutation} from '../initiative.queries'
import type {InitiativeRecord, InitiativeStatus} from '../initiative.types'

const statusLabels: Record<InitiativeStatus, string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  completed: 'Completed',
  paused: 'Paused',
  planned: 'Planned',
}

const statusOptions: InitiativeStatus[] = ['planned', 'active', 'completed', 'paused', 'cancelled']

export function statusBadgeClasses(status: InitiativeStatus) {
  switch (status) {
    case 'active':
      return 'bg-primary/10 text-primary border-primary/20'
    case 'completed':
      return 'bg-success/10 text-success border-success/20'
    case 'paused':
      return 'bg-warning/10 text-warning border-warning/20'
    case 'cancelled':
      return 'bg-text-muted/10 text-text-muted border-border-subtle'
    default:
      return 'bg-surface-muted text-text-medium border-border-subtle'
  }
}

export {statusLabels}

export function StatusPopover({
  initiativeId,
  status,
}: {
  initiativeId: string
  status: InitiativeStatus
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const updateMutation = useUpdateInitiativeMutation()

  const handleSelect = useCallback((newStatus: InitiativeStatus) => {
    if (newStatus === status) {
      setOpen(false)
      return
    }
    const previousData = queryClient.getQueriesData({predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'workspace-initiatives'})

    queryClient.setQueriesData(
      {predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'workspace-initiatives' && q.queryKey.length === 2},
      (old: InitiativeRecord[] | undefined) =>
        old?.map((i) => (i.id === initiativeId ? {...i, status: newStatus} : i)),
    )

    updateMutation.mutate(
      {id: initiativeId, status: newStatus},
      {
        onError: () => {
          for (const [key, data] of previousData) {
            queryClient.setQueryData(key, data)
          }
        },
        onSettled: () => {
          queryClient.invalidateQueries({predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'workspace-initiatives'})
        },
      },
    )
    setOpen(false)
  }, [status, initiativeId, queryClient, updateMutation])

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 ${statusBadgeClasses(status)}`}
          type='button'
        >
          {statusLabels[status]}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-44 p-1' sideOffset={4}>
        {statusOptions.map((s) => (
          <button
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-canvas-accent ${s === status ? 'font-medium' : ''}`}
            key={s}
            onClick={() => handleSelect(s)}
            type='button'
          >
            <span className='flex-1'>{statusLabels[s]}</span>
            {s === status ? <span className='text-xs text-text-muted'>✓</span> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
