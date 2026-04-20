import {DndContext, closestCenter, type DragEndEvent} from '@dnd-kit/core'
import {SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {GripVertical, LayoutGrid, List, Lock, Plus} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import type {Mode} from '../../app/mode'
import {Button} from '../../components/ui/button'
import {useSessionQuery} from '../auth/session.queries'
import {DistributionBar, type DistributionSegment} from '../shell/views/DistributionBar'
import {
  useCreateInitiativeMutation,
  useReorderInitiativeMutation,
  workspaceInitiativeSparklineQueryOptions,
  workspaceInitiativeSummariesQueryOptions,
  workspaceInitiativesQueryOptions,
} from './initiative.queries'
import type {InitiativeHealth, InitiativeRecord, InitiativeSparklinePoint, InitiativeSummary} from './initiative.types'
import {CreateInitiativeDialog} from './CreateInitiativeDialog'
import {HealthPopover} from './components/HealthPopover'
import {InitiativeSparkline} from './components/InitiativeSparkline'
import {StatusPopover} from './components/StatusPopover'

// ─── Types ──────────────────────────────────────────────────────

type InitiativesListPageProps = {
  mode?: Mode
  onNavigateToDetail: (initiativeId: string) => void
  workspaceId: string
  workspaceName: string
}

type FilterType = 'active' | 'all' | 'attention' | 'my'
type DensityMode = 'grid' | 'table'

// ─── Pure Logic (exported for testing) ──────────────────────────

export function formatRelativeTargetDate(dateStr: string | null): {label: string; overdue: boolean} | null {
  if (!dateStr) return null
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffMs = target.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return {label: 'Due today', overdue: false}
  if (diffDays > 0) return {label: `${diffDays}d left`, overdue: false}
  return {label: `${Math.abs(diffDays)}d overdue`, overdue: true}
}

export function filterInitiatives(
  initiatives: InitiativeRecord[],
  filter: FilterType,
  currentUserId: string | undefined,
): InitiativeRecord[] {
  switch (filter) {
    case 'all':
      return initiatives
    case 'active':
      return initiatives.filter((i) => i.status === 'active' || i.status === 'planned')
    case 'my':
      return currentUserId
        ? initiatives.filter((i) => i.leadUserId === currentUserId)
        : initiatives
    case 'attention':
      return initiatives.filter((i) => i.health === 'at_risk' || i.health === 'off_track')
  }
}

export function sortForNeedsAttention(initiatives: InitiativeRecord[]): InitiativeRecord[] {
  return [...initiatives].sort((a, b) => {
    const healthOrder: Record<InitiativeHealth, number> = {off_track: 0, at_risk: 1, on_track: 2}
    const healthDiff = healthOrder[a.health] - healthOrder[b.health]
    if (healthDiff !== 0) return healthDiff
    // Within same health: most overdue first (earliest target_date), nulls last
    if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate)
    if (a.targetDate) return -1
    if (b.targetDate) return 1
    return 0
  })
}

export function computeHealthSummary(initiatives: InitiativeRecord[]) {
  let onTrack = 0
  let atRisk = 0
  let offTrack = 0
  for (const i of initiatives) {
    if (i.health === 'on_track') onTrack++
    else if (i.health === 'at_risk') atRisk++
    else if (i.health === 'off_track') offTrack++
  }
  return {atRisk, offTrack, onTrack}
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 30) return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

// ─── Progress Bar ───────────────────────────────────────────────

function ProgressBar({summary}: {summary: InitiativeSummary | undefined}) {
  if (!summary || summary.totalCards === 0) {
    return <div className='h-5 w-full rounded-[3px] bg-border-subtle/30'/>
  }
  const segments: DistributionSegment[] = [
    {color: 'var(--color-success)', count: summary.cardsCompleted, key: 'completed', label: 'Completed'},
    {color: 'var(--color-secondary)', count: summary.cardsStarted, key: 'started', label: 'In Progress'},
    {color: 'var(--color-border-subtle)', count: summary.cardsNotStarted, key: 'not_started', label: 'Not Started'},
  ]
  return <DistributionBar segments={segments} total={summary.totalCards}/>
}

// ─── Initiative Card ────────────────────────────────────────────

function InitiativeCard({
  dragEnabled,
  initiative,
  onNavigate,
  sparklinePoints,
  summary,
}: {
  dragEnabled?: boolean
  initiative: InitiativeRecord
  onNavigate: () => void
  sparklinePoints?: InitiativeSparklinePoint[]
  summary: InitiativeSummary | undefined
}) {
  const target = formatRelativeTargetDate(initiative.targetDate)
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
    id: initiative.id,
    disabled: !dragEnabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      className='group rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-panel transition-all duration-[180ms] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:bg-canvas-accent hover:shadow-md'
      ref={setNodeRef}
      style={style}
    >
      {/* Top row: Drag handle + Name + Status + Lead */}
      <div className='mb-1.5 flex items-center gap-2'>
        {dragEnabled ? (
          <button
            className='shrink-0 cursor-grab text-text-muted opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 active:cursor-grabbing'
            type='button'
            {...attributes}
            {...listeners}
          >
            <GripVertical className='h-4 w-4'/>
          </button>
        ) : null}
        <button
          className='min-w-0 flex-1 truncate text-left text-sm font-medium text-text-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          onClick={onNavigate}
          type='button'
        >
          {initiative.visibility === 'private' ? <Lock className='mr-1 inline h-3 w-3 text-text-muted' aria-label='Private initiative'/> : null}
          {initiative.name}
        </button>
        <StatusPopover initiativeId={initiative.id} status={initiative.status}/>
        {initiative.leadName ? (
          <span
            className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary'
            title={initiative.leadName}
          >
            {initiative.leadName.charAt(0).toUpperCase()}
          </span>
        ) : null}
      </div>

      {/* Health chip */}
      <div className='mb-2'>
        <HealthPopover health={initiative.health} initiativeId={initiative.id}/>
      </div>

      {/* Latest update or description */}
      {initiative.latestUpdateText ? (
        <p className='mb-2 truncate text-xs text-text-medium italic'>
          &ldquo;{initiative.latestUpdateText}&rdquo;
          {initiative.latestUpdateAt ? (
            <span className='ml-1 not-italic text-text-muted'>
              {formatRelativeTime(initiative.latestUpdateAt)}
            </span>
          ) : null}
        </p>
      ) : initiative.description ? (
        <p className='mb-2 truncate text-xs text-text-muted'>{initiative.description}</p>
      ) : null}

      {/* Progress bar */}
      <div className='mb-2'>
        <ProgressBar summary={summary}/>
      </div>

      {/* Sparkline (hover reveal in grid mode) */}
      {sparklinePoints && sparklinePoints.length > 1 && sparklinePoints.some((p) => p.totalScope > 0) ? (
        <div className='mb-1 h-0 overflow-hidden opacity-0 transition-all duration-[180ms] group-hover:h-6 group-hover:opacity-100'>
          <InitiativeSparkline className='h-6 w-full' points={sparklinePoints}/>
        </div>
      ) : null}

      {/* Metadata row */}
      <div className='flex flex-wrap items-center gap-1 font-mono text-[10px] text-text-muted'>
        <span>{summary ? `${summary.cardsCompleted}/${summary.totalCards} done` : '—'}</span>
        {summary && summary.cardsCompletedThisWeek > 0 ? (
          <>
            <span>·</span>
            <span className='text-success'>+{summary.cardsCompletedThisWeek} this week</span>
          </>
        ) : null}
        {summary && summary.projectCount > 0 ? (
          <>
            <span>·</span>
            <span>{summary.projectCount} {summary.projectCount === 1 ? 'project' : 'projects'}</span>
          </>
        ) : null}
        {target ? (
          <>
            <span>·</span>
            <span className={target.overdue ? 'font-medium text-error' : ''}>
              {target.label}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Table Row (compact density) ────────────────────────────────

function InitiativeTableRow({
  dragEnabled,
  initiative,
  onNavigate,
  sparklinePoints,
  summary,
}: {
  dragEnabled?: boolean
  initiative: InitiativeRecord
  onNavigate: () => void
  sparklinePoints?: InitiativeSparklinePoint[]
  summary: InitiativeSummary | undefined
}) {
  const target = formatRelativeTargetDate(initiative.targetDate)
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
    id: initiative.id,
    disabled: !dragEnabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      className='group flex items-center gap-3 border-b border-border-subtle px-4 py-3 transition-colors hover:bg-canvas-accent last:border-b-0'
      ref={setNodeRef}
      style={style}
    >
      {dragEnabled ? (
        <button
          className='shrink-0 cursor-grab text-text-muted opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 active:cursor-grabbing'
          type='button'
          {...attributes}
          {...listeners}
        >
          <GripVertical className='h-3.5 w-3.5'/>
        </button>
      ) : null}
      <HealthPopover health={initiative.health} initiativeId={initiative.id}/>
      <button
        className='min-w-0 flex-1 truncate text-left text-sm font-medium text-text-strong hover:underline'
        onClick={onNavigate}
        type='button'
      >
        {initiative.name}
      </button>
      <StatusPopover initiativeId={initiative.id} status={initiative.status}/>
      <span className='w-14 shrink-0 text-right font-mono text-xs text-text-muted'>
        {summary ? `${summary.cardsCompleted}/${summary.totalCards}` : '—'}
      </span>
      <span className={`w-16 shrink-0 text-right font-mono text-xs ${target?.overdue ? 'font-medium text-error' : 'text-text-muted'}`}>
        {target ? target.label : '—'}
      </span>
      {initiative.leadName ? (
        <span
          className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary'
          title={initiative.leadName}
        >
          {initiative.leadName.charAt(0).toUpperCase()}
        </span>
      ) : <span className='w-6 shrink-0'/>}
      {sparklinePoints && sparklinePoints.length > 1 && sparklinePoints.some((p) => p.totalScope > 0) ? (
        <div className='w-16 shrink-0'>
          <InitiativeSparkline className='h-5 w-full' points={sparklinePoints}/>
        </div>
      ) : <span className='w-16 shrink-0'/>}
    </div>
  )
}

// ─── Filter Bar ─────────────────────────────────────────────────

const filterConfigs: {key: FilterType; label: string}[] = [
  {key: 'active', label: 'Active & Planned'},
  {key: 'my', label: 'My Initiatives'},
  {key: 'all', label: 'All'},
  {key: 'attention', label: 'Needs Attention'},
]

function FilterBar({
  counts,
  filter,
  onFilterChange,
}: {
  counts: Record<FilterType, number>
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
}) {
  return (
    <div className='mb-4 flex gap-2 overflow-x-auto' role='tablist'>
      {filterConfigs.map((config) => (
        <button
          aria-selected={filter === config.key}
          className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
            filter === config.key
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border-subtle text-text-muted hover:text-text-medium'
          }`}
          key={config.key}
          onClick={() => onFilterChange(config.key)}
          role='tab'
          type='button'
        >
          {config.label} ({counts[config.key]})
        </button>
      ))}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────

export function InitiativesListPage({
  onNavigateToDetail,
  workspaceId,
  workspaceName,
}: InitiativesListPageProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [filter, setFilter] = useState<FilterType>('active')
  const [density, setDensity] = useState<DensityMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('initiatives-density') as DensityMode) || 'grid'
    }
    return 'grid'
  })
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const handleDensityChange = useCallback((mode: DensityMode) => {
    setDensity(mode)
    localStorage.setItem('initiatives-density', mode)
  }, [])

  const sessionQuery = useSessionQuery()
  const currentUserId = sessionQuery.data?.status === 'authenticated' ? sessionQuery.data.user.id : undefined

  const initiativesQuery = useQuery(workspaceInitiativesQueryOptions(workspaceId))
  const summariesQuery = useQuery(workspaceInitiativeSummariesQueryOptions(workspaceId))
  const sparklineQuery = useQuery(workspaceInitiativeSparklineQueryOptions(workspaceId))
  const createMutation = useCreateInitiativeMutation()
  const reorderMutation = useReorderInitiativeMutation()
  const queryClient = useQueryClient()

  const initiatives = initiativesQuery.data ?? []
  const summaries = summariesQuery.data ?? []

  const summaryMap = useMemo(() => {
    const map = new Map<string, InitiativeSummary>()
    for (const s of summaries) map.set(s.initiativeId, s)
    return map
  }, [summaries])

  const sparklineMap = useMemo(() => {
    const sparklines = sparklineQuery.data ?? []
    const map = new Map<string, InitiativeSparklinePoint[]>()
    for (const p of sparklines) {
      const existing = map.get(p.initiativeId) ?? []
      existing.push(p)
      map.set(p.initiativeId, existing)
    }
    return map
  }, [sparklineQuery.data])

  // Filter counts (computed on the full list)
  const filterCounts = useMemo((): Record<FilterType, number> => ({
    active: filterInitiatives(initiatives, 'active', currentUserId).length,
    all: initiatives.length,
    attention: filterInitiatives(initiatives, 'attention', currentUserId).length,
    my: filterInitiatives(initiatives, 'my', currentUserId).length,
  }), [initiatives, currentUserId])

  // Filtered + sorted list
  const filteredInitiatives = useMemo(() => {
    const filtered = filterInitiatives(initiatives, filter, currentUserId)
    if (filter === 'attention') return sortForNeedsAttention(filtered)
    return filtered
  }, [initiatives, filter, currentUserId])

  // Health summary for header (from ALL active initiatives, not filtered)
  const healthSummary = useMemo(
    () => computeHealthSummary(initiatives.filter((i) => i.status === 'active' || i.status === 'planned')),
    [initiatives],
  )

  // Drag-to-reorder: enabled only on All or Active & Planned (not Needs Attention which has its own sort)
  const dragEnabled = filter === 'all' || filter === 'active'

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const {active, over} = event
    if (!over || active.id === over.id) return

    const oldIndex = filteredInitiatives.findIndex((i) => i.id === active.id)
    const newIndex = filteredInitiatives.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic reorder in cache
    const reordered = [...filteredInitiatives]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    queryClient.setQueriesData(
      {predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'workspace-initiatives' && q.queryKey.length === 2},
      (old: InitiativeRecord[] | undefined) => {
        if (!old) return old
        const updated = [...old]
        const movedItem = updated.find((i) => i.id === active.id)
        if (!movedItem) return old
        const targetItem = updated.find((i) => i.id === over.id)
        if (!targetItem) return old
        movedItem.position = targetItem.position
        return updated.sort((a, b) => a.position - b.position)
      },
    )

    const targetPosition = filteredInitiatives[newIndex].position
    reorderMutation.mutate({initiativeId: active.id as string, newPosition: targetPosition})
  }, [filteredInitiatives, queryClient, reorderMutation])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      // Don't handle if a popover is open (Radix manages its own keys)
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return

      const cardCount = filteredInitiatives.length
      if (cardCount === 0) return

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = focusedIndex < cardCount - 1 ? focusedIndex + 1 : 0
        setFocusedIndex(next)
        cardRefs.current[next]?.querySelector<HTMLButtonElement>('button')?.focus()
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = focusedIndex > 0 ? focusedIndex - 1 : cardCount - 1
        setFocusedIndex(prev)
        cardRefs.current[prev]?.querySelector<HTMLButtonElement>('button')?.focus()
      } else if (e.key === 'n') {
        e.preventDefault()
        setShowCreateDialog(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [focusedIndex, filteredInitiatives.length])

  // Workspace has any initiatives at all?
  const workspaceHasInitiatives = initiatives.length > 0

  // Loading state
  if (initiativesQuery.isLoading) {
    return (
      <div className='mx-auto max-w-5xl px-6 py-8'>
        <div className='mb-6 flex items-center justify-between'>
          <div>
            <div className='h-6 w-32 animate-pulse rounded bg-border-subtle/30'/>
            <div className='mt-2 h-4 w-48 animate-pulse rounded bg-border-subtle/30'/>
          </div>
          <div className='h-9 w-36 animate-pulse rounded-sm bg-border-subtle/30'/>
        </div>
        <div className='mb-4 flex gap-2'>
          {[1, 2, 3, 4].map((i) => (
            <div className='h-9 w-28 animate-pulse rounded-full bg-border-subtle/30' key={i}/>
          ))}
        </div>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          {[1, 2, 3, 4].map((i) => (
            <div className='h-44 animate-pulse rounded-2xl bg-border-subtle/30' key={i}/>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (initiativesQuery.isError) {
    return (
      <div className='mx-auto max-w-5xl px-6 py-8'>
        <div className='rounded-2xl border border-dashed border-border-subtle px-6 py-16 text-center'>
          <p className='text-sm text-error'>Couldn&apos;t load initiatives</p>
          <Button
            className='mt-4'
            onClick={() => void initiativesQuery.refetch()}
            variant='secondary'
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='mx-auto max-w-5xl px-6 py-8'>
      {/* Header */}
      <div className='mb-6 flex items-center justify-between'>
        <div>
          <h1 className='font-display text-xl font-semibold text-text-strong'>Initiatives</h1>
          <p className='mt-1 text-sm text-text-muted'>
            <span className='inline-flex items-center gap-1'>
              <span className='inline-block h-2 w-2 rounded-full bg-success'/>
              {healthSummary.onTrack} on track
            </span>
            {healthSummary.atRisk > 0 ? (
              <span className='inline-flex items-center gap-1'>
                <span className='ml-1'>·</span>
                <span className='inline-block h-2 w-2 rounded-full bg-warning'/>
                {healthSummary.atRisk} at risk
              </span>
            ) : null}
            {healthSummary.offTrack > 0 ? (
              <span className='inline-flex items-center gap-1'>
                <span className='ml-1'>·</span>
                <span className='inline-block h-2 w-2 rounded-full bg-error'/>
                {healthSummary.offTrack} off track
              </span>
            ) : null}
            <span className='ml-1'>across {workspaceName}</span>
          </p>
        </div>
        <div className='hidden items-center gap-1 rounded-full bg-canvas-accent p-1 md:inline-flex' role='radiogroup'>
          <button
            aria-checked={density === 'grid'}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${density === 'grid' ? 'bg-surface-elevated text-text-strong shadow-panel' : 'text-text-muted hover:text-text-strong'}`}
            onClick={() => handleDensityChange('grid')}
            role='radio'
            type='button'
          >
            <LayoutGrid className='h-3.5 w-3.5'/>
          </button>
          <button
            aria-checked={density === 'table'}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${density === 'table' ? 'bg-surface-elevated text-text-strong shadow-panel' : 'text-text-muted hover:text-text-strong'}`}
            onClick={() => handleDensityChange('table')}
            role='radio'
            type='button'
          >
            <List className='h-3.5 w-3.5'/>
          </button>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} variant='primary'>
          <Plus className='h-4 w-4'/>
          New Initiative
        </Button>
      </div>

      {/* Filter bar */}
      <FilterBar counts={filterCounts} filter={filter} onFilterChange={setFilter}/>

      {/* Card grid or table */}
      {filteredInitiatives.length > 0 ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredInitiatives.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {density === 'grid' ? (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                {filteredInitiatives.map((initiative, index) => (
                  <div
                    key={initiative.id}
                    ref={(el) => { cardRefs.current[index] = el }}
                  >
                    <InitiativeCard
                      dragEnabled={dragEnabled}
                      initiative={initiative}
                      onNavigate={() => onNavigateToDetail(initiative.id)}
                      sparklinePoints={sparklineMap.get(initiative.id)}
                      summary={summaryMap.get(initiative.id)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className='overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated shadow-panel'>
                {filteredInitiatives.map((initiative, index) => (
                  <div
                    key={initiative.id}
                    ref={(el) => { cardRefs.current[index] = el }}
                  >
                    <InitiativeTableRow
                      dragEnabled={dragEnabled}
                      initiative={initiative}
                      onNavigate={() => onNavigateToDetail(initiative.id)}
                      sparklinePoints={sparklineMap.get(initiative.id)}
                      summary={summaryMap.get(initiative.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>
      ) : (
        <EmptyState
          filter={filter}
          onCreateClick={() => setShowCreateDialog(true)}
          onViewAllClick={() => setFilter('all')}
          workspaceHasInitiatives={workspaceHasInitiatives}
          workspaceInitiativeCount={initiatives.length}
        />
      )}

      {showCreateDialog ? (
        <CreateInitiativeDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={async (input) => {
            await createMutation.mutateAsync({...input, workspaceId})
            setShowCreateDialog(false)
          }}
        />
      ) : null}
    </div>
  )
}

// ─── Empty States ───────────────────────────────────────────────

function EmptyState({
  filter,
  onCreateClick,
  onViewAllClick,
  workspaceHasInitiatives,
  workspaceInitiativeCount,
}: {
  filter: FilterType
  onCreateClick: () => void
  onViewAllClick: () => void
  workspaceHasInitiatives: boolean
  workspaceInitiativeCount: number
}) {
  // No initiatives in the workspace at all
  if (!workspaceHasInitiatives) {
    return (
      <div className='rounded-2xl border border-dashed border-border-subtle px-6 py-16 text-center'>
        <div className='mx-auto mb-4 flex items-center justify-center gap-2 text-text-muted'>
          <span className='h-2 w-2 rounded-full bg-border-subtle'/>
          <span className='h-px w-6 bg-border-subtle'/>
          <span className='h-2 w-2 rounded-full bg-border-subtle'/>
          <span className='h-px w-6 bg-border-subtle'/>
          <span className='h-2 w-2 rounded-full bg-border-subtle'/>
        </div>
        <h3 className='font-display text-base font-semibold text-text-strong'>
          Track your biggest bets across projects
        </h3>
        <p className='mx-auto mt-2 max-w-sm text-sm text-text-muted'>
          Initiatives group tasks from multiple projects into one view with health tracking and status updates.
        </p>
        <Button className='mt-5' onClick={onCreateClick} variant='primary'>
          Create First Initiative
        </Button>
      </div>
    )
  }

  // "My Initiatives" is empty but workspace has initiatives
  if (filter === 'my') {
    return (
      <div className='rounded-2xl border border-dashed border-border-subtle px-6 py-16 text-center'>
        <h3 className='font-display text-base font-semibold text-text-strong'>
          You&apos;re not leading any initiatives yet
        </h3>
        <p className='mx-auto mt-2 max-w-sm text-sm text-text-muted'>
          Your workspace has {workspaceInitiativeCount} initiative{workspaceInitiativeCount === 1 ? '' : 's'}.
        </p>
        <div className='mt-5 flex items-center justify-center gap-3'>
          <Button onClick={onCreateClick} variant='primary'>
            Create Initiative
          </Button>
          <button
            className='text-sm text-primary hover:underline'
            onClick={onViewAllClick}
            type='button'
          >
            View all →
          </button>
        </div>
      </div>
    )
  }

  // Other filter with no results
  return (
    <div className='rounded-2xl border border-dashed border-border-subtle px-6 py-12 text-center'>
      <p className='text-sm text-text-muted'>No initiatives match this filter.</p>
    </div>
  )
}
