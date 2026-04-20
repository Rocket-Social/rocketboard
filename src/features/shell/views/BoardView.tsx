import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {Check, Clock, Maximize2, Minimize2, MoreHorizontal, Plus} from 'lucide-react'
import {useVirtualizer} from '@tanstack/react-virtual'
import {memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react'

import type {Mode} from '../../../app/mode'
import {Badge} from '../../../components/ui/badge'
import {UserAvatar} from '../../../components/ui/user-avatar'
import type {ProjectMember} from '../../access/access.types'
import type {
  ProjectBoardLane,
  ProjectBoardTask,
} from '../../cards/card-view-mappers'
import type {CreateCardInput, ProjectStatusOption, TaskBoardMode} from '../../cards/card.types'
import type {BoardColumn} from '../../cards/card-view.types'
import {isInferredProjectSprint} from '../../sprints/sprint-fallbacks'
import {
  isSprintMembershipMutationBlocked,
  sprintReassignmentUnavailableMessage,
} from '../../sprints/sprint-mutation-guard'
import {dueDateColor, statusCategoryColor} from '../theme'
import {fitBoardCardTags} from './board-card-tags'
import {taskBoardStandardLaneId} from '../../cards/card-view-mappers'

let boardCardTagMeasureContext: CanvasRenderingContext2D | null = null

function measureBoardCardTagText(text: string) {
  if (typeof document === 'undefined') {
    return text.length * 6
  }

  if (!boardCardTagMeasureContext) {
    boardCardTagMeasureContext = document.createElement('canvas').getContext('2d')
  }

  if (!boardCardTagMeasureContext) {
    return text.length * 6
  }

  const fontFamily = window.getComputedStyle(document.body).fontFamily || 'sans-serif'
  boardCardTagMeasureContext.font = `400 10px ${fontFamily}`

  return boardCardTagMeasureContext.measureText(text).width
}

/** Column width minus card/lane padding, border, avatar, and gaps. */
const BOARD_CARD_TAG_FIXED_OVERHEAD_PX = 78
const BOARD_COLUMN_WIDTH_PX = 300
const COLLAPSED_BOARD_COLUMN_WIDTH_PX = 84
const BOARD_COLUMN_MAX_HEIGHT = 'calc(100vh - 260px)'
const boardColumnActionButtonClassName = 'flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-text-muted transition-colors hover:border-border-subtle hover:bg-canvas-accent hover:text-text-strong'

function estimateTagAreaWidth(columnWidth: number, hasDueDate: boolean, hasPriority: boolean) {
  let width = columnWidth - BOARD_CARD_TAG_FIXED_OVERHEAD_PX
  if (hasPriority) width -= 14 // dot 6px + gap 8px
  if (hasDueDate) width -= 62 // clock + label ~50px + gap 12px
  return Math.max(0, width)
}

function BoardTaskTags({availableWidth, tags}: {availableWidth: number; tags: string[]}) {
  const layout = useMemo(
    () => fitBoardCardTags({availableWidth, measureText: measureBoardCardTagText, tags}),
    [availableWidth, tags],
  )

  if (layout.visibleTags.length === 0 && layout.hiddenCount === 0) {
    return null
  }

  return (
    <div className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden'>
      {layout.visibleTags.map((tag, index) => (
        <span
          className={`${tag.maxWidth != null ? 'min-w-0' : 'shrink-0'} rounded-lg bg-canvas-accent px-1.5 py-0.5 text-[10px] text-text-muted`}
          key={`${tag.label}-${index}`}
          style={tag.maxWidth != null ? {maxWidth: `${tag.maxWidth}px`} : undefined}
        >
          <span className='block truncate'>{tag.label}</span>
        </span>
      ))}
      {layout.hiddenCount > 0 ? <span className='shrink-0 text-[10px] text-text-muted'>+{layout.hiddenCount}</span> : null}
    </div>
  )
}

type BoardViewProps = {
  boardColumns: BoardColumn[]
  boardLanes: ProjectBoardLane[]
  boardTasks: Record<string, Record<string, ProjectBoardTask[]>>
  collapsedColumnIds?: string[]
  displayProjectSprintsInferred?: boolean
  isInteractionDisabled?: boolean
  mode: Mode
  onCreateTask: (defaults?: Partial<CreateCardInput>) => void
  onCollapsedColumnIdsChange?: Dispatch<SetStateAction<string[]>>
  onMoveBlocked?: (message: string) => void
  onMoveTask: (input: {
    cardId: string
    previousPosition: number
    previousStatusOptionId: string | null
    previousSprintId: string | null
    targetPosition: number
    targetSprintId: string | null
    targetStatusOptionId: string | null
  }) => Promise<boolean>
  onOpenTask: (taskId: string) => void
  projectMembers?: ProjectMember[]
  statusOptions: ProjectStatusOption[]
  taskMode?: TaskBoardMode
}

function columnAccent(mode: Mode, columnId: string, statusOptions: ProjectStatusOption[]) {
  const option = statusOptions.find((o) => o.id === columnId)
  return statusCategoryColor(mode, option?.category ?? null)
}

function createTaskDefaults(columnId: string, taskMode: TaskBoardMode): Partial<CreateCardInput> {
  return taskMode === 'sprint'
    ? {sprintId: null, statusOptionId: columnId === '__no_status' ? null : columnId}
    : {statusOptionId: columnId === '__no_status' ? null : columnId}
}

function normalizeLaneTasks(columnId: string, tasks: ProjectBoardTask[]) {
  return tasks.map((task, index) => ({
    ...task,
    card: {
      ...task.card,
      statusOptionId: columnId === '__no_status' ? null : columnId,
      statusPosition: index,
    },
    columnId,
  }))
}

function findTaskLocation(
  taskId: string,
  boardTasks: Record<string, Record<string, ProjectBoardTask[]>>,
) {
  for (const [columnId, lanes] of Object.entries(boardTasks)) {
    for (const [laneId, tasks] of Object.entries(lanes)) {
      const index = tasks.findIndex((task) => task.id === taskId)

      if (index !== -1) {
        return {
          columnId,
          index,
          laneId,
          task: tasks[index],
        }
      }
    }
  }

  return null
}

function applyBoardMove(
  boardTasks: Record<string, Record<string, ProjectBoardTask[]>>,
  source: {columnId: string; index: number; laneId: string; task: ProjectBoardTask},
  target: {columnId: string; index: number; laneId: string},
) {
  if (source.columnId === target.columnId && source.laneId === target.laneId) {
    return {
      ...boardTasks,
      [source.columnId]: {
        ...boardTasks[source.columnId],
        [source.laneId]: normalizeLaneTasks(
          source.columnId,
          arrayMove(boardTasks[source.columnId][source.laneId], source.index, target.index),
        ),
      },
    }
  }

  const sourceTasks = [...boardTasks[source.columnId][source.laneId]]
  const [removedTask] = sourceTasks.splice(source.index, 1)
  const targetTasks = [...boardTasks[target.columnId][target.laneId]]
  targetTasks.splice(target.index, 0, {
    ...removedTask,
    columnId: target.columnId,
  })

  return {
    ...boardTasks,
    [source.columnId]: {
      ...boardTasks[source.columnId],
      [source.laneId]: normalizeLaneTasks(source.columnId, sourceTasks),
    },
    [target.columnId]: {
      ...boardTasks[target.columnId],
      [target.laneId]: normalizeLaneTasks(target.columnId, targetTasks),
    },
  }
}

const BoardTaskCard = memo(function BoardTaskCard({
  columnWidth = 300,
  isDragging = false,
  listeners,
  mode,
  onOpenTask,
  projectMembers = [],
  sortableAttributes,
  task,
  transform,
  transition,
}: {
  columnWidth?: number
  isDragging?: boolean
  listeners?: ReturnType<typeof useSortable>['listeners']
  mode: Mode
  onOpenTask: (taskId: string) => void
  projectMembers?: ProjectMember[]
  sortableAttributes?: ReturnType<typeof useSortable>['attributes']
  task: ProjectBoardTask
  transform?: ReturnType<typeof useSortable>['transform']
  transition?: string
}) {
  const assigneeAvatarUrl = task.card.assigneeUserId
    ? projectMembers.find((member) => member.id === task.card.assigneeUserId)?.avatarUrl ?? null
    : null

  return (
    <article
      className='group relative rounded-xl border border-border-subtle bg-surface-elevated p-3 transition-all duration-200 hover:border-primary hover:shadow-panel'
      onClick={() => onOpenTask(task.id)}
      style={{
        opacity: isDragging ? 0.65 : 1,
        transform: CSS.Transform.toString(transform ?? null),
        transition,
      }}
      {...sortableAttributes}
      {...listeners}
    >
      <div className='absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-all duration-150 group-hover:opacity-100'>
        <button
          className='text-text-muted transition-colors hover:text-text-strong'
          onClick={(event) => {
            event.stopPropagation()
            onOpenTask(task.id)
          }}
          type='button'
        >
          <Check className='h-3.5 w-3.5' />
        </button>
        <button
          className='text-text-muted transition-colors hover:text-text-strong'
          onClick={(event) => {
            event.stopPropagation()
            onOpenTask(task.id)
          }}
          type='button'
        >
          <MoreHorizontal className='h-3.5 w-3.5' />
        </button>
      </div>

      <h4 className='mb-2.5 pr-12 text-sm font-medium leading-tight text-text-strong'>{task.title}</h4>

      <div className='flex items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <UserAvatar
            avatarUrl={assigneeAvatarUrl}
            className='h-5 w-5 shrink-0'
            fallback={task.assignee}
            fallbackClassName='text-[9px]'
            name={task.card.assigneeName}
          />

          {task.tags.length > 0 ? <BoardTaskTags availableWidth={estimateTagAreaWidth(columnWidth, task.dueIn != null, !!task.card.priorityOptionId)} tags={task.tags} /> : null}

          {task.card.priorityOptionId ? (
            <div
              className='h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted'
              title={task.priority}
            />
          ) : null}
        </div>

        {task.dueIn != null ? (
          <div className='flex shrink-0 items-center gap-1 text-[11px]' style={{color: dueDateColor(mode, task.dueIn)}}>
            <Clock className='h-3 w-3' />
            {task.dueIn === 0 ? 'Today' : `${task.dueIn}d`}
          </div>
        ) : null}
      </div>
    </article>
  )
})

function SortableBoardCard({
  columnWidth,
  disabled = false,
  mode,
  onOpenTask,
  projectMembers = [],
  task,
}: {
  columnWidth: number
  disabled?: boolean
  mode: Mode
  onOpenTask: (taskId: string) => void
  projectMembers?: ProjectMember[]
  task: ProjectBoardTask
}) {
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
    disabled,
    id: task.id,
  })

  return (
    <div ref={setNodeRef}>
      <BoardTaskCard
        columnWidth={columnWidth}
        isDragging={isDragging}
        listeners={listeners}
        mode={mode}
        onOpenTask={onOpenTask}
        projectMembers={projectMembers}
        sortableAttributes={attributes}
        task={task}
        transform={transform}
        transition={transition}
      />
    </div>
  )
}

function BoardColumnLane({
  children,
  droppableId,
  scrollRef,
}: {
  children: ReactNode
  droppableId: string
  scrollRef?: React.RefObject<HTMLDivElement | null>
}) {
  const {setNodeRef, isOver} = useDroppable({id: droppableId})

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      if (scrollRef && 'current' in scrollRef) {
        ;(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }
    },
    [setNodeRef, scrollRef],
  )

  return (
    <div
      className={`min-h-[220px] rounded-b-2xl border-x border-b border-border-subtle bg-surface-base p-3 transition-colors ${isOver ? 'bg-canvas-accent/60' : ''}`}
      ref={combinedRef}
      style={{maxHeight: BOARD_COLUMN_MAX_HEIGHT, overflowY: 'auto'}}
    >
      {children}
    </div>
  )
}

const CARD_ESTIMATED_HEIGHT = 100
const CARD_GAP = 12

function VirtualizedBoardCards({
  columnWidth,
  isDragActive,
  isInteractionDisabled,
  mode,
  onOpenTask,
  projectMembers = [],
  scrollRef,
  taskIds,
  tasks,
}: {
  columnWidth: number
  isDragActive: boolean
  isInteractionDisabled: boolean
  mode: Mode
  onOpenTask: (taskId: string) => void
  projectMembers?: ProjectMember[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  taskIds: string[]
  tasks: ProjectBoardTask[]
}) {
  const virtualizer = useVirtualizer({
    count: tasks.length,
    estimateSize: () => CARD_ESTIMATED_HEIGHT + CARD_GAP,
    getScrollElement: () => scrollRef.current,
    overscan: 5,
  })

  // During drag, render all cards so dnd-kit can find all drop targets.
  // Virtualization resumes when drag ends.
  if (isDragActive) {
    return (
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className='flex flex-col gap-3'>
          {tasks.map((task) => (
            <SortableBoardCard
              columnWidth={columnWidth}
              disabled={isInteractionDisabled}
              key={task.id}
              mode={mode}
              onOpenTask={onOpenTask}
              projectMembers={projectMembers}
              task={task}
            />
          ))}
        </div>
      </SortableContext>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const task = tasks[virtualItem.index]
          return (
            <div
              key={task.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                left: 0,
                paddingBottom: virtualItem.index < tasks.length - 1 ? `${CARD_GAP}px` : undefined,
                position: 'absolute',
                top: 0,
                transform: `translateY(${virtualItem.start}px)`,
                width: '100%',
              }}
            >
              <SortableBoardCard
                columnWidth={columnWidth}
                disabled={isInteractionDisabled}
                mode={mode}
                onOpenTask={onOpenTask}
                projectMembers={projectMembers}
                task={task}
              />
            </div>
          )
        })}
      </div>
    </SortableContext>
  )
}

function BoardColumnBody({
  columnId,
  columnWidth,
  isDragActive,
  isInteractionDisabled,
  mode,
  onCreateTask,
  onOpenTask,
  projectMembers = [],
  taskIds,
  tasks,
}: {
  columnId: string
  columnWidth: number
  isDragActive: boolean
  isInteractionDisabled: boolean
  mode: Mode
  onCreateTask: (defaults?: Partial<CreateCardInput>) => void
  onOpenTask: (taskId: string) => void
  projectMembers?: ProjectMember[]
  taskIds: string[]
  tasks: ProjectBoardTask[]
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  return (
    <BoardColumnLane droppableId={`lane:${columnId}:${taskBoardStandardLaneId}`} scrollRef={scrollRef}>
      <VirtualizedBoardCards
        columnWidth={columnWidth}
        isDragActive={isDragActive}
        isInteractionDisabled={isInteractionDisabled}
        mode={mode}
        onOpenTask={onOpenTask}
        projectMembers={projectMembers}
        scrollRef={scrollRef}
        taskIds={taskIds}
        tasks={tasks}
      />

      <button
        className='mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-subtle py-2.5 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-text-strong'
        onClick={() => onCreateTask(createTaskDefaults(columnId, 'standard'))}
        type='button'
      >
        <Plus className='h-4 w-4' />
        Add task
      </button>
    </BoardColumnLane>
  )
}

function SprintLaneBody({
  columnId,
  isInteractionDisabled,
  lane,
  mode,
  onCreateTask,
  onOpenTask,
  projectMembers = [],
  taskIds,
  tasks,
}: {
  columnId: string
  isInteractionDisabled: boolean
  lane: ProjectBoardLane
  mode: Mode
  onCreateTask: (defaults?: Partial<CreateCardInput>) => void
  onOpenTask: (taskId: string) => void
  projectMembers?: ProjectMember[]
  taskIds: string[]
  tasks: ProjectBoardTask[]
}) {
  const laneCreateDisabled = isInferredProjectSprint(lane.sprint)

  return (
    <div className='rounded-2xl border border-border-subtle bg-surface-base'>
      <div className='flex items-center justify-between border-b border-border-subtle px-3 py-2'>
        <span className='text-xs font-semibold uppercase tracking-[0.16em] text-text-muted'>{lane.title}</span>
        <Badge variant='count'>{tasks.length}</Badge>
      </div>
      <BoardColumnLane droppableId={`lane:${columnId}:${lane.id}`}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className='flex flex-col gap-3'>
            {tasks.map((task) => (
              <SortableBoardCard
                columnWidth={BOARD_COLUMN_WIDTH_PX}
                disabled={isInteractionDisabled}
                key={task.id}
                mode={mode}
                onOpenTask={onOpenTask}
                projectMembers={projectMembers}
                task={task}
              />
            ))}
          </div>
        </SortableContext>

        <button
          className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-xs font-medium transition-colors ${laneCreateDisabled ? 'cursor-not-allowed border-border-subtle text-text-disabled' : 'border-border-subtle text-text-muted hover:border-primary hover:text-text-strong'}`}
          disabled={laneCreateDisabled}
          onClick={() => onCreateTask({
            sprintId: lane.sprint?.id ?? null,
            statusOptionId: columnId === '__no_status' ? null : columnId,
          })}
          title={laneCreateDisabled ? 'Sprint details are temporarily unavailable' : undefined}
          type='button'
        >
          <Plus className='h-4 w-4' />
          Add task
        </button>
      </BoardColumnLane>
    </div>
  )
}

function CollapsedBoardColumn({
  accentColor,
  atLimit,
  column,
  isDragActive,
  onCreateTask,
  onExpand,
  taskCount,
  taskMode,
}: {
  accentColor: string
  atLimit: boolean
  column: BoardColumn
  isDragActive: boolean
  onCreateTask: (defaults?: Partial<CreateCardInput>) => void
  onExpand: () => void
  taskCount: number
  taskMode: TaskBoardMode
}) {
  const droppableId = taskMode === 'standard' ? `lane:${column.id}:${taskBoardStandardLaneId}` : `collapsed:${column.id}`
  const {setNodeRef, isOver} = useDroppable({
    disabled: taskMode !== 'standard',
    id: droppableId,
  })
  const taskCountLabel = column.wipLimit ? `${taskCount}/${column.wipLimit}` : `${taskCount}`

  return (
    <div
      className={`flex min-h-[280px] flex-col overflow-hidden rounded-2xl border bg-surface-base shadow-sm transition-colors ${isOver ? 'border-primary bg-canvas-accent/50' : 'border-border-subtle hover:border-primary/40'}`}
      ref={setNodeRef}
    >
      <div className='h-1.5 w-full shrink-0' style={{backgroundColor: accentColor}} />

      <div className='flex flex-1 flex-col items-center gap-3 px-2 py-3'>
        <div
          className='inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border px-2 text-sm font-semibold'
          style={{
            backgroundColor: atLimit ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-canvas-accent)',
            borderColor: atLimit ? 'rgba(239, 68, 68, 0.18)' : 'var(--color-border-subtle)',
            color: atLimit ? 'var(--color-error)' : 'var(--color-text-strong)',
          }}
          title={column.wipLimit ? `${taskCount} tasks, WIP limit ${column.wipLimit}` : `${taskCount} tasks`}
        >
          {taskCountLabel}
        </div>

        <button
          aria-label={`Open ${column.title} column`}
          className={`flex min-h-[148px] flex-1 items-center justify-center rounded-xl px-1 transition-colors hover:bg-canvas-accent ${isDragActive ? 'border border-dashed border-border-subtle/80' : ''}`}
          onClick={onExpand}
          title={`Open ${column.title}`}
          type='button'
        >
          <span
            className='text-center text-[12px] font-semibold tracking-[0.18em] text-text-strong'
            style={{
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              writingMode: 'vertical-rl',
            }}
          >
            {column.title}
          </span>
        </button>

        <div className='flex w-full flex-col gap-1.5 border-t border-border-subtle pt-2'>
          <button
            aria-label={`Expand ${column.title} column`}
            className={boardColumnActionButtonClassName}
            onClick={onExpand}
            title={`Expand ${column.title}`}
            type='button'
          >
            <Maximize2 className='h-3.5 w-3.5' />
          </button>
          <button
            aria-label={`Add task to ${column.title}`}
            className={boardColumnActionButtonClassName}
            onClick={() => onCreateTask(createTaskDefaults(column.id, taskMode))}
            title={`Add task to ${column.title}`}
            type='button'
          >
            <Plus className='h-3.5 w-3.5' />
          </button>
        </div>
      </div>
    </div>
  )
}

export function BoardView({
  boardColumns,
  boardLanes,
  boardTasks,
  collapsedColumnIds,
  displayProjectSprintsInferred = false,
  isInteractionDisabled = false,
  mode,
  onCreateTask,
  onCollapsedColumnIdsChange,
  onMoveBlocked,
  onMoveTask,
  onOpenTask,
  projectMembers = [],
  statusOptions,
  taskMode = 'standard',
}: BoardViewProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [uncontrolledCollapsedColumns, setUncontrolledCollapsedColumns] = useState<string[]>([])
  const [optimisticBoardTasks, setOptimisticBoardTasks] = useState(boardTasks)
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}))
  const activeTask = activeTaskId ? findTaskLocation(activeTaskId, optimisticBoardTasks)?.task ?? null : null
  const collapsedColumns = collapsedColumnIds ?? uncontrolledCollapsedColumns
  const setCollapsedColumns = onCollapsedColumnIdsChange ?? setUncontrolledCollapsedColumns

  useEffect(() => {
    setOptimisticBoardTasks(boardTasks)
  }, [boardTasks])

  const columnTaskIds = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(optimisticBoardTasks).map((columnId) => [
          columnId,
          Object.fromEntries(
            Object.keys(optimisticBoardTasks[columnId]).map((laneId) => [
              laneId,
              optimisticBoardTasks[columnId][laneId].map((task) => task.id),
            ]),
          ),
        ]),
      ) as Record<string, Record<string, string[]>>,
    [optimisticBoardTasks],
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTaskId(null)

    if (!event.over) {
      return
    }

    const activeId = String(event.active.id)
    const overId = String(event.over.id)
    const source = findTaskLocation(activeId, optimisticBoardTasks)

    if (!source) {
      return
    }

    const targetFromTask = findTaskLocation(overId, optimisticBoardTasks)
    const targetLaneMatch = overId.match(/^lane:(.+?):(.+)$/)
    const maybeTargetColumnId = targetLaneMatch?.[1] ?? targetFromTask?.columnId
    const maybeTargetLaneId = targetLaneMatch?.[2] ?? targetFromTask?.laneId

    if (!maybeTargetColumnId || !maybeTargetLaneId) {
      return
    }

    const targetColumnId = maybeTargetColumnId
    const targetLaneId = maybeTargetLaneId
    const targetIndex = overId.startsWith('lane:')
      ? optimisticBoardTasks[targetColumnId][targetLaneId].length
      : targetFromTask?.index ?? source.index
    const targetSprintId =
      targetLaneId === taskBoardStandardLaneId
        ? null
        : boardLanes.find((lane) => lane.id === targetLaneId)?.sprint?.id ?? null

    if (isSprintMembershipMutationBlocked({
      displayProjectSprintsInferred,
      previousSprintId: source.task.card.sprintId ?? null,
      targetSprintId,
    })) {
      onMoveBlocked?.(sprintReassignmentUnavailableMessage)
      return
    }

    if (source.columnId === targetColumnId && source.laneId === targetLaneId && source.index === targetIndex) {
      return
    }

    const previousBoardTasks = optimisticBoardTasks
    const nextBoardTasks = applyBoardMove(optimisticBoardTasks, source, {
      columnId: targetColumnId,
      index: targetIndex,
      laneId: targetLaneId,
    })

    setOptimisticBoardTasks(nextBoardTasks)

    const succeeded = await onMoveTask({
      cardId: source.task.id,
      previousPosition: source.task.card.statusPosition,
      previousStatusOptionId: source.task.card.statusOptionId,
      previousSprintId: source.task.card.sprintId ?? null,
      targetPosition: targetIndex,
      targetSprintId,
      targetStatusOptionId: targetColumnId === '__no_status' ? null : targetColumnId,
    })

    if (!succeeded) {
      setOptimisticBoardTasks(previousBoardTasks)
    }
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className='flex gap-4 overflow-x-auto pb-4'>
        {boardColumns.map((column) => {
          const columnId = column.id
          const laneMap = optimisticBoardTasks[columnId] ?? {}
          const totalTasks = Object.values(laneMap).flat().length
          const collapsed = collapsedColumns.includes(column.id)
          const atLimit = column.wipLimit ? totalTasks >= column.wipLimit : false
          const accentColor = columnAccent(mode, columnId, statusOptions)

          return (
            <section
              className='shrink-0 transition-[width] duration-300'
              key={column.id}
              style={{width: collapsed ? `${COLLAPSED_BOARD_COLUMN_WIDTH_PX}px` : `${BOARD_COLUMN_WIDTH_PX}px`}}
            >
              {collapsed ? (
                <CollapsedBoardColumn
                  accentColor={accentColor}
                  atLimit={atLimit}
                  column={column}
                  isDragActive={activeTaskId !== null}
                  onCreateTask={onCreateTask}
                  onExpand={() => setCollapsedColumns((current) => current.filter((item) => item !== column.id))}
                  taskCount={totalTasks}
                  taskMode={taskMode}
                />
              ) : (
                <>
                  <div
                    className='rounded-t-2xl border-t-2 border-border-subtle bg-surface-base'
                    style={{borderColor: accentColor}}
                  >
                    <div className='flex items-center justify-between border-b border-border-subtle px-3 py-3'>
                      <div className='flex items-center gap-2'>
                        <span className='font-display text-base font-semibold text-text-strong'>{column.title}</span>
                        <Badge
                          variant='count'
                          style={{
                            backgroundColor: atLimit ? 'rgba(239, 68, 68, 0.15)' : undefined,
                            color: atLimit ? 'var(--color-error)' : undefined,
                          }}
                        >
                          {totalTasks}
                          {column.wipLimit ? `/${column.wipLimit}` : ''}
                        </Badge>
                      </div>

                      <div className='flex items-center gap-1 text-text-muted'>
                        {column.avgTime ? <span className='font-mono text-xs'>{column.avgTime}</span> : null}
                        <button
                          aria-label={`Collapse ${column.title} column`}
                          className={boardColumnActionButtonClassName}
                          onClick={() => setCollapsedColumns((current) => current.includes(column.id) ? current : [...current, column.id])}
                          title={`Collapse ${column.title}`}
                          type='button'
                        >
                          <Minimize2 className='h-3.5 w-3.5' />
                        </button>
                        <button
                          aria-label={`Add task to ${column.title}`}
                          className={boardColumnActionButtonClassName}
                          onClick={() => onCreateTask(createTaskDefaults(columnId, taskMode))}
                          title={`Add task to ${column.title}`}
                          type='button'
                        >
                          <Plus className='h-3.5 w-3.5' />
                        </button>
                      </div>
                    </div>
                  </div>

                  {taskMode === 'sprint' ? (
                    <div className='flex flex-col gap-3 overflow-y-auto rounded-b-2xl border-x border-b border-border-subtle bg-surface-base p-3' style={{maxHeight: BOARD_COLUMN_MAX_HEIGHT}}>
                      {boardLanes.map((lane) => (
                        <SprintLaneBody
                          columnId={columnId}
                          isInteractionDisabled={isInteractionDisabled}
                          key={`${columnId}:${lane.id}`}
                          lane={lane}
                          mode={mode}
                          onCreateTask={onCreateTask}
                          onOpenTask={onOpenTask}
                          projectMembers={projectMembers}
                          taskIds={columnTaskIds[columnId]?.[lane.id] ?? []}
                          tasks={laneMap[lane.id] ?? []}
                        />
                      ))}
                    </div>
                  ) : (
                    <BoardColumnBody
                      columnId={columnId}
                      columnWidth={BOARD_COLUMN_WIDTH_PX}
                      isDragActive={activeTaskId !== null}
                      isInteractionDisabled={isInteractionDisabled}
                      mode={mode}
                      onCreateTask={onCreateTask}
                      onOpenTask={onOpenTask}
                      projectMembers={projectMembers}
                      taskIds={columnTaskIds[columnId]?.[taskBoardStandardLaneId] ?? []}
                      tasks={laneMap[taskBoardStandardLaneId] ?? []}
                    />
                  )}
                </>
              )}
            </section>
          )
        })}

        <button
          className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-subtle text-text-muted transition-colors hover:border-primary hover:text-text-strong'
          onClick={() => onCreateTask(taskMode === 'sprint' ? {sprintId: null} : undefined)}
          type='button'
        >
          <Plus className='h-4 w-4' />
        </button>
      </div>

      <DragOverlay>
        {activeTask ? <BoardTaskCard mode={mode} onOpenTask={onOpenTask} projectMembers={projectMembers} task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
