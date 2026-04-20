import {MoreHorizontal, Palette, Pencil, Trash2} from 'lucide-react'
import {useCallback, useState} from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'
import {ConfirmDialog} from '../../../components/ui/confirm-dialog'
import {useConfirmDialog} from '../../../hooks/useConfirmDialog'
import {useToast} from '../../../components/ui/toast'
import {getErrorMessage} from '../../../platform/data/rpc-adapter'
import type {RoadmapLane} from '../plan.types'
import {useDeleteRoadmapLaneMutation, useUpdateRoadmapLaneMutation} from '../plan.queries'

const laneColors = [
  {bg: '#f5ead4', border: '#e4d5b5', key: 'sand'},
  {bg: '#dcecd6', border: '#c1dbb7', key: 'sage'},
  {bg: '#e6ddf5', border: '#d0c3e8', key: 'lavender'},
  {bg: '#d8eaf8', border: '#b9d6f0', key: 'sky'},
  {bg: '#fae0d0', border: '#f0c8ad', key: 'peach'},
  {bg: '#e2e0de', border: '#ccc9c5', key: 'slate'},
  {bg: '#f5dce0', border: '#e8c4ca', key: 'rose'},
  {bg: '#d3f0ea', border: '#b5e0d7', key: 'mint'},
] as const

type RoadmapLaneActionsProps = {
  lane: RoadmapLane
  onRenameStart: (laneId: string) => void
  planViewId: string
}

export function RoadmapLaneActions({lane, onRenameStart, planViewId}: RoadmapLaneActionsProps) {
  const [showColors, setShowColors] = useState(false)
  const updateMutation = useUpdateRoadmapLaneMutation(planViewId)
  const deleteMutation = useDeleteRoadmapLaneMutation(planViewId)
  const {confirm, confirmDialogProps} = useConfirmDialog()
  const {toast} = useToast()

  const handleColorChange = useCallback(async (colorKey: string) => {
    try {
      await updateMutation.mutateAsync({color: colorKey, laneId: lane.id})
    } catch (error) {
      toast({title: getErrorMessage(error, 'Could not change color'), variant: 'error'})
    }
    setShowColors(false)
  }, [lane.id, updateMutation, toast])

  const handleDelete = useCallback(async () => {
    const confirmed = await confirm({
      confirmLabel: 'Delete',
      description: 'This will also delete all items in this lane. This cannot be undone.',
      title: `Delete "${lane.title}"?`,
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await deleteMutation.mutateAsync(lane.id)
      toast({title: `Lane "${lane.title}" deleted`})
    } catch (error) {
      toast({title: getErrorMessage(error, 'Could not delete lane'), variant: 'error'})
    }
  }, [lane.id, lane.title, confirm, deleteMutation, toast])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className='rounded-[10px] p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-canvas-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:outline-none'
            type='button'
          >
            <MoreHorizontal className='h-3.5 w-3.5 text-text-muted'/>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' side='bottom'>
          <DropdownMenuItem onClick={() => onRenameStart(lane.id)}>
            <Pencil className='mr-2 h-3.5 w-3.5'/>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowColors(!showColors)}>
            <Palette className='mr-2 h-3.5 w-3.5'/>
            Change color
          </DropdownMenuItem>
          {showColors ? (
            <div className='flex gap-1.5 px-2 py-1.5'>
              {laneColors.map((c) => (
                <button
                  className={`h-6 w-6 rounded-full border-2 transition-all ${lane.color === c.key ? 'border-primary scale-110' : 'border-transparent hover:scale-105'}`}
                  key={c.key}
                  onClick={() => void handleColorChange(c.key)}
                  style={{backgroundColor: c.bg}}
                  type='button'
                />
              ))}
            </div>
          ) : null}
          <DropdownMenuItem className='text-error focus:text-error' onClick={() => void handleDelete()}>
            <Trash2 className='mr-2 h-3.5 w-3.5'/>
            Delete lane
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps}/> : null}
    </>
  )
}
