import {ChevronRight, Plus, X} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {useToast} from '../../../components/ui/toast'
import {
  dateToDayOffset,
  dayOffsetToDateString,
  generateHeaders,
  getDayWidth,
  getNumWeeks,
  getTodayOffset,
  type TimeScale,
} from '../../../lib/timeline'
import type {RoadmapData, RoadmapItem, RoadmapLane, RoadmapViewConfig} from '../plan.types'
import {
  useCreateRoadmapItemMutation,
  useCreateRoadmapLaneMutation,
  useCreateRoadmapMilestoneMutation,
  useDeleteRoadmapItemMutation,
  useDeleteRoadmapMilestoneMutation,
  useUpdateRoadmapItemMutation,
  useUpdateRoadmapLaneMutation,
  useUpdateRoadmapMilestoneMutation,
} from '../plan.queries'
import {RoadmapLaneActions} from './RoadmapLaneActions'
import {RoadmapMilestonePopover} from './RoadmapMilestonePopover'

// ── Constants ────────────────────────────────────────────────

const laneColumnWidth = 240
const barHeight = 32
const barGap = 4
const lanePadding = 8

// Bar color palette (warm pastels per PRD)
const roadmapBarColors = [
  {bg: '#f5ead4', border: '#e4d5b5', key: 'sand', text: '#8b6914'},
  {bg: '#dcecd6', border: '#c1dbb7', key: 'sage', text: '#3d7a28'},
  {bg: '#e6ddf5', border: '#d0c3e8', key: 'lavender', text: '#6b4fb0'},
  {bg: '#d8eaf8', border: '#b9d6f0', key: 'sky', text: '#2f6faa'},
  {bg: '#fae0d0', border: '#f0c8ad', key: 'peach', text: '#b05a24'},
  {bg: '#e2e0de', border: '#ccc9c5', key: 'slate', text: '#5a5753'},
  {bg: '#f5dce0', border: '#e8c4ca', key: 'rose', text: '#a13d55'},
  {bg: '#d3f0ea', border: '#b5e0d7', key: 'mint', text: '#1a7a62'},
] as const

function getBarColor(colorKey: string | null) {
  return roadmapBarColors.find((c) => c.key === colorKey) ?? roadmapBarColors[0]
}

// ── Layout helpers ───────────────────────────────────────────

type StackedItem = RoadmapItem & {subRow: number}

function computeOverlapStacking(items: RoadmapItem[], baseline: Date): StackedItem[] {
  if (items.length === 0) return []

  const sorted = [...items].sort((a, b) => a.startPeriod.localeCompare(b.startPeriod))
  const result: StackedItem[] = []
  const subRowEnds: number[] = []

  for (const item of sorted) {
    const start = dateToDayOffset(item.startPeriod, baseline) ?? 0
    const end = dateToDayOffset(item.endPeriod, baseline) ?? start

    let assignedRow = -1
    for (let r = 0; r < subRowEnds.length; r++) {
      if (subRowEnds[r] < start) {
        assignedRow = r
        break
      }
    }

    if (assignedRow === -1) {
      assignedRow = subRowEnds.length
      subRowEnds.push(end)
    } else {
      subRowEnds[assignedRow] = end
    }

    result.push({...item, subRow: assignedRow})
  }

  return result
}

function getLaneHeight(subRowCount: number): number {
  if (subRowCount === 0) return barHeight + lanePadding * 2
  return subRowCount * (barHeight + barGap) - barGap + lanePadding * 2
}

type LaneGroup = {
  collapsed: boolean
  lanes: RoadmapLane[]
  title: string
}

function groupLanes(lanes: RoadmapLane[]): LaneGroup[] {
  const groups = new Map<string, RoadmapLane[]>()
  const ungrouped: RoadmapLane[] = []

  for (const lane of lanes) {
    if (lane.group) {
      const existing = groups.get(lane.group) ?? []
      existing.push(lane)
      groups.set(lane.group, existing)
    } else {
      ungrouped.push(lane)
    }
  }

  const result: LaneGroup[] = []
  if (ungrouped.length > 0) {
    result.push({collapsed: false, lanes: ungrouped, title: ''})
  }
  for (const [title, groupLanes] of groups) {
    result.push({collapsed: false, lanes: groupLanes, title})
  }
  return result
}

// ── Drag types ──────────────────────────────────────────────

type DragMode = 'create' | 'move' | 'resize-end' | 'resize-start'

type DragState = {
  createLaneId?: string
  mode: DragMode
  originItem?: RoadmapItem
  pointerStartX: number
  startDayOffset: number
}

// ── Bar Edit Popover ────────────────────────────────────────

type BarEditPopoverProps = {
  item: RoadmapItem
  onClose: () => void
  onDelete: (itemId: string) => void
  onUpdate: (input: {color?: string; endPeriod?: string; itemId: string; label?: string; startPeriod?: string}) => void
}

function BarEditPopover({item, onClose, onDelete, onUpdate}: BarEditPopoverProps) {
  const [label, setLabel] = useState(item.label)
  const [startDate, setStartDate] = useState(item.startPeriod)
  const [endDate, setEndDate] = useState(item.endPeriod)

  const handleSave = () => {
    if (!label.trim()) return
    const changes: Record<string, string> = {itemId: item.id}
    if (label !== item.label) changes.label = label
    if (startDate !== item.startPeriod) changes.startPeriod = startDate
    if (endDate !== item.endPeriod) changes.endPeriod = endDate
    onUpdate(changes as {itemId: string} & Partial<{color: string; endPeriod: string; label: string; startPeriod: string}>)
    onClose()
  }

  return (
    <div
      className='absolute z-50 w-80 rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-md'
      onClick={(e) => e.stopPropagation()}
    >
      <div className='mb-3 flex items-center justify-between'>
        <span className='text-xs font-medium text-text-muted'>Edit item</span>
        <button className='rounded-lg p-1 text-text-muted hover:bg-canvas-accent hover:text-text-strong' onClick={onClose} type='button'>
          <X className='h-3.5 w-3.5'/>
        </button>
      </div>
      <input
        autoFocus
        className='mb-3 h-9 w-full rounded-[10px] border border-border-subtle bg-surface-base px-3 text-sm font-medium text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
        placeholder='Item name'
        value={label}
      />
      <div className='mb-3 flex gap-2'>
        <label className='flex-1 space-y-1'>
          <span className='text-[10px] font-medium text-text-muted'>Start</span>
          <input
            className='h-8 w-full rounded-lg border border-border-subtle bg-surface-base px-2 font-mono text-xs text-text-strong outline-none focus:border-primary'
            onChange={(e) => setStartDate(e.target.value)}
            type='date'
            value={startDate}
          />
        </label>
        <label className='flex-1 space-y-1'>
          <span className='text-[10px] font-medium text-text-muted'>End</span>
          <input
            className='h-8 w-full rounded-lg border border-border-subtle bg-surface-base px-2 font-mono text-xs text-text-strong outline-none focus:border-primary'
            onChange={(e) => setEndDate(e.target.value)}
            type='date'
            value={endDate}
          />
        </label>
      </div>
      {/* Color swatches */}
      <div className='mb-3 flex gap-1.5'>
        {roadmapBarColors.map((c) => (
          <button
            className={`h-7 w-7 rounded-full border-2 transition-all ${item.color === c.key ? 'border-primary scale-110' : 'border-transparent hover:scale-105'}`}
            key={c.key}
            onClick={() => onUpdate({color: c.key, itemId: item.id})}
            style={{backgroundColor: c.bg}}
            type='button'
          />
        ))}
      </div>
      <div className='flex justify-between'>
        <button
          className='text-xs text-error hover:underline'
          onClick={() => { onDelete(item.id); onClose() }}
          type='button'
        >
          Delete
        </button>
        <Button onClick={handleSave} variant='ghost'>Done</Button>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────

type RoadmapTimelineViewProps = {
  addingLane: boolean
  config: RoadmapViewConfig
  data: RoadmapData | null
  isLoading: boolean
  onAddingLaneChange: (adding: boolean) => void
  onAddingMilestoneChange: (adding: boolean) => void
  onConfigChange: (patch: Partial<RoadmapViewConfig>) => void
  planViewId: string
  showAddMilestone: boolean
}

export function RoadmapTimelineView({addingLane, config, data, isLoading, onAddingLaneChange, onAddingMilestoneChange, onConfigChange, planViewId, showAddMilestone}: RoadmapTimelineViewProps) {
  const timeScale = config.timeScale as TimeScale
  const collapsedGroups = useMemo(() => new Set(config.collapsedGroups), [config.collapsedGroups])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [newLaneTitle, setNewLaneTitle] = useState('')
  const [renamingLaneId, setRenamingLaneId] = useState<string | null>(null)
  const [renamingLaneValue, setRenamingLaneValue] = useState('')
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null)
  const [inlineRenameValue, setInlineRenameValue] = useState('')
  const [ghostBar, setGhostBar] = useState<{left: number; laneId: string; width: number} | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const {toast} = useToast()

  const createLaneMutation = useCreateRoadmapLaneMutation(planViewId)
  const updateLaneMutation = useUpdateRoadmapLaneMutation(planViewId)
  const createItemMutation = useCreateRoadmapItemMutation(planViewId)
  const updateItemMutation = useUpdateRoadmapItemMutation(planViewId)
  const deleteItemMutation = useDeleteRoadmapItemMutation(planViewId)
  const createMilestoneMutation = useCreateRoadmapMilestoneMutation(planViewId)
  const updateMilestoneMutation = useUpdateRoadmapMilestoneMutation(planViewId)
  const deleteMilestoneMutation = useDeleteRoadmapMilestoneMutation(planViewId)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)

  const handleLaneRename = useCallback(async (laneId: string) => {
    const value = renamingLaneValue.trim()
    if (!value) { setRenamingLaneId(null); return }
    try {
      await updateLaneMutation.mutateAsync({laneId, title: value})
    } catch {
      toast({title: 'Could not rename lane', variant: 'error'})
    }
    setRenamingLaneId(null)
  }, [renamingLaneValue, updateLaneMutation, toast])

  const now = useMemo(() => new Date(), [])
  const baseline = useMemo(() => {
    const d = new Date(now)
    d.setUTCMonth(d.getUTCMonth() - 1)
    d.setUTCDate(1)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  }, [now])

  const dayWidth = getDayWidth(timeScale)
  const numWeeks = getNumWeeks(timeScale)
  const totalDays = numWeeks * 7
  const totalWidth = totalDays * dayWidth
  const headers = useMemo(() => generateHeaders(timeScale, numWeeks, dayWidth, baseline), [timeScale, numWeeks, dayWidth, baseline])
  const todayOffset = useMemo(() => getTodayOffset(dayWidth, baseline), [dayWidth, baseline])

  const lanes = data?.lanes ?? []
  const items = data?.items ?? []
  const milestones = data?.milestones ?? []

  const laneGroups = useMemo(() => {
    const groups = groupLanes(lanes)
    return groups.map((g) => ({...g, collapsed: collapsedGroups.has(g.title)}))
  }, [lanes, collapsedGroups])

  const itemsByLane = useMemo(() => {
    const map = new Map<string, StackedItem[]>()
    for (const lane of lanes) {
      const laneItems = items.filter((i) => i.laneId === lane.id)
      map.set(lane.id, computeOverlapStacking(laneItems, baseline))
    }
    return map
  }, [items, lanes, baseline])

  const toggleGroup = useCallback((title: string) => {
    const next = new Set(collapsedGroups)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    onConfigChange({collapsedGroups: [...next]})
  }, [collapsedGroups, onConfigChange])

  const newLaneTitleRef = useRef('')
  const syncLaneTitle = (value: string) => {
    setNewLaneTitle(value)
    newLaneTitleRef.current = value
  }

  const handleAddLane = useCallback(async (group: string | null) => {
    const title = newLaneTitleRef.current.trim()
    if (!title) return
    const colorIndex = lanes.length % roadmapBarColors.length
    await createLaneMutation.mutateAsync({
      color: roadmapBarColors[colorIndex].key,
      group,
      planViewId,
      title,
    })
    syncLaneTitle('')
    onAddingLaneChange(false)
  }, [lanes.length, planViewId, createLaneMutation, onAddingLaneChange])

  // ── Drag handlers ──────────────────────────────────────────

  const handleBarPointerDown = useCallback((e: React.PointerEvent, item: RoadmapItem, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    const state: DragState = {
      mode,
      originItem: item,
      pointerStartX: e.clientX,
      startDayOffset: dateToDayOffset(item.startPeriod, baseline) ?? 0,
    }
    dragStateRef.current = state
    setDragState(state)
    setSelectedItemId(item.id)
  }, [baseline])

  const handleLanePointerDown = useCallback((e: React.PointerEvent, laneId: string) => {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)
    const startDayOffset = Math.floor(offsetX / dayWidth)
    const state: DragState = {
      createLaneId: laneId,
      mode: 'create',
      pointerStartX: e.clientX,
      startDayOffset,
    }
    dragStateRef.current = state
    setDragState(state)
    setGhostBar({left: startDayOffset * dayWidth, laneId, width: dayWidth})
  }, [dayWidth])

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (e: PointerEvent) => {
      const current = dragStateRef.current
      if (!current) return

      if (current.mode === 'create' && current.createLaneId) {
        const deltaDays = Math.round((e.clientX - current.pointerStartX) / dayWidth)
        const endDayOffset = Math.max(current.startDayOffset, current.startDayOffset + deltaDays)
        const startDayOffset = Math.min(current.startDayOffset, current.startDayOffset + deltaDays)
        setGhostBar({
          left: startDayOffset * dayWidth,
          laneId: current.createLaneId,
          width: Math.max((endDayOffset - startDayOffset + 1) * dayWidth, dayWidth),
        })
      }
    }

    const handlePointerUp = async (e: Event) => {
      const pointerEvent = e as PointerEvent
      const current = dragStateRef.current
      dragStateRef.current = null
      setDragState(null)

      if (!current) return

      if (current.mode === 'create' && current.createLaneId) {
        const deltaDays = Math.round((pointerEvent.clientX - current.pointerStartX) / dayWidth)
        const rawEnd = current.startDayOffset + deltaDays
        const startDay = Math.min(current.startDayOffset, rawEnd)
        const endDay = Math.max(current.startDayOffset, rawEnd)
        const startStr = dayOffsetToDateString(baseline, startDay)
        const endStr = dayOffsetToDateString(baseline, endDay)
        setGhostBar(null)

        const colorIndex = items.length % roadmapBarColors.length
        try {
          await createItemMutation.mutateAsync({
            color: roadmapBarColors[colorIndex].key,
            endPeriod: endStr,
            laneId: current.createLaneId,
            label: 'New item',
            startPeriod: startStr,
          })
        } catch {
          toast({title: 'Could not create item', variant: 'error'})
        }
        return
      }

      if ((current.mode === 'move' || current.mode === 'resize-start' || current.mode === 'resize-end') && current.originItem) {
        const deltaDays = Math.round((pointerEvent.clientX - current.pointerStartX) / dayWidth)
        if (deltaDays === 0) return

        const origStart = dateToDayOffset(current.originItem.startPeriod, baseline) ?? 0
        const origEnd = dateToDayOffset(current.originItem.endPeriod, baseline) ?? origStart

        let newStart = origStart
        let newEnd = origEnd

        if (current.mode === 'move') {
          newStart = origStart + deltaDays
          newEnd = origEnd + deltaDays
        } else if (current.mode === 'resize-start') {
          newStart = Math.min(origEnd, origStart + deltaDays)
        } else {
          newEnd = Math.max(origStart, origEnd + deltaDays)
        }

        try {
          await updateItemMutation.mutateAsync({
            endPeriod: dayOffsetToDateString(baseline, newEnd),
            itemId: current.originItem.id,
            startPeriod: dayOffsetToDateString(baseline, newStart),
          })
        } catch {
          toast({title: 'Could not move item. Try again.', variant: 'error'})
        }
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp , {once: true})
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp )
    }
  }, [dragState, dayWidth, baseline, items.length, createItemMutation, updateItemMutation, toast])

  const handleInlineRename = useCallback(async (itemId: string) => {
    if (!inlineRenameValue.trim()) {
      setInlineRenameId(null)
      return
    }
    try {
      await updateItemMutation.mutateAsync({itemId, label: inlineRenameValue.trim()})
    } catch {
      toast({title: 'Could not rename item', variant: 'error'})
    }
    setInlineRenameId(null)
  }, [inlineRenameValue, updateItemMutation, toast])

  const handleDeleteItem = useCallback(async (itemId: string) => {
    try {
      await deleteItemMutation.mutateAsync(itemId)
      setSelectedItemId(null)
      setEditingItemId(null)
    } catch {
      toast({title: 'Could not delete item', variant: 'error'})
    }
  }, [deleteItemMutation, toast])

  const handleUpdateItem = useCallback(async (input: {color?: string; endPeriod?: string; itemId: string; label?: string; startPeriod?: string}) => {
    try {
      await updateItemMutation.mutateAsync(input)
    } catch {
      toast({title: 'Could not update item', variant: 'error'})
    }
  }, [updateItemMutation, toast])

  // ── Loading state ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className='flex h-full'>
        <div className='w-60 shrink-0 border-r border-border-subtle p-4'>
          {[1, 2, 3, 4].map((i) => (
            <div className='mb-3 h-4 w-32 animate-pulse rounded bg-border-subtle/30' key={i}/>
          ))}
        </div>
        <div className='flex-1 p-4'>
          {[1, 2, 3].map((i) => (
            <div className='mb-4 h-10 animate-pulse rounded-lg bg-border-subtle/30' key={i}/>
          ))}
        </div>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────

  if (lanes.length === 0) {
    return (
      <div className='flex h-full'>
        {/* Faded headers for spatial context */}
        <div className='flex-1 overflow-hidden opacity-30'>
          <div className='flex'>
            <div className='w-60 shrink-0'/>
            <div className='flex'>
              {headers.topRow.map((cell) => (
                <div className='border-b border-r border-border-subtle bg-inverse-chrome px-3 py-1.5 text-xs font-medium text-text-inverse' key={cell.key} style={{width: cell.width}}>
                  {cell.label}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='max-w-sm rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-sm'>
            <h3 className='font-display text-lg font-semibold text-text-strong'>Start building your roadmap</h3>
            <p className='mt-2 text-sm text-text-medium'>Add your first lane to begin plotting what you&apos;re building and when.</p>
            <Button className='mt-5' onClick={() => onAddingLaneChange(true)} variant='primary'>
              <Plus className='h-4 w-4'/>
              Add first lane
            </Button>
            {addingLane ? (
              <div className='mt-4'>
                <input
                  autoFocus
                  className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
                  onChange={(e) => syncLaneTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAddLane(null)
                    if (e.key === 'Escape') onAddingLaneChange(false)
                  }}
                  placeholder='Lane name...'
                  value={newLaneTitle}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────

  return (
    <div className='flex h-full overflow-hidden'>
        {/* Lane labels (sticky left) */}
        <div className='w-60 shrink-0 overflow-y-auto border-r border-border-subtle bg-surface-elevated'>
          {/* Header spacer */}
          <div className='h-[52px] border-b border-border-subtle'/>

          {laneGroups.map((group) => (
            <div key={group.title || '__ungrouped'}>
              {/* Group header */}
              {group.title ? (
                <button
                  className='flex w-full items-center gap-2 bg-surface-muted px-4 py-2 text-left'
                  onClick={() => toggleGroup(group.title)}
                  type='button'
                >
                  <ChevronRight className={`h-3 w-3 text-text-muted transition-transform ${group.collapsed ? '' : 'rotate-90'}`}/>
                  <span className='font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted'>{group.title}</span>
                  <span className='ml-auto rounded-full bg-canvas-accent px-1.5 py-0.5 font-mono text-[10px] text-text-muted'>{group.lanes.length}</span>
                </button>
              ) : null}

              {/* Lane labels */}
              {!group.collapsed ? group.lanes.map((lane) => {
                const laneItems = itemsByLane.get(lane.id) ?? []
                const maxSubRow = laneItems.reduce((max, item) => Math.max(max, item.subRow), -1)
                const height = getLaneHeight(maxSubRow + 1)

                return (
                  <div
                    className='group flex items-center border-b border-border-subtle px-4'
                    key={lane.id}
                    style={{height}}
                  >
                    <div
                      className='mr-3 h-full w-[3px] shrink-0 rounded-full'
                      style={{backgroundColor: getBarColor(lane.color).border}}
                    />
                    {renamingLaneId === lane.id ? (
                      <input
                        autoFocus
                        className='h-7 flex-1 rounded-[10px] border border-border-subtle bg-surface-base px-2 text-sm font-medium text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
                        onBlur={() => void handleLaneRename(lane.id)}
                        onChange={(e) => setRenamingLaneValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleLaneRename(lane.id)
                          if (e.key === 'Escape') setRenamingLaneId(null)
                        }}
                        value={renamingLaneValue}
                      />
                    ) : (
                      <span className='flex-1 truncate text-sm font-medium text-text-strong'>{lane.title}</span>
                    )}
                    <RoadmapLaneActions
                      lane={lane}
                      onRenameStart={(id) => { setRenamingLaneId(id); setRenamingLaneValue(lane.title) }}
                      planViewId={planViewId}
                    />
                  </div>
                )
              }) : null}
            </div>
          ))}

          {/* Add lane inline */}
          {addingLane ? (
            <div className='px-4 py-2'>
              <input
                autoFocus
                className='h-8 w-full rounded-[10px] border border-border-subtle bg-surface-base px-2 text-sm text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(e) => syncLaneTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddLane(null)
                  if (e.key === 'Escape') onAddingLaneChange(false)
                }}
                placeholder='New lane...'
                value={newLaneTitle}
              />
            </div>
          ) : null}
        </div>

        {/* Scrollable timeline */}
        <div className='flex-1 overflow-auto' ref={scrollRef}>
          <div style={{minWidth: totalWidth}}>
            {/* Header rows */}
            <div className='sticky top-0 z-20'>
              {/* Top row (quarters/months) */}
              <div className='flex'>
                {headers.topRow.map((cell) => (
                  <div
                    className='border-b border-r border-border-subtle bg-inverse-chrome px-3 py-1 text-xs font-medium text-text-inverse'
                    key={cell.key}
                    style={{width: cell.width}}
                  >
                    {cell.label}
                  </div>
                ))}
              </div>
              {/* Bottom row (months/weeks) */}
              <div className='flex'>
                {headers.bottomRow.map((cell) => (
                  <div
                    className='border-b border-r border-border-subtle bg-inverse-chrome/90 px-2 py-1 text-[10px] font-medium text-text-inverse-muted'
                    key={cell.key}
                    style={{width: cell.width}}
                  >
                    {cell.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Lane rows */}
            {laneGroups.map((group) => (
              <div key={group.title || '__ungrouped'}>
                {/* Group header spacer */}
                {group.title ? (
                  <div className='h-[33px] border-b border-border-subtle bg-surface-muted'/>
                ) : null}

                {!group.collapsed ? group.lanes.map((lane) => {
                  const laneItems = itemsByLane.get(lane.id) ?? []
                  const maxSubRow = laneItems.reduce((max, item) => Math.max(max, item.subRow), -1)
                  const height = getLaneHeight(maxSubRow + 1)

                  return (
                    <div
                      className='relative border-b border-border-subtle cursor-crosshair'
                      key={lane.id}
                      onClick={() => { setSelectedItemId(null); setEditingItemId(null) }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('[data-bar]')) return
                        handleLanePointerDown(e, lane.id)
                      }}
                      style={{height}}
                    >
                      {/* Vertical grid lines */}
                      {headers.bottomRow.map((cell) => {
                        let left = 0
                        for (const c of headers.bottomRow) {
                          if (c.key === cell.key) break
                          left += c.width
                        }
                        return (
                          <div
                            className='absolute top-0 h-full border-r border-border-subtle/30'
                            key={cell.key}
                            style={{left}}
                          />
                        )
                      })}

                      {/* Today marker */}
                      {config.showTodayMarker && todayOffset != null && todayOffset < totalWidth ? (
                        <div
                          className='absolute top-0 h-full border-l border-dashed border-error/40 pointer-events-none'
                          style={{left: todayOffset}}
                        />
                      ) : null}

                      {/* Ghost bar during click-drag create */}
                      {ghostBar && ghostBar.laneId === lane.id ? (
                        <div
                          className='absolute rounded-lg border border-dashed border-primary/40 bg-primary/10 pointer-events-none'
                          style={{
                            height: barHeight,
                            left: ghostBar.left,
                            top: lanePadding,
                            width: ghostBar.width,
                          }}
                        />
                      ) : null}

                      {/* Bars */}
                      {laneItems.map((item) => {
                        const startDay = dateToDayOffset(item.startPeriod, baseline) ?? 0
                        const endDay = dateToDayOffset(item.endPeriod, baseline) ?? startDay
                        const barLeft = startDay * dayWidth
                        const barWidth = Math.max((endDay - startDay + 1) * dayWidth, 40)
                        const barTop = lanePadding + item.subRow * (barHeight + barGap)
                        const color = getBarColor(item.color)
                        const isSelected = selectedItemId === item.id
                        const isEditing = editingItemId === item.id
                        const isRenaming = inlineRenameId === item.id

                        return (
                          <div data-bar key={item.id} style={{position: 'absolute', left: barLeft, top: barTop}}>
                            <div
                              className={`group/bar relative flex items-center rounded-[10px] border text-xs font-medium transition-shadow focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:outline-none ${
                                isSelected ? 'ring-2 ring-primary/40 ring-offset-2 cursor-grab' : 'hover:shadow-sm cursor-grab'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedItemId(item.id)
                                setEditingItemId(item.id)
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                setInlineRenameId(item.id)
                                setInlineRenameValue(item.label)
                              }}
                              onPointerDown={(e) => handleBarPointerDown(e, item, 'move')}
                              style={{
                                backgroundColor: color.bg,
                                borderColor: color.border,
                                color: color.text,
                                height: barHeight,
                                width: barWidth,
                              }}
                            >
                              {/* Resize handle: left */}
                              {isSelected ? (
                                <div
                                  className='absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-lg bg-white/30'
                                  onPointerDown={(e) => handleBarPointerDown(e, item, 'resize-start')}
                                />
                              ) : null}

                              {/* Label or inline rename */}
                              <div className='flex-1 truncate px-3'>
                                {isRenaming ? (
                                  <input
                                    autoFocus
                                    className='w-full bg-transparent text-xs font-medium outline-none'
                                    onBlur={() => void handleInlineRename(item.id)}
                                    onChange={(e) => setInlineRenameValue(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') void handleInlineRename(item.id)
                                      if (e.key === 'Escape') setInlineRenameId(null)
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    value={inlineRenameValue}
                                  />
                                ) : (
                                  <span className='truncate'>{barWidth >= 80 ? item.label : ''}</span>
                                )}
                              </div>

                              {/* Resize handle: right */}
                              {isSelected ? (
                                <div
                                  className='absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-lg bg-white/30'
                                  onPointerDown={(e) => handleBarPointerDown(e, item, 'resize-end')}
                                />
                              ) : null}
                            </div>

                            {/* Edit popover */}
                            {isEditing && !isRenaming ? (
                              <div className='absolute left-0 top-full mt-2'>
                                <BarEditPopover
                                  item={item}
                                  onClose={() => setEditingItemId(null)}
                                  onDelete={handleDeleteItem}
                                  onUpdate={handleUpdateItem}
                                />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}

                      {/* Coach mark for empty lanes */}
                      {laneItems.length === 0 && !ghostBar ? (
                        <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
                          <span className='rounded-lg border border-dashed border-border-subtle px-4 py-2 text-xs text-text-muted'>
                            Click and drag to add an item
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )
                }) : null}
              </div>
            ))}
          </div>

          {/* Today marker triangle in header */}
          {config.showTodayMarker && todayOffset != null && todayOffset < totalWidth ? (
            <div
              className='absolute top-0 z-30 pointer-events-none'
              style={{left: todayOffset + laneColumnWidth - 6}}
            >
              <div
                style={{
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '8px solid #a13d34',
                  height: 0,
                  width: 0,
                }}
              />
            </div>
          ) : null}

          {/* Global milestones */}
          {config.showMilestones && milestones.filter((m) => !m.laneId).map((milestone) => {
            const dayOffset = dateToDayOffset(milestone.milestoneDate, baseline)
            if (dayOffset == null) return null
            const left = dayOffset * dayWidth

            return (
              <div
                className='absolute z-10'
                key={milestone.id}
                style={{left, top: 52}}
              >
                <div className='h-full border-l border-dashed border-warning/40 pointer-events-none'/>
                <button
                  className='absolute -left-[7px] -top-[7px] h-[14px] w-[14px] rotate-45 border-2 border-warning bg-surface-elevated hover:scale-125 transition-transform cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-soft focus-visible:outline-none'
                  onClick={(e) => { e.stopPropagation(); setEditingMilestoneId(milestone.id) }}
                  title={milestone.label}
                  type='button'
                />
                {editingMilestoneId === milestone.id ? (
                  <div className='absolute left-4 top-0'>
                    <RoadmapMilestonePopover
                      lanes={lanes}
                      milestone={milestone}
                      onClose={() => setEditingMilestoneId(null)}
                      onDelete={async (id) => {
                        try { await deleteMilestoneMutation.mutateAsync(id) }
                        catch { toast({title: 'Could not delete milestone', variant: 'error'}) }
                        setEditingMilestoneId(null)
                      }}
                      onSave={async (data) => {
                        try { await updateMilestoneMutation.mutateAsync({...data, milestoneId: milestone.id}) }
                        catch { toast({title: 'Could not update milestone', variant: 'error'}) }
                      }}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}

          {/* Create milestone popover (from toolbar) */}
          {showAddMilestone ? (
            <div className='absolute left-1/3 top-16 z-50'>
              <RoadmapMilestonePopover
                lanes={lanes}
                onClose={() => onAddingMilestoneChange(false)}
                onSave={async (data) => {
                  try { await createMilestoneMutation.mutateAsync({...data, planViewId}) }
                  catch { toast({title: 'Could not create milestone', variant: 'error'}) }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
  )
}
