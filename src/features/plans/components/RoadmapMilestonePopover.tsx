import {Circle, Diamond, Flag, X} from 'lucide-react'
import {useState} from 'react'

import {Button} from '../../../components/ui/button'
import type {RoadmapLane, RoadmapMilestone} from '../plan.types'

type MilestoneTypeOption = {icon: typeof Diamond; key: 'circle' | 'diamond' | 'flag'; label: string}

const milestoneTypes: MilestoneTypeOption[] = [
  {icon: Diamond, key: 'diamond', label: 'Diamond'},
  {icon: Circle, key: 'circle', label: 'Circle'},
  {icon: Flag, key: 'flag', label: 'Flag'},
]

const milestoneColors = [
  {bg: '#a86c0f', key: 'warning'},
  {bg: '#a13d34', key: 'error'},
  {bg: '#2f7a55', key: 'success'},
  {bg: '#335c8f', key: 'info'},
  {bg: '#6b4fb0', key: 'purple'},
  {bg: '#5a5753', key: 'slate'},
]

type RoadmapMilestonePopoverProps = {
  defaultDate?: string
  lanes: RoadmapLane[]
  milestone?: RoadmapMilestone
  onClose: () => void
  onDelete?: (milestoneId: string) => void
  onSave: (data: {color?: string; date: string; label: string; laneId?: string | null; type: 'circle' | 'diamond' | 'flag'}) => void
}

export function RoadmapMilestonePopover({defaultDate, lanes, milestone, onClose, onDelete, onSave}: RoadmapMilestonePopoverProps) {
  const [label, setLabel] = useState(milestone?.label ?? '')
  const [date, setDate] = useState(milestone?.milestoneDate ?? defaultDate ?? new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<'circle' | 'diamond' | 'flag'>(milestone?.milestoneType ?? 'diamond')
  const [laneId, setLaneId] = useState<string | null>(milestone?.laneId ?? null)
  const [color, setColor] = useState<string>(milestone?.color ?? 'warning')

  const handleSave = () => {
    if (!label.trim() || !date) return
    onSave({color, date, label: label.trim(), laneId, type})
    onClose()
  }

  return (
    <div
      className='absolute z-50 w-72 rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-md'
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className='mb-3 flex items-center justify-between'>
        <span className='text-xs font-medium text-text-muted'>{milestone ? 'Edit milestone' : 'New milestone'}</span>
        <button className='rounded-[10px] p-1 text-text-muted hover:bg-canvas-accent hover:text-text-strong' onClick={onClose} type='button'>
          <X className='h-3.5 w-3.5'/>
        </button>
      </div>

      {/* Label */}
      <input
        autoFocus
        className='mb-3 h-9 w-full rounded-[10px] border border-border-subtle bg-surface-base px-3 text-sm font-medium text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
        placeholder='Milestone name'
        value={label}
      />

      {/* Date */}
      <label className='mb-3 block space-y-1'>
        <span className='text-[10px] font-medium text-text-muted'>Date</span>
        <input
          className='h-8 w-full rounded-[10px] border border-border-subtle bg-surface-base px-2 font-mono text-xs text-text-strong outline-none focus:border-primary'
          onChange={(e) => setDate(e.target.value)}
          type='date'
          value={date}
        />
      </label>

      {/* Type */}
      <div className='mb-3'>
        <span className='mb-1 block text-[10px] font-medium text-text-muted'>Type</span>
        <div className='flex gap-1'>
          {milestoneTypes.map((t) => {
            const Icon = t.icon
            return (
              <button
                className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  type === t.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface-base text-text-medium hover:text-text-strong border border-border-subtle'
                }`}
                key={t.key}
                onClick={() => setType(t.key)}
                type='button'
              >
                <Icon className='h-3 w-3'/>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scope */}
      <label className='mb-3 block space-y-1'>
        <span className='text-[10px] font-medium text-text-muted'>Scope</span>
        <select
          className='h-8 w-full rounded-[10px] border border-border-subtle bg-surface-base px-2 text-xs text-text-strong outline-none focus:border-primary'
          onChange={(e) => setLaneId(e.target.value === '__global__' ? null : e.target.value)}
          value={laneId ?? '__global__'}
        >
          <option value='__global__'>Global (all lanes)</option>
          {lanes.map((lane) => (
            <option key={lane.id} value={lane.id}>{lane.title}</option>
          ))}
        </select>
      </label>

      {/* Color */}
      <div className='mb-3 flex gap-1.5'>
        {milestoneColors.map((c) => (
          <button
            className={`h-6 w-6 rounded-full border-2 transition-all ${color === c.key ? 'border-text-strong scale-110' : 'border-transparent hover:scale-105'}`}
            key={c.key}
            onClick={() => setColor(c.key)}
            style={{backgroundColor: c.bg}}
            type='button'
          />
        ))}
      </div>

      {/* Actions */}
      <div className='flex justify-between'>
        {milestone && onDelete ? (
          <button
            className='text-xs text-error hover:underline'
            onClick={() => { onDelete(milestone.id); onClose() }}
            type='button'
          >
            Delete
          </button>
        ) : <div/>}
        <Button onClick={handleSave} variant='ghost'>
          {milestone ? 'Save' : 'Create'}
        </Button>
      </div>
    </div>
  )
}
