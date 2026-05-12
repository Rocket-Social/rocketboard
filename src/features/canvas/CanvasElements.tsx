import {ImageOff} from 'lucide-react'
import {useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import {
  createCanvasTransformPreviewLookup,
  getCanvasRenderedElementFrame,
} from './canvas-interaction'
import type {CanvasElement, CanvasElementTransformPreview} from './canvas.types'

type CanvasElementsProps = {
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
  editingElementId,
  elements,
  onCommitContent,
  onElementPointerDown,
  onStartEditing,
  selectedElementId,
  selectedElementIds,
  transformPreview,
  transformPreviews = [],
}: CanvasElementsProps) {
  const positionedElements = elements.filter((element) => element.elementType === 'note' || element.elementType === 'image' || element.elementType === 'text')
  const selectedElementIdSet = new Set(selectedElementIds ?? (selectedElementId ? [selectedElementId] : []))
  const transformPreviewLookup = useMemo(
    () => createCanvasTransformPreviewLookup(transformPreview, transformPreviews),
    [transformPreview, transformPreviews],
  )

  return (
    <>
      {positionedElements.map((element) => {
        const frame = getCanvasRenderedElementFrame(element, transformPreviewLookup)
        const isEditing = editingElementId === element.id
        const isSelected = selectedElementIdSet.has(element.id)
        const isTransforming = transformPreviewLookup.has(element.id)

        if (element.elementType === 'image') {
          return (
            <div
              key={element.id}
              className={cn(
                'absolute overflow-hidden rounded-[10px] border border-border-subtle bg-surface-elevated transition-shadow',
                canEdit ? 'cursor-move touch-none' : 'cursor-default',
                isSelected ? 'shadow-panel ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
                isTransforming ? 'shadow-panel' : '',
              )}
              onDoubleClick={() => canEdit && onStartEditing(element.id)}
              onPointerDown={(event) => onElementPointerDown(event, element)}
              style={{
                height: `${frame.height}px`,
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.width}px`,
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
            key={element.id}
            className={cn(
              'absolute rounded-[10px] border border-border-subtle p-3 text-sm text-text-strong transition-shadow',
              canEdit ? 'cursor-move touch-none' : 'cursor-default',
              isSelected ? 'shadow-panel ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
              isTransforming ? 'shadow-panel' : '',
            )}
            onDoubleClick={() => canEdit && onStartEditing(element.id)}
            onPointerDown={(event) => onElementPointerDown(event, element)}
            style={{
              backgroundColor: fillColor,
              height: `${frame.height}px`,
              left: `${frame.x}px`,
              top: `${frame.y}px`,
              width: `${frame.width}px`,
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
