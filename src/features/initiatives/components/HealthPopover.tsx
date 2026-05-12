import {useCallback, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {Popover, PopoverContent, PopoverTrigger} from '../../../components/ui/popover'
import {useUpdateInitiativeMutation} from '../initiative.queries'
import type {InitiativeHealth, InitiativeRecord} from '../initiative.types'

const healthColors: Record<InitiativeHealth, string> = {
  at_risk: 'var(--color-warning)',
  off_track: 'var(--color-error)',
  on_track: 'var(--color-success)',
}

const healthLabels: Record<InitiativeHealth, string> = {
  at_risk: 'At Risk',
  off_track: 'Off Track',
  on_track: 'On Track',
}

const healthOptions: InitiativeHealth[] = ['on_track', 'at_risk', 'off_track']

export function healthChipClasses(health: InitiativeHealth) {
  switch (health) {
    case 'on_track':
      return 'bg-success/10 text-success border-success/20'
    case 'at_risk':
      return 'bg-warning/10 text-warning border-warning/20'
    case 'off_track':
      return 'bg-error/10 text-error border-error/20'
  }
}

export {healthColors, healthLabels}

export function HealthPopover({
  health,
  initiativeId,
}: {
  health: InitiativeHealth
  initiativeId: string
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const updateMutation = useUpdateInitiativeMutation()

  const handleSelect = useCallback((newHealth: InitiativeHealth) => {
    if (newHealth === health) {
      setOpen(false)
      return
    }
    const previousData = queryClient.getQueriesData({predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'workspace-initiatives'})

    queryClient.setQueriesData(
      {predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'workspace-initiatives' && q.queryKey.length === 2},
      (old: InitiativeRecord[] | undefined) =>
        old?.map((i) => (i.id === initiativeId ? {...i, health: newHealth} : i)),
    )

    updateMutation.mutate(
      {health: newHealth, id: initiativeId},
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
  }, [health, initiativeId, queryClient, updateMutation])

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80 ${healthChipClasses(health)}`}
          type='button'
        >
          ● {healthLabels[health]}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-44 p-1' sideOffset={4}>
        {healthOptions.map((h) => (
          <button
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-canvas-accent ${h === health ? 'font-medium' : ''}`}
            key={h}
            onClick={() => handleSelect(h)}
            type='button'
          >
            <span className='h-2 w-2 rounded-full' style={{backgroundColor: healthColors[h]}}/>
            <span className='flex-1'>{healthLabels[h]}</span>
            {h === health ? <span className='text-xs text-text-muted'>✓</span> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
