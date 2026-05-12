import type {Editor} from '@tiptap/react'
import {useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent} from 'react'

import {cn} from '../../lib/cn'
import {CanvasSelectionFrame} from './CanvasSelectionFrame'
import {
  CanvasShapeTextDisplay,
  CanvasShapeTextEditor,
  type CanvasShapeEditorDraft,
  type CanvasShapeTextFocusRequest,
  type CanvasShapeTextFocusTarget,
} from './CanvasShapeText'
import {
  createCanvasTransformPreviewLookup,
  getCanvasRenderedElementFrame,
  type CanvasTransformPreviewLookup,
} from './canvas-interaction'
import {
  CANVAS_ALIGNMENT_GUIDE_COLOR,
  CANVAS_SIZE_GUIDE_COLOR,
  CANVAS_SPACING_GUIDE_COLOR,
  DEFAULT_CANVAS_SHAPE_STROKE_STYLE,
  getCanvasOverlayZIndex,
  resolveCanvasShapeStyle,
  type CanvasElement,
  type CanvasElementFrame,
  type CanvasElementStyle,
  type CanvasGuideLine,
  type CanvasResizeHandle,
  type CanvasShapeStrokeStyle,
  type CanvasShapeType,
  type CanvasTransformGuides,
} from './canvas.types'
import type {CanvasElementTransformPreview} from './canvas.types'

type PreviewDrawing = {
  points: Array<{x: number; y: number}>
  strokeColor: string
  strokeWidth: number
} | null

type PreviewShape = {
  fillColor: string
  height: number
  shapeType: CanvasShapeType
  strokeColor: string
  strokeWidth: number
  width: number
  x: number
  y: number
} | null

type PreviewSelectionMarquee = {
  height: number
  width: number
  x: number
  y: number
} | null

type CanvasDrawingLayerProps = {
  canEdit: boolean
  editingElementId: string | null
  elements: CanvasElement[]
  onElementPointerDown: (event: ReactPointerEvent<HTMLElement>, element: CanvasElement) => void
  onResizeHandlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>, element: CanvasElement, handle: CanvasResizeHandle) => void
  onShapeClick: (element: CanvasElement, focusTarget: CanvasShapeTextFocusTarget) => void
  onShapeEditorEscape: (elementId: string) => void
  onShapeEditorReady: (editor: Editor | null) => void
  onShapeTextDraftChange: (elementId: string, draft: CanvasShapeEditorDraft) => void
  selectedElementId: string | null
  selectedElementIds?: string[]
  shapeEditingStyleDraft: {elementId: string; style: CanvasElementStyle} | null
  shapeTextFocusRequest: ({elementId: string} & CanvasShapeTextFocusRequest) | null
  shapeTextDraft: ({elementId: string} & CanvasShapeEditorDraft) | null
  showShapeSelectionHandles: boolean
  transformPreview: CanvasElementTransformPreview | null
  transformPreviews?: CanvasElementTransformPreview[]
  previewDrawing: PreviewDrawing
  previewSelectionMarquee?: PreviewSelectionMarquee
  previewShape: PreviewShape
}

const DEFAULT_CANVAS_SHAPE_TEXT_INSET = 16

export function resolveCanvasFrame(
  element: CanvasElement,
  transformPreview: CanvasElementTransformPreview | null,
  transformPreviews: CanvasElementTransformPreview[] = [],
) {
  return getCanvasRenderedElementFrame(
    element,
    createCanvasTransformPreviewLookup(transformPreview, transformPreviews),
  )
}

function resolveCanvasFrameFromLookup(
  element: CanvasElement,
  transformPreviewLookup: CanvasTransformPreviewLookup,
) {
  return getCanvasRenderedElementFrame(element, transformPreviewLookup)
}

function resolveCanvasSelectionBounds(frames: CanvasElementFrame[]): CanvasElementFrame | null {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  frames.forEach((frame) => {
    const frameRight = frame.x + frame.width
    const frameBottom = frame.y + frame.height
    const isValidFrame = [
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      frameRight,
      frameBottom,
    ].every(Number.isFinite)

    if (!isValidFrame) {
      return
    }

    left = Math.min(left, frame.x)
    top = Math.min(top, frame.y)
    right = Math.max(right, frameRight)
    bottom = Math.max(bottom, frameBottom)
  })

  if (![left, top, right, bottom].every(Number.isFinite)) {
    return null
  }

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  }
}

function getStrokeDasharray(strokeStyle: CanvasShapeStrokeStyle) {
  return strokeStyle === 'dashed' ? '10 6' : undefined
}

function constrainCanvasShapeTextBounds(
  bounds: {bottom: number; left: number; right: number; top: number},
  width: number,
  height: number,
) {
  const maxHorizontalInset = Math.max(0, (width - 1) / 2)
  const maxVerticalInset = Math.max(0, (height - 1) / 2)

  return {
    bottom: Math.min(bounds.bottom, maxVerticalInset),
    left: Math.min(bounds.left, maxHorizontalInset),
    right: Math.min(bounds.right, maxHorizontalInset),
    top: Math.min(bounds.top, maxVerticalInset),
  }
}

function resolveCanvasShapeTextBounds(shapeType: CanvasShapeType, width: number, height: number) {
  switch (shapeType) {
    case 'plus':
      return constrainCanvasShapeTextBounds({
        bottom: height * 0.36,
        left: width * 0.36,
        right: width * 0.36,
        top: height * 0.36,
      }, width, height)
    case 'star':
      return constrainCanvasShapeTextBounds({
        bottom: height * 0.26,
        left: width * 0.24,
        right: width * 0.24,
        top: height * 0.28,
      }, width, height)
    case 'thought-bubble':
      return constrainCanvasShapeTextBounds({
        bottom: height * 0.34,
        left: width * 0.14,
        right: width * 0.14,
        top: height * 0.18,
      }, width, height)
    default:
      return constrainCanvasShapeTextBounds({
        bottom: DEFAULT_CANVAS_SHAPE_TEXT_INSET,
        left: DEFAULT_CANVAS_SHAPE_TEXT_INSET,
        right: DEFAULT_CANVAS_SHAPE_TEXT_INSET,
        top: DEFAULT_CANVAS_SHAPE_TEXT_INSET,
      }, width, height)
  }
}

function getStarPoints(width: number, height: number) {
  const centerX = width / 2
  const centerY = height / 2
  const outerRadius = Math.max(1, Math.min(width, height) / 2 - 1)
  const innerRadius = outerRadius * 0.46

  return Array.from({length: 10}, (_point, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5
    const radius = index % 2 === 0 ? outerRadius : innerRadius

    return `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`
  }).join(' ')
}

function getThoughtBubblePath(width: number, height: number) {
  const left = 0
  const right = width
  const top = height * 0.08
  const bottom = height * 0.72
  const tailBottom = height * 0.96
  const radius = Math.min(width * 0.22, (bottom - top) * 0.5)
  const tailBaseLeft = width * 0.28
  const tailBaseRight = width * 0.44
  const tailTipX = width * 0.24

  return [
    `M ${left + radius} ${top}`,
    `H ${right - radius}`,
    `Q ${right} ${top} ${right} ${top + radius}`,
    `V ${bottom - radius}`,
    `Q ${right} ${bottom} ${right - radius} ${bottom}`,
    `H ${tailBaseRight}`,
    `C ${tailBaseRight} ${bottom + (tailBottom - bottom) * 0.36} ${tailTipX} ${tailBottom} ${tailTipX} ${tailBottom}`,
    `C ${tailTipX + (tailBaseRight - tailTipX) * 0.06} ${bottom + (tailBottom - bottom) * 0.52} ${tailBaseLeft} ${bottom} ${tailBaseLeft} ${bottom}`,
    `H ${left + radius}`,
    `Q ${left} ${bottom} ${left} ${bottom - radius}`,
    `V ${top + radius}`,
    `Q ${left} ${top} ${left + radius} ${top}`,
    'Z',
  ].join(' ')
}

function getShapePoints(shapeType: CanvasShapeType, width: number, height: number) {
  switch (shapeType) {
    case 'diamond':
      return `${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`
    case 'triangle':
      return `${width / 2},0 ${width},${height} 0,${height}`
    case 'hexagon':
      return `${width * 0.24},0 ${width * 0.76},0 ${width},${height / 2} ${width * 0.76},${height} ${width * 0.24},${height} 0,${height / 2}`
    case 'parallelogram':
      return `${width * 0.18},0 ${width},0 ${width * 0.82},${height} 0,${height}`
    case 'trapezoid':
      return `${width * 0.18},0 ${width * 0.82},0 ${width},${height} 0,${height}`
    case 'arrow-right':
      return `0,${height * 0.22} ${width * 0.66},${height * 0.22} ${width * 0.66},0 ${width},${height / 2} ${width * 0.66},${height} ${width * 0.66},${height * 0.78} 0,${height * 0.78}`
    case 'plus':
      return `${width * 0.38},0 ${width * 0.62},0 ${width * 0.62},${height * 0.36} ${width},${height * 0.36} ${width},${height * 0.64} ${width * 0.62},${height * 0.64} ${width * 0.62},${height} ${width * 0.38},${height} ${width * 0.38},${height * 0.64} 0,${height * 0.64} 0,${height * 0.36} ${width * 0.38},${height * 0.36}`
    case 'star':
      return getStarPoints(width, height)
    default:
      return null
  }
}

function CanvasShapeSvg({
  fillColor,
  height,
  shapeType,
  strokeColor,
  strokeStyle,
  strokeWidth,
  width,
}: {
  fillColor: string | null
  height: number
  shapeType: CanvasShapeType
  strokeColor: string
  strokeStyle: CanvasShapeStrokeStyle
  strokeWidth: number
  width: number
}) {
  const strokeDasharray = getStrokeDasharray(strokeStyle)
  const commonProps = {
    fill: fillColor ?? 'transparent',
    stroke: strokeStyle === 'none' ? 'none' : strokeColor,
    strokeDasharray,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  }
  const polygonPoints = getShapePoints(shapeType, width, height)
  const thoughtBubblePath = shapeType === 'thought-bubble' ? getThoughtBubblePath(width, height) : null

  return (
    <svg className='h-full w-full' viewBox={`0 0 ${width} ${height}`}>
      {shapeType === 'circle' ? (
        <ellipse
          {...commonProps}
          cx={width / 2}
          cy={height / 2}
          rx={Math.max(1, width / 2 - strokeWidth / 2)}
          ry={Math.max(1, height / 2 - strokeWidth / 2)}
        />
      ) : shapeType === 'rectangle' ? (
        <rect
          {...commonProps}
          height={Math.max(1, height - strokeWidth)}
          rx={6}
          ry={6}
          width={Math.max(1, width - strokeWidth)}
          x={strokeWidth / 2}
          y={strokeWidth / 2}
        />
      ) : shapeType === 'rounded-rectangle' ? (
        <rect
          {...commonProps}
          height={Math.max(1, height - strokeWidth)}
          rx={Math.min(24, Math.max(10, Math.min(width, height) * 0.18))}
          ry={Math.min(24, Math.max(10, Math.min(width, height) * 0.18))}
          width={Math.max(1, width - strokeWidth)}
          x={strokeWidth / 2}
          y={strokeWidth / 2}
        />
      ) : thoughtBubblePath ? (
        <path
          {...commonProps}
          d={thoughtBubblePath}
        />
      ) : polygonPoints ? (
        <polygon
          {...commonProps}
          points={polygonPoints}
        />
      ) : null}
    </svg>
  )
}

function CanvasSmartGuides({
  guides,
  zIndex,
}: {
  guides: CanvasTransformGuides | null | undefined
  zIndex: number
}) {
  if (!guides || (
    guides.alignment.length === 0
    && guides.size.length === 0
    && guides.spacing.length === 0
  )) {
    return null
  }

  const renderGuideLine = (
    key: string,
    line: CanvasGuideLine,
    stroke: string,
    strokeWidth: number,
  ) => (
    <line
      key={key}
      stroke={stroke}
      strokeLinecap='round'
      strokeWidth={strokeWidth}
      vectorEffect='non-scaling-stroke'
      x1={line.x1}
      x2={line.x2}
      y1={line.y1}
      y2={line.y2}
    />
  )

  return (
    <svg
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 overflow-visible'
      data-testid='canvas-smart-guides'
      focusable='false'
      style={{zIndex}}
    >
      {guides.alignment.map((guide, index) => (
        renderGuideLine(`alignment-${guide.axis}-${index}`, guide.line, CANVAS_ALIGNMENT_GUIDE_COLOR, 1.5)
      ))}
      {guides.size.map((guide, index) => (
        renderGuideLine(`size-${guide.axis}-${index}`, guide.line, CANVAS_SIZE_GUIDE_COLOR, 2.5)
      ))}
      {guides.spacing.flatMap((guide, guideIndex) => (
        guide.segments.flatMap((segment, segmentIndex) => [
          renderGuideLine(`spacing-${guide.axis}-${guideIndex}-${segmentIndex}-line`, segment.line, CANVAS_SPACING_GUIDE_COLOR, 2.5),
          renderGuideLine(`spacing-${guide.axis}-${guideIndex}-${segmentIndex}-start`, segment.startCap, CANVAS_SPACING_GUIDE_COLOR, 2.5),
          renderGuideLine(`spacing-${guide.axis}-${guideIndex}-${segmentIndex}-end`, segment.endCap, CANVAS_SPACING_GUIDE_COLOR, 2.5),
        ])
      ))}
    </svg>
  )
}

function resolveShapeTextStyle(
  element: CanvasElement,
  shapeTextDraft: ({elementId: string} & CanvasShapeEditorDraft) | null,
  styleSource: CanvasElementStyle,
) {
  if (!shapeTextDraft || shapeTextDraft.elementId !== element.id) {
    return {
      content: element.content,
      style: styleSource,
    }
  }

  return {
    content: shapeTextDraft.content,
    style: {
      ...styleSource,
      rich_text: shapeTextDraft.richText,
    } satisfies CanvasElementStyle,
  }
}

export function CanvasDrawingLayer({
  canEdit,
  editingElementId,
  elements,
  onElementPointerDown,
  onResizeHandlePointerDown,
  onShapeClick,
  onShapeEditorEscape,
  onShapeEditorReady,
  onShapeTextDraftChange,
  selectedElementId,
  selectedElementIds,
  shapeEditingStyleDraft,
  shapeTextFocusRequest,
  shapeTextDraft,
  showShapeSelectionHandles,
  transformPreview,
  transformPreviews = [],
  previewDrawing,
  previewSelectionMarquee,
  previewShape,
}: CanvasDrawingLayerProps) {
  const shapeClickIntentRef = useRef<{
    elementId: string
    shouldEnterTextEditing: boolean
  } | null>(null)
  const drawingElements = elements.filter((element) => element.elementType === 'drawing' || element.elementType === 'shape')
  const selectedElementIdSet = new Set(selectedElementIds ?? (selectedElementId ? [selectedElementId] : []))
  const selectedElements = elements.filter((element) => selectedElementIdSet.has(element.id))
  const selectedShapes = drawingElements.filter((element) => selectedElementIdSet.has(element.id) && element.elementType === 'shape')
  const selectionFrameZIndex = getCanvasOverlayZIndex(elements)
  const transformPreviewLookup = useMemo(
    () => createCanvasTransformPreviewLookup(transformPreview, transformPreviews),
    [transformPreview, transformPreviews],
  )
  const multiSelectionFrame = selectedElements.length > 1
    ? resolveCanvasSelectionBounds(
      selectedElements.map((element) => resolveCanvasFrameFromLookup(element, transformPreviewLookup)),
    )
    : null

  return (
    <>
      {drawingElements.map((element) => {
        const frame = resolveCanvasFrameFromLookup(element, transformPreviewLookup)
        const isSelected = selectedElementIdSet.has(element.id)
        const isTransforming = transformPreviewLookup.has(element.id)
        const isShape = element.elementType === 'shape'
        const isEditing = editingElementId === element.id
        const styleSource = isShape && shapeEditingStyleDraft?.elementId === element.id
          ? shapeEditingStyleDraft.style
          : element.style
        const shapeText = isShape ? resolveShapeTextStyle(element, shapeTextDraft, styleSource) : null
        const resolvedShapeStyle = resolveCanvasShapeStyle(styleSource)
        const strokeColor = isShape ? resolvedShapeStyle.strokeColor : element.style.stroke_color ?? '#17202b'
        const strokeWidth = isShape ? resolvedShapeStyle.strokeWidth : element.style.stroke_width ?? 3
        const strokeOpacity = isShape ? resolvedShapeStyle.strokeOpacity : element.style.stroke_opacity ?? 1
        const fillColor = isShape ? resolvedShapeStyle.fillColor : null
        const shapeType = isShape ? resolvedShapeStyle.shapeType : null
        const strokeStyle = isShape ? resolvedShapeStyle.strokeStyle : DEFAULT_CANVAS_SHAPE_STROKE_STYLE
        const shapeTextBounds = isShape ? resolveCanvasShapeTextBounds(shapeType ?? 'rectangle', frame.width, frame.height) : null

        return (
          <div
            key={element.id}
            className={cn(
              'absolute select-none transition-shadow',
              canEdit ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-default',
              'rounded-[12px]',
              (isSelected || isTransforming) ? 'shadow-panel' : '',
              !isShape && isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas' : '',
            )}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
              const clickIntent = shapeClickIntentRef.current
              shapeClickIntentRef.current = null

              if (
                canEdit
                && isShape
                && clickIntent?.elementId === element.id
                && clickIntent.shouldEnterTextEditing
              ) {
                onShapeClick(element, {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  mode: 'pointer',
                })
              }
            }}
            onPointerDown={(event) => {
              shapeClickIntentRef.current = isShape
                ? {
                    elementId: element.id,
                    shouldEnterTextEditing: isSelected && selectedElementIdSet.size === 1 && !event.shiftKey,
                  }
                : null

              onElementPointerDown(event, element)
            }}
            style={{
              height: `${frame.height}px`,
              left: `${frame.x}px`,
              top: `${frame.y}px`,
              width: `${frame.width}px`,
              zIndex: element.zIndex,
            }}
          >
            {isShape ? (
              <>
                <div className='absolute inset-0'>
                  <CanvasShapeSvg
                    fillColor={fillColor}
                    height={frame.height}
                    shapeType={shapeType ?? 'rectangle'}
                    strokeColor={strokeColor}
                    strokeStyle={strokeStyle}
                    strokeWidth={strokeWidth}
                    width={frame.width}
                  />
                </div>

                <div className='absolute' data-testid='canvas-shape-text-bounds' style={shapeTextBounds ?? undefined}>
                  {isEditing && shapeText ? (
                    <CanvasShapeTextEditor
                      content={shapeText.content}
                      focusRequest={shapeTextFocusRequest?.elementId === element.id ? shapeTextFocusRequest : null}
                      onChange={(draft) => onShapeTextDraftChange(element.id, draft)}
                      onEscape={() => onShapeEditorEscape(element.id)}
                      onReady={onShapeEditorReady}
                      style={shapeText.style}
                    />
                  ) : shapeText ? (
                    <div className='pointer-events-none h-full w-full'>
                      <CanvasShapeTextDisplay
                        content={shapeText.content}
                        style={shapeText.style}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <svg className='h-full w-full overflow-visible' viewBox={`0 0 ${frame.width} ${frame.height}`}>
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
            strokeStyle={DEFAULT_CANVAS_SHAPE_STROKE_STYLE}
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

      <CanvasSmartGuides
        guides={transformPreview?.guides}
        zIndex={selectionFrameZIndex}
      />

      {selectedShapes.map((selectedShape) => {
        const selectedShapeFrame = resolveCanvasFrameFromLookup(selectedShape, transformPreviewLookup)
        const showHandles = selectedElements.length === 1 && showShapeSelectionHandles

        return (
          <CanvasSelectionFrame
            height={selectedShapeFrame.height}
            key={selectedShape.id}
            onHandlePointerDown={showHandles
              ? (event, handle) => onResizeHandlePointerDown(event, selectedShape, handle)
              : undefined}
            showHandles={showHandles}
            width={selectedShapeFrame.width}
            x={selectedShapeFrame.x}
            y={selectedShapeFrame.y}
            zIndex={selectionFrameZIndex}
          />
        )
      })}

      {multiSelectionFrame ? (
        <CanvasSelectionFrame
          height={multiSelectionFrame.height}
          showCornerMarkers
          testId='canvas-selection-group-frame'
          variant='group'
          width={multiSelectionFrame.width}
          x={multiSelectionFrame.x}
          y={multiSelectionFrame.y}
          zIndex={selectionFrameZIndex}
        />
      ) : null}

      {previewSelectionMarquee ? (
        <div
          className='pointer-events-none absolute rounded-[4px] border'
          data-testid='canvas-selection-marquee'
          style={{
            backgroundColor: 'var(--color-canvas-selection-soft)',
            borderColor: 'var(--color-canvas-selection)',
            height: `${previewSelectionMarquee.height}px`,
            left: `${previewSelectionMarquee.x}px`,
            top: `${previewSelectionMarquee.y}px`,
            width: `${previewSelectionMarquee.width}px`,
            zIndex: selectionFrameZIndex + 1,
          }}
        />
      ) : null}
    </>
  )
}
