import {ImageOff} from 'lucide-react'
import {useEffect, useState, type PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import type {CanvasElement} from './canvas.types'

type DragPreview = {
  elementId: string
  x: number
  y: number
} | null

type CanvasElementsProps = {
  canEdit: boolean
  dragPreview: DragPreview
  editingElementId: string | null
  elements: CanvasElement[]
  onCommitContent: (elementId: string, content: string) => void
  onElementPointerDown: (event: ReactPointerEvent<HTMLElement>, element: CanvasElement) => void
  onStartEditing: (elementId: string) => void
  selectedElementId: string | null
}

function resolvePosition(element: CanvasElement, dragPreview: DragPreview) {
  if (dragPreview?.elementId === element.id) {
    return {
      x: dragPreview.x,
      y: dragPreview.y,
    }
  }

  return {
    x: element.x,
    y: element.y,
  }
}

function CanvasTextEditor({
  element,
  onCommit,
}: {
  element: CanvasElement
  onCommit: (content: string) => void
}) {
  const [value, setValue] = useState(element.content ?? '')

  useEffect(() => {
    setValue(element.content ?? '')
  }, [element.content, element.id])

  return (
    <textarea
      autoFocus
      className='h-full w-full resize-none bg-transparent text-sm leading-relaxed text-text-strong outline-none'
      onBlur={() => onCommit(value)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.blur()
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      value={value}
    />
  )
}

export function CanvasElements({
  canEdit,
  dragPreview,
  editingElementId,
  elements,
  onCommitContent,
  onElementPointerDown,
  onStartEditing,
  selectedElementId,
}: CanvasElementsProps) {
  const positionedElements = elements.filter((element) => element.elementType === 'note' || element.elementType === 'image' || element.elementType === 'text')

  return (
    <>
      {positionedElements.map((element) => {
        const position = resolvePosition(element, dragPreview)
        const isEditing = editingElementId === element.id
        const isSelected = selectedElementId === element.id

        if (element.elementType === 'image') {
          return (
            <div
              className={cn(
                'absolute overflow-hidden rounded-[10px] border border-border-subtle bg-surface-elevated transition-shadow',
                canEdit ? 'cursor-move touch-none' : 'cursor-default',
                isSelected ? 'shadow-panel ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
                dragPreview?.elementId === element.id ? 'shadow-panel' : '',
              )}
              key={element.id}
              onDoubleClick={() => canEdit && onStartEditing(element.id)}
              onPointerDown={(event) => onElementPointerDown(event, element)}
              style={{
                height: `${element.height}px`,
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${element.width}px`,
                zIndex: element.zIndex,
              }}
            >
              {element.url ? (
                <img
                  alt={element.content ?? 'Canvas reference'}
                  className='h-full w-full object-cover'
                  draggable={false}
                  src={element.url}
                />
              ) : (
                <div className='flex h-full items-center justify-center bg-canvas-accent text-text-muted'>
                  <ImageOff className='h-8 w-8'/>
                </div>
              )}
            </div>
          )
        }

        const fillColor = element.style.fill_color ?? '#f2eee6'

        return (
          <div
            className={cn(
              'absolute rounded-[10px] border border-border-subtle p-3 text-sm text-text-strong transition-shadow',
              canEdit ? 'cursor-move touch-none' : 'cursor-default',
              isSelected ? 'shadow-panel ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
              dragPreview?.elementId === element.id ? 'shadow-panel' : '',
            )}
            key={element.id}
            onDoubleClick={() => canEdit && onStartEditing(element.id)}
            onPointerDown={(event) => onElementPointerDown(event, element)}
            style={{
              backgroundColor: fillColor,
              height: `${element.height}px`,
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${element.width}px`,
              zIndex: element.zIndex,
            }}
          >
            {isEditing ? (
              <CanvasTextEditor
                element={element}
                onCommit={(content) => onCommitContent(element.id, content)}
              />
            ) : (
              <div className='h-full whitespace-pre-wrap break-words font-sans leading-relaxed'>
                {element.content?.trim() ? element.content : <span className='text-text-muted'>Empty note</span>}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
