import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {Plus} from 'lucide-react'
import {useCallback} from 'react'

import type {Mode} from '../../../../app/mode'
import type {CardRecord, ProjectPriorityOption, ProjectStatusOption} from '../../../cards/card.types'
import type {OverviewWidgetConfig, OverviewWidgetType, OverviewWidgetWidth} from '../../../projects/project-view.types'
import {BurnDownWidget} from './BurnDownWidget'
import {BurnUpWidget} from './BurnUpWidget'
import {PriorityAssigneesWidget} from './PriorityAssigneesWidget'
import {ProgressBarWidget} from './ProgressBarWidget'
import {ProgressWidget} from './ProgressWidget'
import {WidgetSkeleton} from './WidgetSkeleton'
import {WidgetShell} from './WidgetShell'

type DateRange = {endDate: string; startDate: string}

type WidgetGridProps = {
  cards: CardRecord[]
  dateRange?: DateRange | null
  isEditMode: boolean
  isLoading?: boolean
  mode: Mode
  onAddWidget?: (type: OverviewWidgetType) => void
  onClickAssignee?: (userId: string) => void
  onClickTask?: (taskId: string) => void
  onRemoveWidget: (id: string) => void
  onRenameWidget: (id: string, title: string | null) => void
  onReorderWidgets: (widgets: OverviewWidgetConfig[]) => void
  onResizeWidget: (id: string, width: OverviewWidgetWidth) => void
  priorityOptions?: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
  widgets: OverviewWidgetConfig[]
}

export function WidgetGrid({
  cards,
  dateRange,
  isEditMode,
  isLoading = false,
  mode,
  onAddWidget,
  onClickAssignee,
  onClickTask,
  onRemoveWidget,
  onRenameWidget,
  onReorderWidgets,
  onResizeWidget,
  priorityOptions,
  statusOptions,
  widgets,
}: WidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const {active, over} = event
    if (!over || active.id === over.id) return
    const oldIndex = widgets.findIndex((w) => w.id === active.id)
    const newIndex = widgets.findIndex((w) => w.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorderWidgets(arrayMove(widgets, oldIndex, newIndex))
  }, [widgets, onReorderWidgets])

  if (isLoading) {
    return (
      <div className='grid gap-4 lg:grid-cols-3'>
        {widgets.map((widget) => (
          <div
            className={`${resolveWidgetGridSpanClass(widget.width)} h-full`}
            key={widget.id}
          >
            <div className='flex h-full flex-col rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
              <WidgetSkeleton type={widget.type}/>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (widgets.length === 0) {
    return (
      <div className='flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-surface-muted p-8 text-center'>
        <h3 className='mb-1 font-display text-base font-semibold text-text-strong'>No widgets yet</h3>
        <p className='mb-4 text-sm text-text-muted'>Add reporting widgets to see project progress at a glance.</p>
        {isEditMode && onAddWidget ? (
          <button
            className='inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-inverse shadow-sm transition-colors hover:bg-primary-strong'
            onClick={() => onAddWidget('progress_status')}
            type='button'
          >
            <Plus className='h-4 w-4'/>
            Add widget
          </button>
        ) : null}
      </div>
    )
  }

  const content = (
    <div className='grid items-stretch gap-4 lg:grid-cols-3' role='list' aria-label='Dashboard widgets'>
      {widgets.map((widget) => (
        <SortableWidget
          cards={cards}
          dateRange={dateRange}
          isEditMode={isEditMode}
          key={widget.id}
          mode={mode}
          onClickAssignee={onClickAssignee}
          onClickTask={onClickTask}
          onRemove={() => onRemoveWidget(widget.id)}
          onRename={(title) => onRenameWidget(widget.id, title)}
          onResize={(width) => onResizeWidget(widget.id, width)}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          widget={widget}
        />
      ))}
    </div>
  )

  if (!isEditMode) return content

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={widgets.map((w) => w.id)}>
        {content}
      </SortableContext>
    </DndContext>
  )
}

function SortableWidget({
  cards,
  dateRange,
  isEditMode,
  mode,
  onClickAssignee,
  onClickTask,
  onRemove,
  onRename,
  onResize,
  priorityOptions,
  statusOptions,
  widget,
}: {
  cards: CardRecord[]
  dateRange?: DateRange | null
  isEditMode: boolean
  mode: Mode
  onClickAssignee?: (userId: string) => void
  onClickTask?: (taskId: string) => void
  onRemove: () => void
  onRename: (title: string | null) => void
  onResize: (width: OverviewWidgetWidth) => void
  priorityOptions?: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
  widget: OverviewWidgetConfig
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: widget.id, disabled: !isEditMode})

  const style = {
    opacity: isDragging ? 0.85 : undefined,
    transform: CSS.Transform.toString(transform ? {...transform, scaleX: isDragging ? 0.95 : 1, scaleY: isDragging ? 0.95 : 1} : null),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div className={`${resolveWidgetGridSpanClass(widget.width)} h-full`} ref={setNodeRef} role='listitem' style={style}>
      <WidgetShell
        customTitle={widget.title}
        dragHandleProps={isEditMode ? {...attributes, ...listeners} : undefined}
        isEditMode={isEditMode}
        onRemove={onRemove}
        onRename={onRename}
        onResize={onResize}
        type={widget.type}
        width={widget.width}
      >
        <WidgetContent
          cards={cards}
          dateRange={dateRange}
          mode={mode}
          onClickAssignee={onClickAssignee}
          onClickTask={onClickTask}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
          type={widget.type}
        />
      </WidgetShell>
    </div>
  )
}

function resolveWidgetGridSpanClass(width: OverviewWidgetWidth) {
  if (width === 3) return 'lg:col-span-3'
  if (width === 2) return 'lg:col-span-2'
  return ''
}

function WidgetContent({
  cards,
  dateRange,
  mode,
  onClickAssignee,
  onClickTask,
  priorityOptions,
  statusOptions,
  type,
}: {
  cards: CardRecord[]
  dateRange?: DateRange | null
  mode: Mode
  onClickAssignee?: (userId: string) => void
  onClickTask?: (taskId: string) => void
  priorityOptions?: ProjectPriorityOption[]
  statusOptions: ProjectStatusOption[]
  type: OverviewWidgetType
}) {
  switch (type) {
    case 'progress_status':
      return <ProgressWidget cards={cards} mode={mode} statusOptions={statusOptions}/>
    case 'burn_up':
      return <BurnUpWidget cards={cards} dateRange={dateRange} statusOptions={statusOptions}/>
    case 'priority_assignees':
      return (
        <PriorityAssigneesWidget
          cards={cards}
          mode={mode}
          onClickAssignee={onClickAssignee}
          onClickTask={onClickTask}
          priorityOptions={priorityOptions}
          statusOptions={statusOptions}
        />
      )
    case 'burn_down':
      return <BurnDownWidget cards={cards} dateRange={dateRange} statusOptions={statusOptions}/>
    case 'progress_bar':
      return <ProgressBarWidget cards={cards} mode={mode} statusOptions={statusOptions}/>
  }
}
