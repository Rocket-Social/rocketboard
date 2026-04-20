import {Plus} from 'lucide-react'
import {useCallback, useRef, useState} from 'react'

import {useToast} from '../../../components/ui/toast'
import {useUpsertMatrixCellMutation} from '../plan.queries'
import type {RoadmapMatrixCell} from '../plan.types'

type MatrixCellProps = {
  cell: RoadmapMatrixCell | null
  laneColor: string
  laneId: string
  periodKey: string
  planViewId: string
}

export function MatrixCell({cell, laneColor, laneId, periodKey, planViewId}: MatrixCellProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(cell?.contentText ?? '')
  const [error, setError] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const upsertMutation = useUpsertMatrixCellMutation(planViewId)
  const {toast} = useToast()

  const handleSave = useCallback(async () => {
    const trimmed = value.trim()
    if (trimmed === (cell?.contentText ?? '')) {
      setEditing(false)
      return
    }
    try {
      await upsertMutation.mutateAsync({contentText: trimmed, laneId, periodKey, planViewId})
      setEditing(false)
    } catch {
      setError(true)
      toast({title: 'Could not save. Your changes are still here — try again.', variant: 'error'})
      setTimeout(() => setError(false), 2000)
    }
  }, [value, cell?.contentText, upsertMutation, laneId, periodKey, planViewId, toast])

  if (editing) {
    return (
      <div
        className='relative min-h-[80px] max-h-[200px] overflow-y-auto p-2'
        style={{borderLeft: `3px solid ${laneColor}`, backgroundColor: `${laneColor}08`}}
      >
        <textarea
          autoFocus
          className={`h-full min-h-[72px] w-full resize-none bg-transparent text-sm text-text-strong outline-none placeholder:text-text-muted ${error ? 'ring-2 ring-error rounded-[10px]' : ''}`}
          onBlur={() => void handleSave()}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSave()
            if (e.key === 'Escape') { setValue(cell?.contentText ?? ''); setEditing(false) }
          }}
          placeholder='Type here...'
          ref={textareaRef}
          value={value}
        />
        {upsertMutation.isPending ? (
          <div className='absolute right-2 top-2 h-2 w-2 animate-spin rounded-full border border-text-muted border-t-transparent'/>
        ) : null}
      </div>
    )
  }

  const lines = (cell?.contentText ?? '').split('\n').filter(Boolean)

  if (lines.length === 0) {
    return (
      <button
        className='flex min-h-[80px] w-full items-center justify-center text-text-muted/30 hover:text-text-muted/60 hover:bg-canvas-accent/30 transition-colors'
        onClick={() => { setValue(''); setEditing(true) }}
        type='button'
      >
        <Plus className='h-5 w-5'/>
      </button>
    )
  }

  return (
    <button
      className='min-h-[80px] w-full p-2 text-left transition-colors hover:bg-canvas-accent/30'
      onClick={() => { setValue(cell?.contentText ?? ''); setEditing(true) }}
      style={{borderLeft: `3px solid ${laneColor}`, backgroundColor: `${laneColor}08`}}
      type='button'
    >
      <ul className='space-y-0.5'>
        {lines.map((line, i) => (
          <li className='flex items-start gap-1.5 text-sm leading-relaxed text-text-strong' key={i}>
            <span className='mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted/40'/>
            {line}
          </li>
        ))}
      </ul>
    </button>
  )
}
