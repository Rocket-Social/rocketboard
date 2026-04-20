import {ChevronRight, Plus} from 'lucide-react'
import {useCallback, useMemo, useState} from 'react'

import {Button} from '../../../components/ui/button'
import {useToast} from '../../../components/ui/toast'
import type {RoadmapData, RoadmapViewConfig} from '../plan.types'
import {useCreateRoadmapLaneMutation} from '../plan.queries'
import {MatrixCell} from './MatrixCell'
import {RoadmapLaneActions} from './RoadmapLaneActions'
import {getBucketPeriodKeys, getCalendarPeriodKeys, periodKeyLabel} from './bucketHelpers'

const roadmapBarColors = [
  {bg: '#f5ead4', border: '#e4d5b5', key: 'sand'},
  {bg: '#dcecd6', border: '#c1dbb7', key: 'sage'},
  {bg: '#e6ddf5', border: '#d0c3e8', key: 'lavender'},
  {bg: '#d8eaf8', border: '#b9d6f0', key: 'sky'},
  {bg: '#fae0d0', border: '#f0c8ad', key: 'peach'},
  {bg: '#e2e0de', border: '#ccc9c5', key: 'slate'},
  {bg: '#f5dce0', border: '#e8c4ca', key: 'rose'},
  {bg: '#d3f0ea', border: '#b5e0d7', key: 'mint'},
] as const

function getBarColor(colorKey: string | null) {
  return roadmapBarColors.find((c) => c.key === colorKey) ?? roadmapBarColors[0]
}

type RoadmapMatrixViewProps = {
  addingLane: boolean
  config: RoadmapViewConfig
  data: RoadmapData | null
  isLoading: boolean
  onAddingLaneChange: (adding: boolean) => void
  onConfigChange: (patch: Partial<RoadmapViewConfig>) => void
  planViewId: string
}

export function RoadmapMatrixView({addingLane, config, data, isLoading, onAddingLaneChange, onConfigChange: _onConfigChange, planViewId}: RoadmapMatrixViewProps) {
  const lanes = data?.lanes ?? []
  const cells = data?.cells ?? []
  const {toast} = useToast()
  const createLaneMutation = useCreateRoadmapLaneMutation(planViewId)
  const [newLaneTitle, setNewLaneTitle] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(config.collapsedGroups))

  const periodKeys = useMemo(() => {
    if (config.timeMode === 'bucket') return getBucketPeriodKeys()
    const baseline = new Date()
    baseline.setUTCDate(1)
    const numPeriods = config.timeScale === 'quarter' ? 4 : 6
    return getCalendarPeriodKeys(config.timeScale as 'month' | 'quarter', baseline, numPeriods)
  }, [config.timeMode, config.timeScale])

  const cellMap = useMemo(() => {
    const map = new Map<string, typeof cells[0]>()
    for (const cell of cells) {
      map.set(`${cell.laneId}:${cell.periodKey}`, cell)
    }
    return map
  }, [cells])

  const handleAddLane = useCallback(async () => {
    const title = newLaneTitle.trim()
    if (!title) return
    const colorIndex = lanes.length % roadmapBarColors.length
    try {
      await createLaneMutation.mutateAsync({
        color: roadmapBarColors[colorIndex].key,
        group: null,
        planViewId,
        title,
      })
    } catch {
      toast({title: 'Could not create lane', variant: 'error'})
    }
    setNewLaneTitle('')
    onAddingLaneChange(false)
  }, [newLaneTitle, lanes.length, planViewId, createLaneMutation, toast, onAddingLaneChange])

  if (isLoading) {
    return (
      <div className='p-6'>
        {[1, 2, 3].map((i) => (
          <div className='mb-4 h-20 animate-pulse rounded-2xl bg-border-subtle/30' key={i}/>
        ))}
      </div>
    )
  }

  if (lanes.length === 0) {
    return (
      <div className='flex h-full items-center justify-center'>
        <div className='max-w-sm rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-sm'>
          <h3 className='font-display text-lg font-semibold text-text-strong'>Start building your roadmap</h3>
          <p className='mt-2 text-sm text-text-medium'>Add your first lane to begin organizing what you&apos;re building.</p>
          <Button className='mt-5' onClick={() => onAddingLaneChange(true)} variant='primary'>
            <Plus className='h-4 w-4'/>
            Add first lane
          </Button>
          {addingLane ? (
            <div className='mt-4'>
              <input
                autoFocus
                className='h-10 w-full rounded-[10px] border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
                onChange={(e) => setNewLaneTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddLane()
                  if (e.key === 'Escape') onAddingLaneChange(false)
                }}
                placeholder='Lane name...'
                value={newLaneTitle}
              />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  // Group lanes
  const groups = new Map<string, typeof lanes>()
  const ungrouped: typeof lanes = []
  for (const lane of lanes) {
    if (lane.group) {
      const g = groups.get(lane.group) ?? []
      g.push(lane)
      groups.set(lane.group, g)
    } else {
      ungrouped.push(lane)
    }
  }

  const allGroups = [
    ...(ungrouped.length > 0 ? [{title: '', lanes: ungrouped}] : []),
    ...[...groups.entries()].map(([title, groupLanes]) => ({title, lanes: groupLanes})),
  ]

  return (
    <div className='h-full overflow-auto'>
      <div
        className='min-w-fit'
        style={{display: 'grid', gridTemplateColumns: `240px repeat(${periodKeys.length}, minmax(160px, 1fr))`}}
      >
        {/* Header: corner */}
        <div className='sticky top-0 z-20 border-b border-r border-border-subtle bg-inverse-chrome'/>

        {/* Header: period columns */}
        {periodKeys.map((key) => (
          <div
            className='sticky top-0 z-20 border-b border-r border-border-subtle bg-inverse-chrome px-3 py-2 text-xs font-medium text-text-inverse'
            key={key}
          >
            {periodKeyLabel(key, config.bucketLabels)}
          </div>
        ))}

        {/* Lanes and cells */}
        {allGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.title)
          return (
            <div className='contents' key={group.title || '__ungrouped'}>
              {/* Group header (spans full grid row) */}
              {group.title ? (
                <div style={{gridColumn: `1 / -1`}}>
                  <button
                    className='flex w-full items-center gap-2 bg-surface-muted px-4 py-2 text-left border-b border-border-subtle'
                    onClick={() => {
                      const next = new Set(collapsedGroups)
                      if (next.has(group.title)) next.delete(group.title)
                      else next.add(group.title)
                      setCollapsedGroups(next)
                    }}
                    type='button'
                  >
                    <ChevronRight className={`h-3 w-3 text-text-muted transition-transform ${isCollapsed ? '' : 'rotate-90'}`}/>
                    <span className='font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted'>{group.title}</span>
                    <span className='ml-auto rounded-full bg-canvas-accent px-1.5 py-0.5 font-mono text-[10px] text-text-muted'>{group.lanes.length}</span>
                  </button>
                </div>
              ) : null}

              {/* Lane rows */}
              {!isCollapsed ? group.lanes.map((lane) => {
                const color = getBarColor(lane.color)
                return (
                  <div className='contents' key={lane.id}>
                    {/* Lane label */}
                    <div className='group flex items-center border-b border-r border-border-subtle bg-surface-elevated px-4 py-3'>
                      <div
                        className='mr-3 h-6 w-[3px] shrink-0 rounded-full'
                        style={{backgroundColor: color.border}}
                      />
                      <span className='flex-1 truncate text-sm font-medium text-text-strong'>{lane.title}</span>
                      <RoadmapLaneActions
                        lane={lane}
                        onRenameStart={() => {/* TODO: inline rename in matrix */}}
                        planViewId={planViewId}
                      />
                    </div>

                    {/* Cells */}
                    {periodKeys.map((key) => (
                      <div className='border-b border-r border-border-subtle' key={key}>
                        <MatrixCell
                          cell={cellMap.get(`${lane.id}:${key}`) ?? null}
                          laneColor={color.border}
                          laneId={lane.id}
                          periodKey={key}
                          planViewId={planViewId}
                        />
                      </div>
                    ))}
                  </div>
                )
              }) : null}
            </div>
          )
        })}
      </div>

      {/* Add lane */}
      {addingLane ? (
        <div className='px-4 py-2' style={{maxWidth: 240}}>
          <input
            autoFocus
            className='h-8 w-full rounded-[10px] border border-border-subtle bg-surface-base px-2 text-sm text-text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft'
            onChange={(e) => setNewLaneTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddLane()
              if (e.key === 'Escape') onAddingLaneChange(false)
            }}
            placeholder='New lane...'
            value={newLaneTitle}
          />
        </div>
      ) : null}
    </div>
  )
}
