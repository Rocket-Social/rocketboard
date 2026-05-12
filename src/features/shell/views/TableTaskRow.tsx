import {Check, ChevronRight} from 'lucide-react'
import {memo, type DragEvent, type ReactNode, type RefObject} from 'react'

import type {Mode} from '../../../app/mode'
import type {ProjectTableTask} from '../../cards/card-view-mappers'

function isInteractiveTaskRowTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable
    || target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"], [data-task-row-ignore-open="true"]') !== null
  )
}

export type TableTaskRowProps = {
  activeTaskId: string | null
  children: ReactNode
  editInputRef: RefObject<HTMLInputElement | null>
  editingTitle: string
  isActiveTask: boolean
  isDragOver: boolean
  isDragged: boolean
  isEditing: boolean
  isPendingTask: boolean
  isTaskDetailOpen: boolean
  mode: Mode
  onCancelEdit: () => void
  onContextMenu: (taskId: string, position: {x: number; y: number}) => void
  onDragEnd: () => void
  onDragLeave: () => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onEditTitle: (value: string) => void
  onOpenTask: (taskId: string) => void
  onSaveTitle: () => void
  onStartEditing: (taskId: string) => void
  onToggleComplete: (taskId: string) => void
  onToggleTaskSelection: (taskId: string, shiftKey?: boolean) => void
  selected: boolean
  task: ProjectTableTask
  titleWidth: number
}

export const TableTaskRow = memo(function TableTaskRow({
  activeTaskId,
  children,
  editInputRef,
  editingTitle,
  isActiveTask,
  isDragOver,
  isDragged,
  isEditing,
  isPendingTask,
  isTaskDetailOpen,
  onCancelEdit,
  onContextMenu,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onEditTitle,
  onOpenTask,
  onSaveTitle,
  onStartEditing,
  onToggleComplete,
  onToggleTaskSelection,
  selected,
  task,
  titleWidth,
}: TableTaskRowProps) {
  return (
    <div
      aria-selected={isActiveTask}
      className={`group/row grid items-center gap-4 border-b border-border-subtle px-4 py-2 transition-colors ${
        isActiveTask
          ? 'bg-primary-soft hover:bg-primary-soft'
          : 'bg-surface-elevated hover:bg-surface-muted'
      } ${
        isDragged ? 'opacity-40' : ''
      } ${isDragOver ? 'border-t-2 border-t-primary' : ''} ${
        isPendingTask ? 'pointer-events-none opacity-70' : ''
      }`}
      data-task-row-id={task.id}
      draggable={!isEditing && !isPendingTask}
      onClick={(e) => {
        if (!isTaskDetailOpen || isEditing || isPendingTask || isInteractiveTaskRowTarget(e.target)) {
          return
        }

        if (activeTaskId !== task.id) {
          onOpenTask(task.id)
        }
      }}
      onContextMenu={(e) => {
        if (isPendingTask) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(task.id, {x: e.clientX, y: e.clientY})
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragStart={onDragStart}
      onDrop={onDrop}
      style={{gridTemplateColumns: 'var(--table-grid-columns)'}}
    >
      {/* Name column: checkbox + completion circle + title + drag gap + detail icon -- frozen */}
      <div
        className={`sticky left-0 z-10 flex min-w-0 items-center gap-1 h-full pl-1 ${
          isActiveTask
            ? 'bg-primary-soft group-hover/row:bg-primary-soft'
            : 'bg-surface-elevated group-hover/row:bg-surface-muted'
        }`}
        style={{
          boxShadow: isActiveTask ? 'inset 3px 0 0 var(--color-primary)' : undefined,
          width: titleWidth,
        }}
      >
        {/* Checkbox -- hidden until row hover, visible when selected */}
        <button
          className={`flex h-5 w-5 shrink-0 items-center justify-center transition-opacity ${
            selected
              ? 'opacity-100'
              : 'opacity-0 group-hover/row:opacity-100'
          }`}
          disabled={isPendingTask}
          onClick={(e) => {
            e.stopPropagation()
            onToggleTaskSelection(task.id, e.shiftKey)
          }}
          title='Select task'
          type='button'
        >
          <div
            className='flex h-4 w-4 items-center justify-center rounded border-2'
            style={{
              backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
              borderColor: selected ? 'var(--color-primary)' : 'var(--color-border-strong)',
            }}
          >
            {selected ? <Check className='h-2.5 w-2.5 text-white' /> : null}
          </div>
        </button>
        {/* Completion circle */}
        <button
          className='group/complete flex h-6 w-6 shrink-0 items-center justify-center'
          disabled={isPendingTask}
          onClick={(e) => {
            e.stopPropagation()
            onToggleComplete(task.id)
          }}
          title={isPendingTask ? 'Saving task...' : task.completed ? 'Mark incomplete' : 'Mark complete'}
          type='button'
        >
          <div
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all ${
              task.completed
                ? 'border-success bg-success'
                : 'border-border-strong group-hover/complete:border-success'
            }`}
          >
            <Check className={`h-2.5 w-2.5 transition-colors ${
              task.completed
                ? 'text-white'
                : 'text-transparent group-hover/complete:text-success'
            }`} />
          </div>
        </button>

        {/* Title -- editable on click */}
        {isEditing ? (
          <input
            ref={editInputRef}
            autoFocus
            className={`shrink min-w-0 h-[22px] text-[13px] leading-[18px] bg-transparent outline-none px-1 ${
              task.completed ? 'text-text-muted' : 'text-text-strong'
            }`}
            value={editingTitle}
            onChange={(e) => onEditTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSaveTitle()
              }
              if (e.key === 'Escape') {
                onCancelEdit()
              }
            }}
            onBlur={onSaveTitle}
          />
        ) : (
          <span
            className={`shrink min-w-0 max-w-[calc(100%-60px)] truncate text-[13px] leading-[18px] px-1 cursor-text hover:outline hover:outline-1 hover:outline-border-strong rounded-sm ${
              task.completed ? 'text-text-muted' : 'text-text-strong'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              if (isPendingTask) {
                return
              }
              onStartEditing(task.id)
            }}
            title={task.title || undefined}
          >
            {task.title || 'Write a task name'}
          </span>
        )}

        {/* Drag gap -- cursor-grab zone */}
        <div
          className='flex-1 min-w-4 h-full cursor-grab active:cursor-grabbing'
          onClick={(e) => e.stopPropagation()}
        />

        {/* Detail icon -- hover only */}
        <div className={`${isActiveTask ? 'flex' : 'hidden group-hover/row:flex'} items-center shrink-0`}>
          <button
            className='flex items-center justify-center w-6 h-6 rounded hover:bg-canvas-accent'
            disabled={isPendingTask}
            onClick={(e) => {
              e.stopPropagation()
              onOpenTask(task.id)
            }}
            title={isPendingTask ? 'Saving task...' : 'Open details'}
            type='button'
          >
            <ChevronRight className={`h-3.5 w-3.5 ${isActiveTask ? 'text-primary' : 'text-text-muted'}`} />
          </button>
        </div>
      </div>

      {/* Field columns passed as children */}
      {children}

      {/* Trailing cell for "+" column */}
      <div/>
    </div>
  )
})
