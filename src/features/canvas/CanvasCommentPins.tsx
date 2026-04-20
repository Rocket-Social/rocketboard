import {MessageSquare} from 'lucide-react'
import {useEffect, useState, type PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import type {CanvasElement} from './canvas.types'

type DragPreview = {
  elementId: string
  x: number
  y: number
} | null

type CanvasCommentPinsProps = {
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

function CommentEditor({
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
      className='min-h-[88px] w-full resize-none rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-strong outline-none focus:border-primary'
      onBlur={() => onCommit(value)}
      onChange={(event) => setValue(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      value={value}
    />
  )
}

export function CanvasCommentPins({
  canEdit,
  dragPreview,
  editingElementId,
  elements,
  onCommitContent,
  onElementPointerDown,
  onStartEditing,
  selectedElementId,
}: CanvasCommentPinsProps) {
  const commentElements = elements.filter((element) => element.elementType === 'comment')

  return (
    <>
      {commentElements.map((element) => {
        const position = resolvePosition(element, dragPreview)
        const isEditing = editingElementId === element.id
        const isSelected = selectedElementId === element.id || isEditing

        return (
          <div
            className='absolute'
            key={element.id}
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              zIndex: element.zIndex,
            }}
          >
            <button
              aria-label='Canvas comment'
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white transition-transform hover:scale-105',
                canEdit ? 'cursor-move touch-none' : 'cursor-pointer',
                isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
              )}
              onClick={() => {
                if (isSelected && canEdit) {
                  onStartEditing(element.id)
                }
              }}
              onPointerDown={(event) => onElementPointerDown(event, element)}
              type='button'
            >
              <MessageSquare className='h-3.5 w-3.5'/>
            </button>

            {isSelected ? (
              <div className='absolute left-8 top-0 w-[280px] rounded-[10px] border border-border-subtle bg-surface-elevated p-3 text-sm text-text-strong shadow-panel'>
                {isEditing ? (
                  <CommentEditor
                    element={element}
                    onCommit={(content) => onCommitContent(element.id, content)}
                  />
                ) : (
                  <button
                    className='w-full text-left'
                    onClick={() => canEdit && onStartEditing(element.id)}
                    type='button'
                  >
                    {element.content?.trim() ? (
                      <p className='whitespace-pre-wrap break-words leading-relaxed'>{element.content}</p>
                    ) : (
                      <p className='text-text-muted'>Add a comment</p>
                    )}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
