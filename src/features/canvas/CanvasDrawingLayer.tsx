import type {PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import type {CanvasElement} from './canvas.types'

type DragPreview = {
  elementId: string
  x: number
  y: number
} | null

type PreviewDrawing = {
  points: Array<{x: number; y: number}>
  strokeColor: string
  strokeWidth: number
} | null

type PreviewShape = {
  fillColor: string
  height: number
  shapeType: 'circle' | 'rectangle'
  strokeColor: string
  strokeWidth: number
  width: number
  x: number
  y: number
} | null

type CanvasDrawingLayerProps = {
  canEdit: boolean
  dragPreview: DragPreview
  elements: CanvasElement[]
  onElementPointerDown: (event: ReactPointerEvent<HTMLElement>, element: CanvasElement) => void
  selectedElementId: string | null
  previewDrawing: PreviewDrawing
  previewShape: PreviewShape
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

function CanvasShapeSvg({
  fillColor,
  height,
  shapeType,
  strokeColor,
  strokeWidth,
  width,
}: {
  fillColor: string
  height: number
  shapeType: 'circle' | 'rectangle'
  strokeColor: string
  strokeWidth: number
  width: number
}) {
  return (
    <svg className='h-full w-full' viewBox={`0 0 ${width} ${height}`}>
      {shapeType === 'circle' ? (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          fill={fillColor}
          rx={Math.max(1, width / 2 - strokeWidth / 2)}
          ry={Math.max(1, height / 2 - strokeWidth / 2)}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      ) : (
        <rect
          fill={fillColor}
          height={Math.max(1, height - strokeWidth)}
          rx={10}
          ry={10}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          width={Math.max(1, width - strokeWidth)}
          x={strokeWidth / 2}
          y={strokeWidth / 2}
        />
      )}
    </svg>
  )
}

export function CanvasDrawingLayer({
  canEdit,
  dragPreview,
  elements,
  onElementPointerDown,
  selectedElementId,
  previewDrawing,
  previewShape,
}: CanvasDrawingLayerProps) {
  const drawingElements = elements.filter((element) => element.elementType === 'drawing' || element.elementType === 'shape')

  return (
    <>
      {drawingElements.map((element) => {
        const position = resolvePosition(element, dragPreview)
        const strokeColor = element.style.stroke_color ?? '#17202b'
        const strokeWidth = element.style.stroke_width ?? (element.elementType === 'drawing' ? 3 : 2)
        const strokeOpacity = element.style.stroke_opacity ?? 1
        const fillColor = element.style.fill_color ?? '#f2eee6'
        const shapeType = element.style.shape_type ?? 'rectangle'

        return (
          <div
            className={cn(
              'absolute rounded-[12px] transition-shadow',
              canEdit ? 'cursor-move touch-none' : 'cursor-default',
              selectedElementId === element.id ? 'shadow-panel ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
              dragPreview?.elementId === element.id ? 'shadow-panel' : '',
            )}
            key={element.id}
            onPointerDown={(event) => onElementPointerDown(event, element)}
            style={{
              height: `${element.height}px`,
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${element.width}px`,
              zIndex: element.zIndex,
            }}
          >
            {element.elementType === 'shape' ? (
              <CanvasShapeSvg
                fillColor={fillColor}
                height={element.height}
                shapeType={shapeType}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                width={element.width}
              />
            ) : (
              <svg className='h-full w-full overflow-visible' viewBox={`0 0 ${element.width} ${element.height}`}>
                <path
                  d={element.pathData ?? ''}
                  fill='none'
                  stroke={strokeColor}
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeOpacity={strokeOpacity}
                  strokeWidth={strokeWidth}
                />
              </svg>
            )}
          </div>
        )
      })}

      {previewShape ? (
        <div
          className='pointer-events-none absolute opacity-35'
          style={{
            height: `${previewShape.height}px`,
            left: `${previewShape.x}px`,
            top: `${previewShape.y}px`,
            width: `${previewShape.width}px`,
          }}
        >
          <CanvasShapeSvg
            fillColor={previewShape.fillColor}
            height={previewShape.height}
            shapeType={previewShape.shapeType}
            strokeColor={previewShape.strokeColor}
            strokeWidth={previewShape.strokeWidth}
            width={previewShape.width}
          />
        </div>
      ) : null}

      {previewDrawing && previewDrawing.points.length > 1 ? (
        <svg className='pointer-events-none absolute inset-0 overflow-visible opacity-35'>
          <path
            d={previewDrawing.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')}
            fill='none'
            stroke={previewDrawing.strokeColor}
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={previewDrawing.strokeWidth}
          />
        </svg>
      ) : null}
    </>
  )
}
