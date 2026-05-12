import {useVirtualizer} from '@tanstack/react-virtual'
import {ChevronRight, Eye} from 'lucide-react'
import {useCallback, useEffect, useMemo, useRef, useState, type DragEvent} from 'react'

import type {Mode} from '../../../app/mode'
import {Badge} from '../../../components/ui/badge'
import {
  dayOffsetToDateString,
  generateHeaders,
  getDayWidth,
  getNumWeeks,
  getTodayOffset,
} from '../../../lib/timeline'
import {cardDateToDayOffset} from '../../cards/card-date'
import {buildSprintPartitions} from '../../cards/card-view-mappers'
import {
  compareCardsByCreatedAt,
  compareCardsByGroupPosition,
  makeCompareCardsByStatusDisplayOrder,
} from '../../cards/card-display-order'
import type {ProjectMember} from '../../access/access.types'
import type {ProjectPriorityOption, ProjectStatusOption, StatusCategory, TableGroupBy, TaskBoardMode} from '../../cards/card.types'
import type {ProjectGanttTask} from '../../cards/card-view-mappers'
import type {ProjectSprintRecord} from '../../sprints/sprint.types'
import type {ProjectGroupRecord} from '../../projects/project-group.types'
import {GanttTaskRow} from './GanttTaskRow'

// Re-export domain type so existing importers don't break
export type {GanttTimeScale} from '../../projects/project-view.types'
import type {GanttTimeScale} from '../../projects/project-view.types'

// ── Types ──────────────────────────────────────────────────────

type GanttGroup = {
  id: string
  kind?: 'backlog' | 'flat' | 'group' | 'sprint' | 'subgroup'
  level?: 0 | 1
  moveTarget?: {
    groupId?: string | null
    sprintId?: string | null
    statusOptionId?: string | null
  }
  parentGroupId?: string | null
  tasks: ProjectGanttTask[]
  title: string
}

type GanttViewProps = {
  activeTaskId?: string | null
  priorityOptions?: ProjectPriorityOption[]
  dateRange?: {endDate: string; startDate: string} | null
  groupBy?: TableGroupBy
  isInteractionDisabled?: boolean
  isTaskDetailOpen?: boolean
  mode: Mode
  onMoveTask?: (cardId: string, targetPosition: number, targetGroupId?: string | null) => void
  projectSprints?: ProjectSprintRecord[]
  onOpenTask: (taskId: string) => void
  onScheduleTask: (input: {
    cardId: string
    previousDueAt: string | null
    previousStartAt: string | null
    targetDueAt: string | null
    targetStartAt: string | null
  }) => Promise<boolean>
  projectGroups?: ProjectGroupRecord[]
  projectMembers?: ProjectMember[]
  statusOptions?: ProjectStatusOption[]
  taskMode?: TaskBoardMode
  tasks: ProjectGanttTask[]
  timeScale?: GanttTimeScale
}

type VirtualItem =
  | {group: GanttGroup; type: 'group-header'}
  | {group: GanttGroup; task: ProjectGanttTask; type: 'task-row'}

type DragMode = 'move' | 'resize-end' | 'resize-start'

type DragState = {
  mode: DragMode
  originTask: ProjectGanttTask
  pointerStartX: number
  snapshot: ProjectGanttTask[]
}

// ── Constants ──────────────────────────────────────────────────

const ganttBaseline = new Date('2026-03-04T00:00:00Z')
const msPerDay = 24 * 60 * 60 * 1000
const ganttRowEstimateSize = 40

// ── Task positioning helpers ──────────────────────────────────

function applyTaskDays(
  task: ProjectGanttTask,
  baseline: Date,
  startDay: number,
  endDay: number,
): ProjectGanttTask {
  const startWeek = Math.round(startDay / 7)
  const endWeek = Math.round(endDay / 7)
  return {
    ...task,
    card: {
      ...task.card,
      dueAt: dayOffsetToDateString(baseline, endDay),
      startAt: dayOffsetToDateString(baseline, startDay),
    },
    endWeek,
    startWeek,
  }
}

function resolveTaskDayOffsets(task: ProjectGanttTask, baseline: Date) {
  const startDayCandidate = cardDateToDayOffset(task.card.startAt, baseline)
    ?? cardDateToDayOffset(task.card.createdAt, baseline)
    ?? cardDateToDayOffset(task.card.dueAt, baseline)
    ?? (task.startWeek * 7)
  const endDayCandidate = cardDateToDayOffset(task.card.dueAt, baseline)
    ?? cardDateToDayOffset(task.card.startAt, baseline)
    ?? startDayCandidate
    ?? (task.endWeek * 7)

  return {
    completedDay: cardDateToDayOffset(task.card.completedAt, baseline),
    endDay: Math.max(startDayCandidate, endDayCandidate),
    startDay: Math.min(startDayCandidate, endDayCandidate),
  }
}


function moveTaskDays(task: ProjectGanttTask, baseline: Date, deltaDays: number) {
  const {endDay, startDay} = resolveTaskDayOffsets(task, baseline)
  const nextStart = Math.max(0, startDay + deltaDays)
  const nextEnd = Math.max(nextStart, endDay + deltaDays)
  return applyTaskDays(task, baseline, nextStart, nextEnd)
}

function resizeTaskDays(task: ProjectGanttTask, baseline: Date, deltaDays: number, edge: 'end' | 'start') {
  const {endDay, startDay} = resolveTaskDayOffsets(task, baseline)
  if (edge === 'start') {
    const nextStart = Math.min(endDay, Math.max(0, startDay + deltaDays))
    return applyTaskDays(task, baseline, nextStart, endDay)
  }
  const nextEnd = Math.max(startDay, endDay + deltaDays)
  return applyTaskDays(task, baseline, startDay, nextEnd)
}

// ── Grouping ──────────────────────────────────────────────────

function getTimeBucket(task: ProjectGanttTask): string {
  if (task.startWeek <= 0 && task.endWeek <= 0) return 'Past'
  if (task.startWeek <= 1) return 'This Week'
  if (task.startWeek <= 2) return 'Next Week'
  return 'Later'
}

const timeBucketOrder = ['Past', 'This Week', 'Next Week', 'Later']

const statusGroupCategoryOrder: StatusCategory[] = ['started', 'not_started', 'completed']

function getStatusGroupOrder(statusOptions: ProjectStatusOption[]): ProjectStatusOption[] {
  return statusGroupCategoryOrder.flatMap((category) =>
    statusOptions
      .filter((o) => o.category === category)
      .sort((a, b) => a.position - b.position),
  )
}

export function buildGanttGroups(
  tasks: ProjectGanttTask[],
  groupBy: TableGroupBy,
  projectGroups: ProjectGroupRecord[],
  statusOptions: ProjectStatusOption[],
  priorityOptions?: ProjectPriorityOption[],
  projectSprints: ProjectSprintRecord[] = [],
  taskMode: TaskBoardMode = 'standard',
): GanttGroup[] {
  if (taskMode === 'sprint') {
    return buildSprintPartitions(tasks, (task) => task.card.sprintId, projectSprints).flatMap((partition) => {
      const rootTasks = [...partition.items].sort((left, right) => compareCardsByCreatedAt(left.card, right.card))
      const rootGroup: GanttGroup = {
        id: partition.id,
        kind: partition.sprint ? 'sprint' : 'backlog',
        level: 0,
        moveTarget: {sprintId: partition.sprint?.id ?? null},
        tasks: rootTasks,
        title: partition.title,
      }

      const childGroups = groupBy === 'group'
        ? [{
            id: `${partition.id}::__flat`,
            kind: 'flat' as const,
            level: 1 as const,
            moveTarget: {groupId: null, sprintId: partition.sprint?.id ?? null},
            parentGroupId: partition.id,
            tasks: rootTasks,
            title: '',
          }]
        : buildGanttGroups(
            partition.items,
            groupBy,
            projectGroups,
            statusOptions,
            priorityOptions,
            projectSprints,
            'standard',
          ).map((group) => ({
            ...group,
            id: `${partition.id}::${group.id}`,
            kind: group.kind === 'flat' ? 'flat' as const : 'subgroup' as const,
            level: 1 as const,
            moveTarget: {
              ...group.moveTarget,
              sprintId: partition.sprint?.id ?? null,
            },
            parentGroupId: partition.id,
          }))

      return [rootGroup, ...childGroups]
    })
  }

  if (groupBy === 'group') {
    const grouped = new Map<string, ProjectGanttTask[]>()
    const ungrouped: ProjectGanttTask[] = []

    for (const group of projectGroups) {
      grouped.set(group.id, [])
    }

    for (const task of tasks) {
      if (task.card.groupId && grouped.has(task.card.groupId)) {
        grouped.get(task.card.groupId)!.push(task)
      } else {
        ungrouped.push(task)
      }
    }

    const result: GanttGroup[] = []

    if (ungrouped.length > 0 || projectGroups.length === 0) {
      result.push({
        id: '__flat',
        kind: 'flat',
        level: 0,
        moveTarget: {groupId: null},
        tasks: [...ungrouped].sort((left, right) => compareCardsByGroupPosition(left.card, right.card)),
        title: '',
      })
    }

    for (const group of projectGroups) {
      result.push({
        id: group.id,
        kind: 'group',
        level: 0,
        moveTarget: {groupId: group.id},
        tasks: [...(grouped.get(group.id) ?? [])].sort((left, right) => compareCardsByGroupPosition(left.card, right.card)),
        title: group.label,
      })
    }

    return result
  }

  if (groupBy === 'assignee') {
    const grouped = new Map<string, ProjectGanttTask[]>()
    const unassigned: ProjectGanttTask[] = []

    for (const task of tasks) {
      if (task.card.assigneeUserId && task.card.assigneeName) {
        if (!grouped.has(task.card.assigneeUserId)) {
          grouped.set(task.card.assigneeUserId, [])
        }
        grouped.get(task.card.assigneeUserId)!.push(task)
      } else {
        unassigned.push(task)
      }
    }

    const entries = [...grouped.entries()].map(([userId, t]) => ({
      name: t[0].card.assigneeName,
      tasks: t,
      userId,
    }))
    entries.sort((a, b) => a.name.localeCompare(b.name))

    const result: GanttGroup[] = entries.map((e) => ({
      id: e.userId,
      kind: 'group',
      level: 0,
      tasks: [...e.tasks].sort((left, right) => compareCardsByCreatedAt(left.card, right.card)),
      title: e.name,
    }))

    if (unassigned.length > 0) {
      result.push({
        id: 'unassigned',
        kind: 'group',
        level: 0,
        tasks: [...unassigned].sort((left, right) => compareCardsByCreatedAt(left.card, right.card)),
        title: 'Unassigned',
      })
    }

    return result
  }

  if (groupBy === 'priority') {
    const sortedOptions = [...(priorityOptions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    const groups: GanttGroup[] = sortedOptions.map((option) => ({
      id: option.id,
      kind: 'group',
      level: 0,
      tasks: [...tasks.filter((t) => t.card.priorityOptionId === option.id)].sort((left, right) => compareCardsByCreatedAt(left.card, right.card)),
      title: option.label,
    }))
    const noPriorityTasks = tasks.filter((t) => !t.card.priorityOptionId)
    if (noPriorityTasks.length > 0) {
      groups.push({
        id: '__no_priority',
        kind: 'group',
        level: 0,
        tasks: [...noPriorityTasks].sort((left, right) => compareCardsByCreatedAt(left.card, right.card)),
        title: '—',
      })
    }
    return groups
  }

  if (groupBy === 'due_date') {
    const buckets = new Map<string, ProjectGanttTask[]>()
    for (const bucket of timeBucketOrder) {
      buckets.set(bucket, [])
    }
    for (const task of tasks) {
      const bucket = getTimeBucket(task)
      buckets.get(bucket)!.push(task)
    }
    return timeBucketOrder.map((bucket) => ({
      id: bucket.toLowerCase().replace(/\s+/g, '-'),
      kind: 'group',
      level: 0,
      tasks: [...(buckets.get(bucket) ?? [])].sort((left, right) => compareCardsByCreatedAt(left.card, right.card)),
      title: bucket,
    }))
  }

  const orderedOptions = getStatusGroupOrder(statusOptions)
  const compareByStatus = makeCompareCardsByStatusDisplayOrder(statusOptions)

  const result: GanttGroup[] = orderedOptions.map((option) => ({
    id: option.id,
    kind: 'group',
    level: 0,
    moveTarget: {statusOptionId: option.id},
    tasks: [...tasks.filter((t) => t.card.statusOptionId === option.id)].sort((left, right) => compareByStatus(left.card, right.card)),
    title: option.label,
  }))

  const noStatusTasks = tasks.filter((t) => !t.card.statusOptionId)
  if (noStatusTasks.length > 0) {
    result.unshift({
      id: '__no_status',
      kind: 'group',
      level: 0,
      moveTarget: {statusOptionId: null},
      tasks: [...noStatusTasks].sort((left, right) => compareCardsByCreatedAt(left.card, right.card)),
      title: '—',
    })
  }

  return result
}

// ── Component ─────────────────────────────────────────────────

export function GanttView({
  activeTaskId = null,
  priorityOptions,
  dateRange = null,
  groupBy = 'status',
  isInteractionDisabled = false,
  isTaskDetailOpen = false,
  mode,
  onMoveTask,
  onOpenTask,
  onScheduleTask,
  projectGroups = [],
  projectMembers = [],
  projectSprints = [],
  statusOptions = [],
  taskMode = 'standard',
  tasks,
  timeScale = 'week',
}: GanttViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [optimisticTasks, setOptimisticTasks] = useState(tasks)
  const dragStateRef = useRef<DragState | null>(null)
  const optimisticTasksRef = useRef(tasks)

  // Task reorder drag state (for the Tasks column)
  const [reorderDragId, setReorderDragId] = useState<string | null>(null)
  const [reorderOverId, setReorderOverId] = useState<string | null>(null)

  // Measure the timeline container to compute responsive dayWidth
  const [containerWidth, setContainerWidth] = useState(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const timelineRef = useCallback((node: HTMLDivElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
      resizeObserverRef.current = null
    }
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    observer.observe(node)
    resizeObserverRef.current = observer
  }, [])

  // Compute effective baseline and numWeeks from dateRange
  const effectiveBaseline = useMemo(() => {
    if (dateRange) {
      const [y, m, d] = dateRange.startDate.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d))
    }
    return ganttBaseline
  }, [dateRange])

  const numWeeks = useMemo(() => {
    if (dateRange) {
      const [sy, sm, sd] = dateRange.startDate.split('-').map(Number)
      const [ey, em, ed] = dateRange.endDate.split('-').map(Number)
      const start = new Date(Date.UTC(sy, sm - 1, sd))
      const end = new Date(Date.UTC(ey, em - 1, ed))
      const days = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1
      return Math.max(1, Math.ceil(days / 7))
    }
    return getNumWeeks(timeScale)
  }, [dateRange, timeScale])

  const totalDays = numWeeks * 7
  const baseDayWidth = getDayWidth(timeScale)
  const sidebarWidth = 256
  const availableWidth = containerWidth > sidebarWidth ? containerWidth - sidebarWidth : 0
  // Stretch day cells to fill the viewport only when the natural timeline
  // (totalDays × baseDayWidth) actually fits. If the content already overflows
  // at base width we must keep the base and let the horizontal scroll container
  // take over — stretching past the available viewport lets the timeline keep
  // growing on every remeasure (an ancestor flex/grid that sizes to content
  // feeds back into containerWidth), which manifests as the day-scale header
  // collapsing into a single oversized cell that "grows forever."
  const naturalTotalWidth = totalDays * baseDayWidth
  const dayWidth = availableWidth > 0 && naturalTotalWidth <= availableWidth
    ? Math.max(baseDayWidth, Math.floor(availableWidth / totalDays))
    : baseDayWidth
  const totalWidth = totalDays * dayWidth

  const {bottomRow, topRow} = useMemo(
    () => generateHeaders(timeScale, numWeeks, dayWidth, effectiveBaseline),
    [timeScale, numWeeks, dayWidth, effectiveBaseline],
  )

  const todayOffset = useMemo(() => getTodayOffset(dayWidth, effectiveBaseline), [dayWidth, effectiveBaseline])

  useEffect(() => {
    setOptimisticTasks(tasks)
  }, [tasks])

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    optimisticTasksRef.current = optimisticTasks
  }, [optimisticTasks])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const currentDragState = dragStateRef.current

      if (!currentDragState) {
        return
      }

      const deltaDays = Math.round((event.clientX - currentDragState.pointerStartX) / dayWidth)

      setOptimisticTasks((current) =>
        current.map((task) => {
          if (task.id !== currentDragState.originTask.id) {
            return task
          }

          if (currentDragState.mode === 'move') {
            return moveTaskDays(currentDragState.originTask, effectiveBaseline, deltaDays)
          }

          return resizeTaskDays(
            currentDragState.originTask,
            effectiveBaseline,
            deltaDays,
            currentDragState.mode === 'resize-start' ? 'start' : 'end',
          )
        }),
      )
    }

    const handlePointerUp = () => {
      const currentDragState = dragStateRef.current

      if (!currentDragState) {
        return
      }

      dragStateRef.current = null

      const latestTask = optimisticTasksRef.current.find((task) => task.id === currentDragState.originTask.id)
      const changed =
        latestTask
        && (
          latestTask.card.startAt !== currentDragState.originTask.card.startAt
          || latestTask.card.dueAt !== currentDragState.originTask.card.dueAt
        )

      const finalize = async () => {
        if (!latestTask || !changed) {
          setOptimisticTasks(currentDragState.snapshot)
          setDragState(null)
          return
        }

        const succeeded = await onScheduleTask({
          cardId: latestTask.id,
          previousDueAt: currentDragState.originTask.card.dueAt,
          previousStartAt: currentDragState.originTask.card.startAt,
          targetDueAt: latestTask.card.dueAt,
          targetStartAt: latestTask.card.startAt,
        })

        if (!succeeded) {
          setOptimisticTasks(currentDragState.snapshot)
        }

        setDragState(null)
      }

      void finalize()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, {once: true})

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, onScheduleTask, dayWidth, effectiveBaseline])

  const ganttGroups = useMemo(
    () => buildGanttGroups(optimisticTasks, groupBy, projectGroups, statusOptions, priorityOptions, projectSprints, taskMode),
    [optimisticTasks, groupBy, projectGroups, statusOptions, priorityOptions, projectSprints, taskMode],
  )

  // Flatten groups into a virtual list
  const flatItems = useMemo<VirtualItem[]>(() => {
    const items: VirtualItem[] = []
    for (const group of ganttGroups) {
      const isFlat = group.kind === 'flat'
      const isRootSprintGroup = taskMode === 'sprint' && (group.kind === 'sprint' || group.kind === 'backlog')
      const parentExpanded = !group.parentGroupId || !collapsedGroups.has(group.parentGroupId)
      if (!parentExpanded) {
        continue
      }
      if (!isFlat || isRootSprintGroup) {
        items.push({group, type: 'group-header'})
      }
      const isExpanded = !collapsedGroups.has(group.id)
      if ((isFlat || isExpanded) && !isRootSprintGroup) {
        for (const task of group.tasks) {
          items.push({group, task, type: 'task-row'})
        }
      }
    }
    return items
  }, [ganttGroups, collapsedGroups, taskMode])

  // Scroll container for virtualization
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    estimateSize: () => ganttRowEstimateSize,
    getScrollElement: () => scrollContainerRef.current,
    overscan: 10,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const rowsToRender = virtualRows.length > 0
    ? virtualRows
    : flatItems.map((_, index) => ({
        index,
        size: ganttRowEstimateSize,
        start: index * ganttRowEstimateSize,
      }))

  // Horizontal column culling state
  const [visibleColRange, setVisibleColRange] = useState<{end: number; start: number}>({end: bottomRow.length, start: 0})

  const handleTimelineScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el || bottomRow.length === 0) return

    // The scroll container scrolls horizontally; the sticky left panel is 256px
    const scrollLeft = el.scrollLeft
    const viewportWidth = el.clientWidth - sidebarWidth
    const buffer = 2

    // Determine which columns are visible based on cumulative widths
    let cumWidth = 0
    let startCol = 0
    let endCol = bottomRow.length

    for (let i = 0; i < bottomRow.length; i++) {
      if (cumWidth + bottomRow[i].width > scrollLeft) {
        startCol = Math.max(0, i - buffer)
        break
      }
      cumWidth += bottomRow[i].width
    }

    cumWidth = 0
    for (let i = 0; i < bottomRow.length; i++) {
      cumWidth += bottomRow[i].width
      if (cumWidth >= scrollLeft + viewportWidth) {
        endCol = Math.min(bottomRow.length, i + 1 + buffer)
        break
      }
    }

    setVisibleColRange((prev) => {
      if (prev.start === startCol && prev.end === endCol) return prev
      return {end: endCol, start: startCol}
    })
  }, [bottomRow, sidebarWidth])

  // Update visible columns on scroll
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    // Initial calculation
    handleTimelineScroll()
    el.addEventListener('scroll', handleTimelineScroll, {passive: true})
    return () => el.removeEventListener('scroll', handleTimelineScroll)
  }, [handleTimelineScroll])

  // Compute the left offset for the first visible column (for positioning)
  const visibleColLeftOffset = useMemo(() => {
    let offset = 0
    for (let i = 0; i < visibleColRange.start; i++) {
      offset += bottomRow[i].width
    }
    return offset
  }, [bottomRow, visibleColRange.start])

  const visibleBottomRow = useMemo(
    () => bottomRow.slice(visibleColRange.start, visibleColRange.end),
    [bottomRow, visibleColRange.start, visibleColRange.end],
  )

  const openTaskFromBar = useCallback((taskId: string, allowWhenClosed: boolean) => {
    if (!allowWhenClosed && !isTaskDetailOpen) {
      return
    }

    if (isTaskDetailOpen && activeTaskId === taskId) {
      return
    }

    onOpenTask(taskId)
  }, [activeTaskId, isTaskDetailOpen, onOpenTask])

  const handleReorderDragEnd = useCallback(() => {
    setReorderDragId(null)
    setReorderOverId(null)
  }, [])

  const handleStartMove = useCallback((task: ProjectGanttTask, clientX: number) => {
    setDragState({
      mode: 'move',
      originTask: task,
      pointerStartX: clientX,
      snapshot: optimisticTasksRef.current,
    })
  }, [])

  const handleResizeStart = useCallback((task: ProjectGanttTask, clientX: number) => {
    setDragState({
      mode: 'resize-start',
      originTask: task,
      pointerStartX: clientX,
      snapshot: optimisticTasksRef.current,
    })
  }, [])

  const handleResizeEnd = useCallback((task: ProjectGanttTask, clientX: number) => {
    setDragState({
      mode: 'resize-end',
      originTask: task,
      pointerStartX: clientX,
      snapshot: optimisticTasksRef.current,
    })
  }, [])

  return (
    <div className='overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated shadow-panel' ref={timelineRef}>
      <div className='max-h-[calc(100vh-280px)] overflow-auto' ref={scrollContainerRef}>
      {/* Timeline header */}
      <div className='sticky top-0 z-20 flex border-b border-border-subtle'>
        <div className='sticky left-0 z-30 w-64 shrink-0 border-r border-border-subtle bg-surface-muted p-3'>
          <div className='flex items-center justify-between'>
            <span className='font-mono text-xs font-medium uppercase tracking-wider text-text-muted'>Tasks</span>
            <Eye className='h-3.5 w-3.5 text-text-muted' />
          </div>
        </div>

        <div className='flex-1'>
          {/* Top header row (months / quarters) */}
          <div className='flex border-b border-border-subtle'>
            {topRow.map((cell) => (
              <div
                className='shrink-0 border-r border-border-subtle px-2 py-1 text-center'
                key={cell.key}
                style={{width: cell.width}}
              >
                <div className='truncate text-xs font-medium text-text-strong'>{cell.label}</div>
              </div>
            ))}
          </div>
          {/* Bottom header row (days / weeks / months) */}
          <div className='flex'>
            {bottomRow.map((cell) => (
              <div
                className={`shrink-0 border-r border-border-subtle px-1 py-1 text-center ${cell.isWeekend ? 'bg-surface-muted' : ''}`}
                key={cell.key}
                style={{width: cell.width}}
              >
                <div className={`truncate font-medium ${timeScale === 'day' ? 'text-[10px]' : 'text-xs'} ${cell.isWeekend ? 'text-text-muted' : 'text-text-strong'}`}>{cell.label}</div>
                {cell.sublabel ? (
                  <div className='truncate font-mono text-[10px] text-text-muted'>{cell.sublabel}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Virtualized task rows */}
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {rowsToRender.map((virtualRow) => {
          const item = flatItems[virtualRow.index]

          if (item.type === 'group-header') {
            const {group} = item
            const isExpanded = !collapsedGroups.has(group.id)

            return (
              <div
                key={`header-${group.id}`}
                style={{
                  height: virtualRow.size,
                  left: 0,
                  position: 'absolute',
                  top: virtualRow.start,
                  width: '100%',
                }}
              >
                <div className='flex border-b border-border-subtle' style={{height: '100%'}}>
                  <div className='sticky left-0 z-10 w-64 shrink-0 border-r border-border-subtle bg-surface-base p-2'>
                    <button
                      className='flex items-center gap-2'
                      onClick={() => setCollapsedGroups((prev) => {
                        const next = new Set(prev)
                        if (next.has(group.id)) {
                          next.delete(group.id)
                        } else {
                          next.add(group.id)
                        }
                        return next
                      })}
                      type='button'
                    >
                      <ChevronRight className={`h-4 w-4 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <span className={group.parentGroupId ? 'pl-4 text-xs uppercase tracking-wide text-text-muted' : 'text-sm font-medium text-text-strong'}>
                        {group.title}
                      </span>
                      <Badge variant='count'>{group.tasks.length}</Badge>
                    </button>
                  </div>
                  <div className='flex-1' />
                </div>
              </div>
            )
          }

          const {group, task} = item
          const isActiveTask = isTaskDetailOpen && activeTaskId === task.id
          const isDraggingThisTask = dragState?.originTask.id === task.id

          return (
            <div
              key={`task-${task.id}`}
              style={{
                height: virtualRow.size,
                left: 0,
                position: 'absolute',
                top: virtualRow.start,
                width: '100%',
              }}
            >
              <GanttTaskRow
                bottomRow={visibleBottomRow}
                dayWidth={dayWidth}
                effectiveBaseline={effectiveBaseline}
                groupBy={groupBy}
                groupId={group.id}
                isActiveTask={isActiveTask}
                isDraggingThisTask={isDraggingThisTask ?? false}
                isInteractionDisabled={isInteractionDisabled}
                isReorderDrag={reorderDragId === task.id}
                isReorderOver={reorderOverId === task.id}
                mode={mode}
                onDragEnd={handleReorderDragEnd}
                onDragLeave={() => { if (reorderOverId === task.id) setReorderOverId(null) }}
                onDragOver={(e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault()
                  if (reorderDragId && reorderDragId !== task.id) {
                    setReorderOverId(task.id)
                  }
                }}
                onDragStart={(e: DragEvent<HTMLDivElement>) => {
                  setReorderDragId(task.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDrop={(e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault()
                  if (reorderDragId && reorderDragId !== task.id && onMoveTask) {
                    onMoveTask(
                      reorderDragId,
                      groupBy === 'group' ? task.card.groupPosition : task.card.statusPosition,
                      groupBy === 'group' ? task.card.groupId : undefined,
                    )
                  }
                  setReorderDragId(null)
                  setReorderOverId(null)
                }}
                onMoveTask={onMoveTask}
                onOpenTask={onOpenTask}
                onResizeEnd={handleResizeEnd}
                onResizeStart={handleResizeStart}
                onStartMove={handleStartMove}
                openTaskFromBar={openTaskFromBar}
                projectMembers={projectMembers}
                statusOptions={statusOptions}
                task={task}
                timeScale={timeScale}
                todayOffset={todayOffset}
                totalDays={totalDays}
                totalWidth={totalWidth}
                visibleColLeftOffset={visibleColLeftOffset}
              />
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
