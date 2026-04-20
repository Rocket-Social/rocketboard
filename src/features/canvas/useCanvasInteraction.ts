import {useCallback, useRef, useState} from 'react'
import type {PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent} from 'react'

import {buildCanvasPathData, clampCanvasZoom, getCanvasBoundingBox, getCanvasCoords, normalizeCanvasRect} from './canvas-interaction'
import type {
  CanvasElement,
  CanvasElementCreateInput,
  CanvasElementUpdateInput,
  CanvasPoint,
  CanvasShapeType,
  CanvasToolMode,
  CanvasViewport,
} from './canvas.types'

type DragPreview = {
  elementId: string
  x: number
  y: number
} | null

type PreviewDrawing = {
  points: CanvasPoint[]
  strokeColor: string
  strokeWidth: number
}

type PreviewShape = {
  fillColor: string
  shapeType: CanvasShapeType
  strokeColor: string
  strokeWidth: number
  x: number
  y: number
  width: number
  height: number
}

type UseCanvasInteractionOptions = {
  activeTool: CanvasToolMode
  canEdit: boolean
  elements: CanvasElement[]
  noteColor: string
  onCreateElement: (input: CanvasElementCreateInput) => Promise<CanvasElement>
  onUpdateElement: (elementId: string, updates: CanvasElementUpdateInput) => Promise<CanvasElement | void>
  penColor: string
  penWidth: number
  projectViewId: string
  setEditingElementId: (elementId: string | null) => void
  setSelectedElementId: (elementId: string | null) => void
  setViewport: (updater: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)) => void
  shapeFillColor: string
  shapeType: CanvasShapeType
  viewport: CanvasViewport
}

type InteractionState =
  | {
      originViewport: CanvasViewport
      pointerId: number
      startClientX: number
      startClientY: number
      type: 'panning'
    }
  | {
      current: CanvasPoint
      pointerId: number
      start: CanvasPoint
      type: 'shape'
    }
  | {
      elementId: string
      offsetX: number
      offsetY: number
      pointerId: number
      type: 'dragging-element'
    }
  | {
      pointerId: number
      points: CanvasPoint[]
      type: 'drawing'
    }

function getNextCanvasZIndex(elements: CanvasElement[]) {
  return elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex), 0) + 1
}

function resolveSurfaceRect(surface: HTMLDivElement | null) {
  if (!surface) {
    return null
  }

  return surface.getBoundingClientRect()
}

export function useCanvasInteraction({
  activeTool,
  canEdit,
  elements,
  noteColor,
  onCreateElement,
  onUpdateElement,
  penColor,
  penWidth,
  projectViewId,
  setEditingElementId,
  setSelectedElementId,
  setViewport,
  shapeFillColor,
  shapeType,
  viewport,
}: UseCanvasInteractionOptions) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const interactionRef = useRef<InteractionState | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview>(null)
  const [previewDrawing, setPreviewDrawing] = useState<PreviewDrawing | null>(null)
  const [previewShape, setPreviewShape] = useState<PreviewShape | null>(null)

  const clearTransientState = useCallback(() => {
    interactionRef.current = null
    setDragPreview(null)
    setPreviewDrawing(null)
    setPreviewShape(null)
  }, [])

  const handleSurfaceWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const surfaceRect = resolveSurfaceRect(surfaceRef.current)

    if (!surfaceRect) {
      return
    }

    event.preventDefault()

    const pointerPosition = getCanvasCoords(
      {clientX: event.clientX, clientY: event.clientY},
      surfaceRect,
      viewport,
    )
    const nextScale = clampCanvasZoom(viewport.scale * (event.deltaY < 0 ? 1.08 : 0.92))

    setViewport({
      scale: nextScale,
      x: event.clientX - surfaceRect.left - pointerPosition.x * nextScale,
      y: event.clientY - surfaceRect.top - pointerPosition.y * nextScale,
    })
  }, [setViewport, viewport])

  const handleSurfacePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      return
    }

    const surfaceRect = resolveSurfaceRect(surfaceRef.current)

    if (!surfaceRect) {
      return
    }

    surfaceRef.current?.focus()

    const pointerPosition = getCanvasCoords(
      {clientX: event.clientX, clientY: event.clientY},
      surfaceRect,
      viewport,
    )

    if (!canEdit || activeTool === 'hand') {
      event.currentTarget.setPointerCapture(event.pointerId)
      interactionRef.current = {
        originViewport: viewport,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        type: 'panning',
      }
      return
    }

    if (activeTool === 'note') {
      setSelectedElementId(null)
      setEditingElementId(null)
      void onCreateElement({
        content: '',
        elementType: 'note',
        height: 150,
        projectViewId,
        style: {fill_color: noteColor},
        width: 200,
        x: pointerPosition.x - 100,
        y: pointerPosition.y - 75,
        zIndex: getNextCanvasZIndex(elements),
      }).then((element) => {
        setSelectedElementId(element.id)
        setEditingElementId(element.id)
      }).catch(() => undefined)
      return
    }

    if (activeTool === 'comment') {
      setSelectedElementId(null)
      setEditingElementId(null)
      void onCreateElement({
        content: '',
        elementType: 'comment',
        height: 24,
        projectViewId,
        width: 24,
        x: pointerPosition.x - 12,
        y: pointerPosition.y - 12,
        zIndex: getNextCanvasZIndex(elements),
      }).then((element) => {
        setSelectedElementId(element.id)
        setEditingElementId(element.id)
      }).catch(() => undefined)
      return
    }

    if (activeTool === 'pen') {
      event.currentTarget.setPointerCapture(event.pointerId)
      interactionRef.current = {
        pointerId: event.pointerId,
        points: [pointerPosition],
        type: 'drawing',
      }
      setPreviewDrawing({
        points: [pointerPosition],
        strokeColor: penColor,
        strokeWidth: penWidth,
      })
      setSelectedElementId(null)
      setEditingElementId(null)
      return
    }

    if (activeTool === 'shape') {
      event.currentTarget.setPointerCapture(event.pointerId)
      interactionRef.current = {
        current: pointerPosition,
        pointerId: event.pointerId,
        start: pointerPosition,
        type: 'shape',
      }
      setPreviewShape({
        fillColor: shapeFillColor,
        shapeType,
        strokeColor: '#17202b',
        strokeWidth: 2,
        ...normalizeCanvasRect(pointerPosition, pointerPosition, 16),
      })
      setSelectedElementId(null)
      setEditingElementId(null)
      return
    }

    setSelectedElementId(null)
    setEditingElementId(null)
  }, [
    activeTool,
    canEdit,
    elements,
    noteColor,
    onCreateElement,
    penColor,
    penWidth,
    setEditingElementId,
    setSelectedElementId,
    shapeFillColor,
    shapeType,
    viewport,
  ])

  const handleSurfacePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    if (interaction.type === 'panning') {
      const deltaX = event.clientX - interaction.startClientX
      const deltaY = event.clientY - interaction.startClientY

      setViewport({
        ...interaction.originViewport,
        x: interaction.originViewport.x + deltaX,
        y: interaction.originViewport.y + deltaY,
      })
      return
    }

    const surfaceRect = resolveSurfaceRect(surfaceRef.current)

    if (!surfaceRect) {
      return
    }

    const pointerPosition = getCanvasCoords(
      {clientX: event.clientX, clientY: event.clientY},
      surfaceRect,
      viewport,
    )

    if (interaction.type === 'dragging-element') {
      setDragPreview({
        elementId: interaction.elementId,
        x: pointerPosition.x - interaction.offsetX,
        y: pointerPosition.y - interaction.offsetY,
      })
      return
    }

    if (interaction.type === 'drawing') {
      const previousPoint = interaction.points[interaction.points.length - 1]

      if (!previousPoint || Math.hypot(pointerPosition.x - previousPoint.x, pointerPosition.y - previousPoint.y) < 1) {
        return
      }

      const nextPoints = [...interaction.points, pointerPosition]
      interactionRef.current = {
        ...interaction,
        points: nextPoints,
      }
      setPreviewDrawing({
        points: nextPoints,
        strokeColor: penColor,
        strokeWidth: penWidth,
      })
      return
    }

    if (interaction.type === 'shape') {
      interactionRef.current = {
        ...interaction,
        current: pointerPosition,
      }
      setPreviewShape({
        fillColor: shapeFillColor,
        shapeType,
        strokeColor: '#17202b',
        strokeWidth: 2,
        ...normalizeCanvasRect(interaction.start, pointerPosition, 16),
      })
    }
  }, [penColor, penWidth, setViewport, shapeFillColor, shapeType, viewport])

  const commitInteraction = useCallback((pointerId: number) => {
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== pointerId) {
      return
    }

    if (interaction.type === 'dragging-element') {
      const nextPosition = dragPreview

      clearTransientState()

      if (!nextPosition) {
        return
      }

      void onUpdateElement(interaction.elementId, {
        x: nextPosition.x,
        y: nextPosition.y,
        zIndex: getNextCanvasZIndex(elements),
      }).catch(() => undefined)
      return
    }

    if (interaction.type === 'drawing') {
      const nextPoints = interaction.points
      clearTransientState()

      if (nextPoints.length < 2) {
        return
      }

      const bounds = getCanvasBoundingBox(nextPoints)

      if (!bounds) {
        return
      }

      void onCreateElement({
        elementType: 'drawing',
        height: bounds.height,
        pathData: buildCanvasPathData(nextPoints, {x: bounds.x, y: bounds.y}),
        projectViewId,
        style: {
          stroke_color: penColor,
          stroke_opacity: 1,
          stroke_width: penWidth,
        },
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
        zIndex: getNextCanvasZIndex(elements),
      }).catch(() => undefined)
      return
    }

    if (interaction.type === 'shape') {
      const nextRect = normalizeCanvasRect(interaction.start, interaction.current, 16)
      clearTransientState()

      void onCreateElement({
        elementType: 'shape',
        height: nextRect.height,
        projectViewId,
        style: {
          fill_color: shapeFillColor,
          shape_type: shapeType,
          stroke_color: '#17202b',
          stroke_opacity: 1,
          stroke_width: 2,
        },
        width: nextRect.width,
        x: nextRect.x,
        y: nextRect.y,
        zIndex: getNextCanvasZIndex(elements),
      }).catch(() => undefined)
      return
    }

    clearTransientState()
  }, [
    clearTransientState,
    dragPreview,
    elements,
    onCreateElement,
    onUpdateElement,
    penColor,
    penWidth,
    projectViewId,
    shapeFillColor,
    shapeType,
  ])

  const handleSurfacePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    commitInteraction(event.pointerId)
  }, [commitInteraction])

  const handleSurfacePointerCancel = useCallback(() => {
    clearTransientState()
  }, [clearTransientState])

  const handleElementPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, element: CanvasElement) => {
    event.stopPropagation()
    surfaceRef.current?.focus()
    setSelectedElementId(element.id)
    setEditingElementId(null)

    if (!canEdit || activeTool !== 'select') {
      return
    }

    const surfaceRect = resolveSurfaceRect(surfaceRef.current)

    if (!surfaceRect) {
      return
    }

    const pointerPosition = getCanvasCoords(
      {clientX: event.clientX, clientY: event.clientY},
      surfaceRect,
      viewport,
    )

    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      elementId: element.id,
      offsetX: pointerPosition.x - element.x,
      offsetY: pointerPosition.y - element.y,
      pointerId: event.pointerId,
      type: 'dragging-element',
    }
    setDragPreview({
      elementId: element.id,
      x: element.x,
      y: element.y,
    })
  }, [activeTool, canEdit, setEditingElementId, setSelectedElementId, viewport])

  return {
    dragPreview,
    handleElementPointerDown,
    handleSurfacePointerCancel,
    handleSurfacePointerDown,
    handleSurfacePointerMove,
    handleSurfacePointerUp,
    handleSurfaceWheel,
    previewDrawing,
    previewShape,
    surfaceRef,
  }
}
