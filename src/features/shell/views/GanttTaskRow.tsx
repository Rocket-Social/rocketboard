import {Check, ChevronRight, GripVertical} from 'lucide-react'
import {memo, type DragEvent} from 'react'

import type {Mode} from '../../../app/mode'
import {UserAvatar} from '../../../components/ui/user-avatar'
import type {ProjectMember} from '../../access/access.types'
import type {ProjectStatusOption, TableGroupBy} from '../../cards/card.types'
import type {ProjectGanttTask} from '../../cards/card-view-mappers'
import {getStatusOptionCategory} from '../../cards/card-view-mappers'
import {statusCategoryColor} from '../theme'

// ── Timeline layout helper (duplicated to avoid circular dep) ────

function resolveTaskDayOffsets(task: ProjectGanttTask, baseline: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  function cardDateToDayOffsetLocal(dateStr: string | null | undefined, base: Date) {
    if (!dateStr) return null
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return Math.round((dt.getTime() - base.getTime()) / msPerDay)
  }
  const startDayCandidate = cardDateToDayOffsetLocal(task.card.startAt, baseline)
    ?? cardDateToDayOffsetLocal(task.card.createdAt, baseline)
    ?? cardDateToDayOffsetLocal(task.card.dueAt, baseline)
    ?? (task.startWeek * 7)
  const endDayCandidate = cardDateToDayOffsetLocal(task.card.dueAt, baseline)
    ?? cardDateToDayOffsetLocal(task.card.startAt, baseline)
    ?? startDayCandidate
    ?? (task.endWeek * 7)

  return {
    completedDay: cardDateToDayOffsetLocal(task.card.completedAt, baseline),
    endDay: Math.max(startDayCandidate, endDayCandidate),
    startDay: Math.min(startDayCandidate, endDayCandidate),
  }
}

function getTaskTimelineLayout(
  task: ProjectGanttTask,
  baseline: Date,
  dayWidth: number,
  totalDays: number,
) {
  const {completedDay, endDay, startDay} = resolveTaskDayOffsets(task, baseline)
  const doneMarkerSize = 12

  // Clamp to the picked date range so a task that spills past the visible
  // timeline doesn't balloon the row's scroll width past the header's last
  // day. Without this, picking "This Week" still showed task bars extending
  // into the following week, and the horizontal scroll stopped at the task
  // bar's true end (not the picked range's last day) — making it impossible
  // to reach Fr 17 / Sa 18 in the header when an out-of-range task bar
  // pushed the scrollable area further right.
  const clampedStartDay = Math.max(0, Math.min(startDay, totalDays))
  const clampedEndDay = Math.max(clampedStartDay, Math.min(endDay, totalDays - 1))
  const barLeft = clampedStartDay * dayWidth
  const barWidth = Math.max((clampedEndDay - clampedStartDay + 1) * dayWidth, 1)
  const isTruncatedStart = startDay < 0
  const isTruncatedEnd = endDay >= totalDays

  return {
    barLeft,
    barWidth,
    isTruncatedEnd,
    isTruncatedStart,
    doneMarkerLeft:
      completedDay != null && completedDay >= 0 && completedDay < totalDays
        ? ((completedDay + 1) * dayWidth) - (doneMarkerSize / 2)
        : null,
  }
}

// ── Types ────

type TimelineHeaderCell = {
  isWeekend?: boolean
  key: string
  label: string
  sublabel?: string
  width: number
}

export type GanttTaskRowProps = {
  bottomRow: TimelineHeaderCell[]
  dayWidth: number
  effectiveBaseline: Date
  groupBy: TableGroupBy
  groupId: string
  groupSprintId?: string | null
  isActiveTask: boolean
  isDraggingThisTask: boolean
  isInteractionDisabled: boolean
  isReorderDrag: boolean
  isReorderOver: boolean
  mode: Mode
  onDragEnd: () => void
  onDragLeave: () => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onMoveTask?: (cardId: string, targetPosition: number, targetGroupId?: string | null) => void
  onOpenTask: (taskId: string) => void
  onResizeEnd: (task: ProjectGanttTask, clientX: number) => void
  onResizeStart: (task: ProjectGanttTask, clientX: number) => void
  onStartMove: (task: ProjectGanttTask, clientX: number) => void
  openTaskFromBar: (taskId: string, allowWhenClosed: boolean) => void
  projectMembers?: ProjectMember[]
  statusOptions: ProjectStatusOption[]
  task: ProjectGanttTask
  timeScale: string
  todayOffset: number | null
  totalDays: number
  totalWidth: number
  visibleColLeftOffset?: number
}

export const GanttTaskRow = memo(function GanttTaskRow({
  bottomRow,
  dayWidth,
  effectiveBaseline,
  isActiveTask,
  isDraggingThisTask,
  isInteractionDisabled,
  isReorderDrag,
  isReorderOver,
  mode,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onMoveTask,
  onOpenTask,
  onResizeEnd,
  onResizeStart,
  onStartMove,
  openTaskFromBar,
  projectMembers = [],
  statusOptions,
  task,
  timeScale,
  todayOffset,
  totalDays,
  totalWidth,
  visibleColLeftOffset = 0,
}: GanttTaskRowProps) {
  const {barLeft, barWidth, doneMarkerLeft} = getTaskTimelineLayout(task, effectiveBaseline, dayWidth, totalDays)
  const color = statusCategoryColor(mode, getStatusOptionCategory(task.card.statusOptionId, statusOptions))
  const showLabel = barWidth >= (timeScale === 'month' ? 30 : 56)
  const showAvatar = timeScale !== 'month' && barWidth >= 90
  const assigneeAvatarUrl = task.card.assigneeUserId
    ? projectMembers.find((member) => member.id === task.card.assigneeUserId)?.avatarUrl ?? null
    : null

  return (
    <div className='flex border-b border-border-subtle' key={task.id}>
      <div
        className={`group/task sticky left-0 z-10 w-64 shrink-0 border-r border-border-subtle bg-surface-elevated p-2 ${
          isReorderOver ? 'border-t-2 border-t-primary' : ''
        } ${isReorderDrag ? 'opacity-40' : ''}`}
        draggable={!isInteractionDisabled && Boolean(onMoveTask)}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDragStart={onDragStart}
        onDrop={onDrop}
      >
        <div className='flex items-center gap-1'>
          {/* Drag handle */}
          {onMoveTask && !isInteractionDisabled ? (
            <GripVertical className='h-3 w-3 shrink-0 cursor-grab text-text-muted/30 opacity-0 transition-opacity group-hover/task:opacity-100 active:cursor-grabbing' />
          ) : null}
          <button
            className='flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all'
            style={{
              backgroundColor: task.completed ? 'var(--color-success)' : 'transparent',
              borderColor: task.completed ? 'var(--color-success)' : 'var(--color-border-strong)',
            }}
            type='button'
          >
            {task.completed ? <Check className='h-2.5 w-2.5 text-white' /> : null}
          </button>
          <span className='min-w-0 flex-1 truncate text-sm text-text-strong'>
            {task.title}
          </span>
          {/* Open task detail chevron */}
          <button
            className='shrink-0 rounded p-0.5 text-text-muted/40 opacity-0 transition-opacity hover:text-text-strong group-hover/task:opacity-100'
            onClick={() => onOpenTask(task.id)}
            title='Open task'
            type='button'
          >
            <ChevronRight className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>

      <div className='relative flex-1 py-2' style={{minWidth: totalWidth}}>
        {/* Grid lines (only visible columns) */}
        <div className='absolute inset-0'>
          <div className='absolute inset-y-0 flex' style={{left: visibleColLeftOffset}}>
            {bottomRow.map((cell) => (
              <div
                className={`shrink-0 border-r border-border-subtle ${cell.isWeekend ? 'bg-surface-muted/60' : 'opacity-50'}`}
                key={cell.key}
                style={{width: cell.width}}
              />
            ))}
          </div>
        </div>

        {/* Today marker */}
        {todayOffset != null && todayOffset < totalWidth ? (
          <div
            className='absolute top-0 h-full w-0.5 bg-primary/40'
            style={{left: todayOffset}}
          />
        ) : null}

        {/* Task bar */}
        <div
          className={`absolute top-2 flex h-8 items-center overflow-hidden rounded-lg text-white transition-all ${isActiveTask ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-canvas' : ''}`}
          data-testid={`gantt-bar-${task.id}`}
          onClick={() => openTaskFromBar(task.id, false)}
          onDoubleClick={() => openTaskFromBar(task.id, true)}
          style={{
            backgroundColor: color,
            cursor: isInteractionDisabled ? 'default' : 'grab',
            left: barLeft,
            opacity: isDraggingThisTask ? 0.82 : 1,
            paddingLeft: showLabel ? 8 : 0,
            paddingRight: showAvatar ? 28 : 0,
            width: barWidth,
          }}
        >
          {!isInteractionDisabled ? (
            <button
              className='absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/20'
              onClick={(event) => {
                event.stopPropagation()
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onResizeStart(task, event.clientX)
              }}
              type='button'
            />
          ) : null}

          <button
            className='flex-1 cursor-grab truncate text-left text-xs font-medium active:cursor-grabbing'
            aria-label={task.title}
            disabled={isInteractionDisabled}
            onPointerDown={(event) => {
              event.preventDefault()
              onStartMove(task, event.clientX)
            }}
            title={task.title}
            type='button'
          >
            {showLabel ? task.title : <span className='sr-only'>{task.title}</span>}
          </button>

          {showAvatar ? (
            <div className='absolute right-1 top-1/2 -translate-y-1/2'>
              <UserAvatar
                avatarUrl={assigneeAvatarUrl}
                className='h-5 w-5 ring-2 ring-white/50'
                fallback={task.assignee}
                fallbackClassName='bg-black/25 text-[8px] font-bold text-white'
                name={task.card.assigneeName}
              />
            </div>
          ) : null}

          {!isInteractionDisabled ? (
            <button
              className='absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/20'
              onClick={(event) => {
                event.stopPropagation()
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
              }}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onResizeEnd(task, event.clientX)
              }}
              type='button'
            />
          ) : null}
        </div>

        {doneMarkerLeft != null ? (
          <div
            className='absolute top-1.5 h-3 w-3 rotate-45 border-2 border-white'
            data-testid={`gantt-done-marker-${task.id}`}
            style={{
              backgroundColor: 'var(--color-success)',
              left: doneMarkerLeft,
            }}
          />
        ) : null}
      </div>
    </div>
  )
})
