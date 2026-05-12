import {MessageSquare} from 'lucide-react'
import {useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import {
  createCanvasTransformPreviewLookup,
  getCanvasRenderedElementFrame,
} from './canvas-interaction'
import type {CanvasElement, CanvasElementTransformPreview} from './canvas.types'

type CanvasCommentPinsProps = {
  canEdit: boolean
  editingElementId: string | null
  elements: CanvasElement[]
  onCommitContent: (elementId: string, content: string) => void
  onElementPointerDown: (event: ReactPointerEvent<HTMLElement>, element: CanvasElement) => void
  onStartEditing: (elementId: string) => void
  selectedElementId: string | null
  selectedElementIds?: string[]
  transformPreview: CanvasElementTransformPreview | null
  transformPreviews?: CanvasElementTransformPreview[]
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
  editingElementId,
  elements,
  onCommitContent,
  onElementPointerDown,
  onStartEditing,
  selectedElementId,
  selectedElementIds,
  transformPreview,
  transformPreviews = [],
}: CanvasCommentPinsProps) {
  const commentElements = elements.filter((element) => element.elementType === 'comment')
  const selectedElementIdSet = new Set(selectedElementIds ?? (selectedElementId ? [selectedElementId] : []))
  const transformPreviewLookup = useMemo(
    () => createCanvasTransformPreviewLookup(transformPreview, transformPreviews),
    [transformPreview, transformPreviews],
  )

  return (
    <>
      {commentElements.map((element) => {
        const position = getCanvasRenderedElementFrame(element, transformPreviewLookup)
        const isEditing = editingElementId === element.id
        const isSelected = selectedElementIdSet.has(element.id) || isEditing
        const shouldShowBody = isEditing || (isSelected && selectedElementIdSet.size <= 1)

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
              onClick={(event) => {
                if (event.shiftKey) {
                  return
                }

                if (isSelected && canEdit && selectedElementIdSet.size <= 1) {
                  onStartEditing(element.id)
                }
              }}
              onPointerDown={(event) => onElementPointerDown(event, element)}
              type='button'
            >
              <MessageSquare className='h-3.5 w-3.5'/>
            </button>

            {shouldShowBody ? (
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
