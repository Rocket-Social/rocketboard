import {useCallback, useRef, useState} from 'react'
import type {PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent} from 'react'

import {
  areCanvasElementFramesEqual,
  buildCanvasPathData,
  CANVAS_OBJECT_SNAP_TOLERANCE_PX,
  CANVAS_SIZE_GUIDE_OFFSET_PX,
  CANVAS_SPACING_GUIDE_CAP_PX,
  doCanvasElementFramesIntersect,
  getCanvasBoundingBox,
  getCanvasCoords,
  getCanvasElementFrame,
  getCanvasSnappedMoveFrame,
  getCanvasSnappedResizeFrame,
  getCanvasSpacingSnapReference,
  getCanvasWheelPanDelta,
  getCanvasWheelZoomDelta,
  getNextCanvasWheelZoom,
  normalizeCanvasRect,
  shouldZoomCanvasWheel,
  type CanvasSnapReferenceFrame,
  type CanvasSpacingSnapReference,
} from './canvas-interaction'
import {
  DEFAULT_CANVAS_SHAPE_STROKE_COLOR,
  DEFAULT_CANVAS_SHAPE_STROKE_OPACITY,
  DEFAULT_CANVAS_SHAPE_STROKE_STYLE,
  DEFAULT_CANVAS_SHAPE_STROKE_WIDTH,
  DEFAULT_CANVAS_SHAPE_TEXT_ALIGN,
  DEFAULT_CANVAS_SHAPE_TEXT_FAMILY,
  DEFAULT_CANVAS_SHAPE_TEXT_SIZE,
  CANVAS_ELEMENT_BATCH_MUTATION_LIMIT,
  type CanvasElement,
  type CanvasElementBatchUpdateInput,
  type CanvasElementFrame,
  type CanvasElementCreateInput,
  type CanvasElementTransformPreview,
  type CanvasElementUpdateInput,
  type CanvasPoint,
  type CanvasResizeHandle,
  type CanvasShapeType,
  type CanvasToolMode,
  type CanvasViewport,
} from './canvas.types'

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

type PreviewSelectionMarquee = CanvasElementFrame

type CanvasDragOriginFrame = CanvasElementFrame & {
  elementId: string
}

type UseCanvasInteractionOptions = {
  activeTool: CanvasToolMode
  canEdit: boolean
  elements: CanvasElement[]
  noteColor: string
  onCreateElement: (input: CanvasElementCreateInput) => Promise<CanvasElement>
  onSelectionLimitExceeded?: (limit: number) => void
  onUpdateElement: (elementId: string, updates: CanvasElementUpdateInput) => Promise<CanvasElement | void>
  onUpdateElements?: (inputs: CanvasElementBatchUpdateInput[]) => Promise<CanvasElement[] | void>
  penColor: string
  penWidth: number
  projectViewId: string
  selectedElementIds?: string[]
  setEditingElementId: (elementId: string | null) => void
  setSelectedElementId: (elementId: string | null) => void
  setSelectedElementIds?: (elementIds: string[]) => void
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
      didMove: boolean
      isAdditive: boolean
      originSelectedElementIds: string[]
      pointerId: number
      start: CanvasPoint
      startClientX: number
      startClientY: number
      type: 'marquee-select'
    }
  | {
      current: CanvasPoint
      pointerId: number
      start: CanvasPoint
      type: 'shape'
    }
  | {
      elementId: string
      elementIds: string[]
      originFrame: CanvasElementFrame
      originFrames: CanvasDragOriginFrame[]
      offsetX: number
      offsetY: number
      pointerId: number
      snapReferenceFrames: CanvasSnapReferenceFrame[]
      spacingSnapReference: CanvasSpacingSnapReference
      startClientX: number
      startClientY: number
      type: 'dragging-element'
    }
  | {
      elementId: string
      handle: CanvasResizeHandle
      originFrame: CanvasElementFrame
      pointerId: number
      snapReferenceFrames: CanvasSnapReferenceFrame[]
      startClientX: number
      startClientY: number
      type: 'resizing-element'
    }
  | {
      pointerId: number
      points: CanvasPoint[]
      type: 'drawing'
    }

type CanvasPointerClientPosition = {
  clientX: number
  clientY: number
}

const MIN_CANVAS_SHAPE_SIZE = 16
const MIN_TRANSFORM_POINTER_DELTA_PX = 2
const MIN_MARQUEE_POINTER_DELTA_PX = 2

function getNextCanvasZIndex(elements: CanvasElement[]) {
  return elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex), 0) + 1
}

function getCanvasBringToFrontZIndex(elements: CanvasElement[], elementId: string) {
  const element = elements.find((candidate) => candidate.id === elementId)

  if (!element) {
    return null
  }

  const maxCompetingZIndex = elements.reduce((maxZIndex, candidate) => {
    if (candidate.id === elementId) {
      return maxZIndex
    }

    return Math.max(maxZIndex, candidate.zIndex)
  }, Number.NEGATIVE_INFINITY)

  return maxCompetingZIndex >= element.zIndex ? maxCompetingZIndex + 1 : null
}

function getCanvasSnapTolerance(viewport: CanvasViewport) {
  return CANVAS_OBJECT_SNAP_TOLERANCE_PX / viewport.scale
}

function getCanvasSizeGuideOffset(viewport: CanvasViewport) {
  return CANVAS_SIZE_GUIDE_OFFSET_PX / viewport.scale
}

function getCanvasSpacingGuideCapSize(viewport: CanvasViewport) {
  return CANVAS_SPACING_GUIDE_CAP_PX / viewport.scale
}

function getCanvasSnapReferenceFrames(elements: CanvasElement[], elementIds: string | string[]): CanvasSnapReferenceFrame[] {
  const ignoredElementIds = new Set(Array.isArray(elementIds) ? elementIds : [elementIds])

  return elements
    .filter((element) => !ignoredElementIds.has(element.id) && element.width > 0 && element.height > 0)
    .map((element) => getCanvasElementFrame(element))
}

function hasCanvasTransformGuides(preview: CanvasElementTransformPreview) {
  return Boolean(preview.guides && (
    preview.guides.alignment.length > 0
    || preview.guides.size.length > 0
    || (preview.guides.spacing?.length ?? 0) > 0
  ))
}

function resolveSurfaceRect(surface: HTMLDivElement | null) {
  if (!surface) {
    return null
  }

  return surface.getBoundingClientRect()
}

function resolveCanvasMarqueeSelection(
  elements: CanvasElement[],
  marqueeFrame: CanvasElementFrame,
  originSelectedElementIds: string[],
  isAdditive: boolean,
) {
  const marqueeElementIds = elements
    .filter((element) => element.width > 0 && element.height > 0)
    .filter((element) => doCanvasElementFramesIntersect(getCanvasElementFrame(element), marqueeFrame))
    .map((element) => element.id)

  if (!isAdditive) {
    return marqueeElementIds
  }

  const nextElementIds = [...originSelectedElementIds]
  const selectedElementIdSet = new Set(nextElementIds)

  marqueeElementIds.forEach((elementId) => {
    if (!selectedElementIdSet.has(elementId)) {
      selectedElementIdSet.add(elementId)
      nextElementIds.push(elementId)
    }
  })

  return nextElementIds
}

function areCanvasElementIdListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((elementId, index) => elementId === right[index])
}

export function useCanvasInteraction({
  activeTool,
  canEdit,
  elements,
  noteColor,
  onCreateElement,
  onSelectionLimitExceeded,
  onUpdateElement,
  onUpdateElements,
  penColor,
  penWidth,
  projectViewId,
  selectedElementIds = [],
  setEditingElementId,
  setSelectedElementId,
  setSelectedElementIds,
  setViewport,
  shapeFillColor,
  shapeType,
  viewport,
}: UseCanvasInteractionOptions) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const interactionRef = useRef<InteractionState | null>(null)
  const lastPointerClientPositionRef = useRef<CanvasPointerClientPosition | null>(null)
  const selectionLimitExceededRef = useRef(false)
  const selectedElementIdsPropRef = useRef(selectedElementIds)
  const selectedElementIdsRef = useRef(selectedElementIds)
  const transformPreviewsRef = useRef<CanvasElementTransformPreview[]>([])
  const viewportRef = useRef(viewport)
  const [transformPreviewsState, setTransformPreviewsState] = useState<CanvasElementTransformPreview[]>([])
  const [previewDrawing, setPreviewDrawing] = useState<PreviewDrawing | null>(null)
  const [previewShape, setPreviewShape] = useState<PreviewShape | null>(null)
  const [previewSelectionMarquee, setPreviewSelectionMarquee] = useState<PreviewSelectionMarquee | null>(null)
  const transformPreview = transformPreviewsState.find((preview) => preview.guides) ?? transformPreviewsState[0] ?? null

  viewportRef.current = viewport
  if (!areCanvasElementIdListsEqual(selectedElementIdsPropRef.current, selectedElementIds)) {
    selectedElementIdsPropRef.current = selectedElementIds
    selectedElementIdsRef.current = selectedElementIds
  }

  const setTransformPreviews = useCallback((value: CanvasElementTransformPreview[]) => {
    transformPreviewsRef.current = value
    setTransformPreviewsState(value)
  }, [])

  const applySelectedElementIds = useCallback((elementIds: string[]) => {
    const didExceedLimit = elementIds.length > CANVAS_ELEMENT_BATCH_MUTATION_LIMIT
    const nextElementIds = didExceedLimit
      ? elementIds.slice(0, CANVAS_ELEMENT_BATCH_MUTATION_LIMIT)
      : elementIds

    if (didExceedLimit && !selectionLimitExceededRef.current) {
      onSelectionLimitExceeded?.(CANVAS_ELEMENT_BATCH_MUTATION_LIMIT)
    }

    selectionLimitExceededRef.current = didExceedLimit

    if (areCanvasElementIdListsEqual(selectedElementIdsRef.current, nextElementIds)) {
      return
    }

    selectedElementIdsRef.current = nextElementIds

    if (setSelectedElementIds) {
      setSelectedElementIds(nextElementIds)
      return
    }

    setSelectedElementId(nextElementIds[0] ?? null)
  }, [onSelectionLimitExceeded, setSelectedElementId, setSelectedElementIds])

  const clearTransientState = useCallback(() => {
    interactionRef.current = null
    setTransformPreviews([])
    setPreviewDrawing(null)
    setPreviewShape(null)
    setPreviewSelectionMarquee(null)
  }, [setTransformPreviews])

  const rememberPointerClientPosition = useCallback((clientX: number, clientY: number) => {
    lastPointerClientPositionRef.current = {
      clientX,
      clientY,
    }
  }, [])

  const resolveCanvasPointerPosition = useCallback((
    clientX: number,
    clientY: number,
    viewportValue: CanvasViewport = viewportRef.current,
  ) => {
    const surfaceRect = resolveSurfaceRect(surfaceRef.current)

    if (!surfaceRect) {
      return null
    }

    return getCanvasCoords(
      {clientX, clientY},
      surfaceRect,
      viewportValue,
    )
  }, [])

  const capturePointerPosition = useCallback((clientX: number, clientY: number) => {
    rememberPointerClientPosition(clientX, clientY)
    return resolveCanvasPointerPosition(clientX, clientY)
  }, [rememberPointerClientPosition, resolveCanvasPointerPosition])

  const getLastPointerCanvasPosition = useCallback(() => {
    const lastPointerClientPosition = lastPointerClientPositionRef.current

    if (!lastPointerClientPosition) {
      return null
    }

    return resolveCanvasPointerPosition(
      lastPointerClientPosition.clientX,
      lastPointerClientPosition.clientY,
    )
  }, [resolveCanvasPointerPosition])

  const handleSurfaceWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const surfaceRect = resolveSurfaceRect(surfaceRef.current)

    if (!surfaceRect) {
      return
    }

    rememberPointerClientPosition(event.clientX, event.clientY)
    event.preventDefault()

    if (shouldZoomCanvasWheel(event)) {
      const zoomDelta = getCanvasWheelZoomDelta(event)

      setViewport((currentViewport) => {
        const pointerPosition = getCanvasCoords(
          {clientX: event.clientX, clientY: event.clientY},
          surfaceRect,
          currentViewport,
        )
        const nextScale = getNextCanvasWheelZoom(currentViewport.scale, zoomDelta)

        const nextViewport = {
          scale: nextScale,
          x: event.clientX - surfaceRect.left - pointerPosition.x * nextScale,
          y: event.clientY - surfaceRect.top - pointerPosition.y * nextScale,
        }

        viewportRef.current = nextViewport
        return nextViewport
      })
      return
    }

    const panDelta = getCanvasWheelPanDelta(event)

    setViewport((currentViewport) => {
      const nextViewport = {
        ...currentViewport,
        x: currentViewport.x - panDelta.x,
        y: currentViewport.y - panDelta.y,
      }

      viewportRef.current = nextViewport
      return nextViewport
    })
  }, [rememberPointerClientPosition, setViewport])

  const handleSurfacePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      return
    }

    const pointerPosition = capturePointerPosition(event.clientX, event.clientY)

    if (!pointerPosition) {
      return
    }

    surfaceRef.current?.focus()

    if (!canEdit || activeTool === 'hand') {
      event.currentTarget.setPointerCapture(event.pointerId)
      interactionRef.current = {
        originViewport: viewportRef.current,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        type: 'panning',
      }
      return
    }

    if (activeTool === 'note') {
      applySelectedElementIds([])
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
        applySelectedElementIds([element.id])
        setEditingElementId(element.id)
      }).catch(() => undefined)
      return
    }

    if (activeTool === 'comment') {
      applySelectedElementIds([])
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
        applySelectedElementIds([element.id])
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
      applySelectedElementIds([])
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
        strokeColor: DEFAULT_CANVAS_SHAPE_STROKE_COLOR,
        strokeWidth: DEFAULT_CANVAS_SHAPE_STROKE_WIDTH,
        ...normalizeCanvasRect(pointerPosition, pointerPosition, 16),
      })
      applySelectedElementIds([])
      setEditingElementId(null)
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      current: pointerPosition,
      didMove: false,
      isAdditive: event.shiftKey,
      originSelectedElementIds: selectedElementIds,
      pointerId: event.pointerId,
      start: pointerPosition,
      startClientX: event.clientX,
      startClientY: event.clientY,
      type: 'marquee-select',
    }
    setEditingElementId(null)
  }, [
    activeTool,
    applySelectedElementIds,
    canEdit,
    elements,
    noteColor,
    onCreateElement,
    penColor,
    penWidth,
    selectedElementIds,
    setEditingElementId,
    shapeFillColor,
    shapeType,
    capturePointerPosition,
  ])

  const handleSurfacePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    rememberPointerClientPosition(event.clientX, event.clientY)
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== event.pointerId) {
      return
    }

    if (interaction.type === 'panning') {
      const nextViewport = {
        ...interaction.originViewport,
        x: interaction.originViewport.x + (event.clientX - interaction.startClientX),
        y: interaction.originViewport.y + (event.clientY - interaction.startClientY),
      }

      viewportRef.current = nextViewport
      setViewport(nextViewport)
      return
    }

    const pointerPosition = resolveCanvasPointerPosition(event.clientX, event.clientY)

    if (!pointerPosition) {
      return
    }

    if (interaction.type === 'dragging-element') {
      if (Math.hypot(
        event.clientX - interaction.startClientX,
        event.clientY - interaction.startClientY,
      ) < MIN_TRANSFORM_POINTER_DELTA_PX) {
        setTransformPreviews([])
        return
      }

      const nextFrame = {
        ...interaction.originFrame,
        x: pointerPosition.x - interaction.offsetX,
        y: pointerPosition.y - interaction.offsetY,
      }
      const snappedMove = getCanvasSnappedMoveFrame(
        nextFrame,
        interaction.snapReferenceFrames,
        getCanvasSnapTolerance(viewport),
        getCanvasSpacingGuideCapSize(viewport),
        interaction.spacingSnapReference,
      )
      const deltaX = snappedMove.frame.x - interaction.originFrame.x
      const deltaY = snappedMove.frame.y - interaction.originFrame.y
      const nextPreview = {
        elementId: interaction.elementId,
        ...snappedMove.frame,
        guides: snappedMove.guides,
      }
      const nextPreviews = interaction.originFrames.map((originFrame) => ({
        elementId: originFrame.elementId,
        height: originFrame.height,
        width: originFrame.width,
        x: originFrame.x + deltaX,
        y: originFrame.y + deltaY,
        ...(originFrame.elementId === interaction.elementId ? {guides: snappedMove.guides} : {}),
      }))

      setTransformPreviews(
        areCanvasElementFramesEqual(snappedMove.frame, interaction.originFrame) && !hasCanvasTransformGuides(nextPreview)
          ? []
          : nextPreviews,
      )
      return
    }

    if (interaction.type === 'marquee-select') {
      const didMove = interaction.didMove || Math.hypot(
        event.clientX - interaction.startClientX,
        event.clientY - interaction.startClientY,
      ) >= MIN_MARQUEE_POINTER_DELTA_PX

      const nextMarquee = normalizeCanvasRect(interaction.start, pointerPosition, 1)
      const nextInteraction = {
        ...interaction,
        current: pointerPosition,
        didMove,
      }

      interactionRef.current = nextInteraction

      if (!didMove) {
        setPreviewSelectionMarquee(null)
        return
      }

      setPreviewSelectionMarquee(nextMarquee)
      applySelectedElementIds(resolveCanvasMarqueeSelection(
        elements,
        nextMarquee,
        interaction.originSelectedElementIds,
        interaction.isAdditive,
      ))
      return
    }

    if (interaction.type === 'resizing-element') {
      if (Math.hypot(
        event.clientX - interaction.startClientX,
        event.clientY - interaction.startClientY,
      ) < MIN_TRANSFORM_POINTER_DELTA_PX) {
        setTransformPreviews([])
        return
      }

      const snappedResize = getCanvasSnappedResizeFrame(
        interaction.originFrame,
        interaction.handle,
        pointerPosition,
        interaction.snapReferenceFrames,
        MIN_CANVAS_SHAPE_SIZE,
        getCanvasSnapTolerance(viewport),
        getCanvasSizeGuideOffset(viewport),
      )
      const nextFrame = snappedResize.frame
      const nextPreview = {
        elementId: interaction.elementId,
        ...nextFrame,
        guides: snappedResize.guides,
      }

      setTransformPreviews(
        areCanvasElementFramesEqual(nextFrame, interaction.originFrame) && !hasCanvasTransformGuides(nextPreview)
          ? []
          : [nextPreview],
      )
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
        strokeColor: DEFAULT_CANVAS_SHAPE_STROKE_COLOR,
        strokeWidth: DEFAULT_CANVAS_SHAPE_STROKE_WIDTH,
        ...normalizeCanvasRect(interaction.start, pointerPosition, 16),
      })
    }
  }, [
    applySelectedElementIds,
    elements,
    penColor,
    penWidth,
    rememberPointerClientPosition,
    resolveCanvasPointerPosition,
    setTransformPreviews,
    setViewport,
    shapeFillColor,
    shapeType,
    viewport,
  ])

  const commitInteraction = useCallback((pointerId: number) => {
    const interaction = interactionRef.current

    if (!interaction || interaction.pointerId !== pointerId) {
      return
    }

    if (interaction.type === 'dragging-element') {
      const nextFrames = transformPreviewsRef.current
      const nextFrame = nextFrames.find((frame) => frame.elementId === interaction.elementId) ?? null
      const zIndex = interaction.elementIds.length === 1
        ? getCanvasBringToFrontZIndex(elements, interaction.elementId)
        : null

      clearTransientState()

      if (!nextFrame || areCanvasElementFramesEqual(nextFrame, interaction.originFrame)) {
        return
      }

      const nextFrameById = new Map(nextFrames.map((frame) => [frame.elementId, frame]))

      const updates = interaction.originFrames.reduce<CanvasElementBatchUpdateInput[]>((nextUpdates, originFrame) => {
        const previewFrame = nextFrameById.get(originFrame.elementId)

        if (!previewFrame || areCanvasElementFramesEqual(previewFrame, originFrame)) {
          return nextUpdates
        }

        nextUpdates.push({
          elementId: originFrame.elementId,
          updates: {
            x: previewFrame.x,
            y: previewFrame.y,
            ...(originFrame.elementId === interaction.elementId && zIndex !== null ? {zIndex} : {}),
          },
        })

        return nextUpdates
      }, [])

      if (updates.length === 0) {
        return
      }

      if (updates.length > 1 && onUpdateElements) {
        void onUpdateElements(updates).catch(() => undefined)
        return
      }

      updates.forEach(({elementId, updates: elementUpdates}) => {
        void onUpdateElement(elementId, elementUpdates).catch(() => undefined)
      })
      return
    }

    if (interaction.type === 'marquee-select') {
      if (!interaction.didMove) {
        applySelectedElementIds(interaction.isAdditive ? interaction.originSelectedElementIds : [])
      }

      clearTransientState()
      return
    }

    if (interaction.type === 'resizing-element') {
      const nextFrame = transformPreviewsRef.current.find((frame) => frame.elementId === interaction.elementId) ?? null
      const zIndex = getCanvasBringToFrontZIndex(elements, interaction.elementId)

      clearTransientState()

      if (!nextFrame || areCanvasElementFramesEqual(nextFrame, interaction.originFrame)) {
        return
      }

      void onUpdateElement(interaction.elementId, {
        height: nextFrame.height,
        width: nextFrame.width,
        x: nextFrame.x,
        y: nextFrame.y,
        ...(zIndex === null ? {} : {zIndex}),
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
          rich_text: null,
          shape_type: shapeType,
          stroke_color: DEFAULT_CANVAS_SHAPE_STROKE_COLOR,
          stroke_opacity: DEFAULT_CANVAS_SHAPE_STROKE_OPACITY,
          stroke_style: DEFAULT_CANVAS_SHAPE_STROKE_STYLE,
          stroke_width: DEFAULT_CANVAS_SHAPE_STROKE_WIDTH,
          text_align: DEFAULT_CANVAS_SHAPE_TEXT_ALIGN,
          text_family: DEFAULT_CANVAS_SHAPE_TEXT_FAMILY,
          text_size: DEFAULT_CANVAS_SHAPE_TEXT_SIZE,
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
    applySelectedElementIds,
    clearTransientState,
    elements,
    onCreateElement,
    onUpdateElement,
    onUpdateElements,
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
    const interaction = interactionRef.current

    if (interaction?.type === 'marquee-select') {
      applySelectedElementIds(interaction.originSelectedElementIds)
    }

    clearTransientState()
  }, [applySelectedElementIds, clearTransientState])

  const handleElementPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, element: CanvasElement) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      return
    }

    event.stopPropagation()
    rememberPointerClientPosition(event.clientX, event.clientY)
    surfaceRef.current?.focus()
    setEditingElementId(null)

    if (canEdit && activeTool === 'select' && event.shiftKey) {
      const isSelected = selectedElementIds.includes(element.id)
      applySelectedElementIds(isSelected
        ? selectedElementIds.filter((elementId) => elementId !== element.id)
        : [...selectedElementIds, element.id])
      return
    }

    if (!canEdit || activeTool !== 'select') {
      applySelectedElementIds([element.id])
      return
    }

    const isSelected = selectedElementIds.includes(element.id)
    const dragElementIds = isSelected ? selectedElementIds : [element.id]

    if (!isSelected) {
      applySelectedElementIds([element.id])
    }

    const pointerPosition = resolveCanvasPointerPosition(event.clientX, event.clientY)

    if (!pointerPosition) {
      return
    }

    const originFrame = getCanvasElementFrame(element)
    const selectedElementIdSet = new Set(dragElementIds)
    const originFrames = elements
      .filter((candidate) => selectedElementIdSet.has(candidate.id))
      .map((candidate) => ({
        elementId: candidate.id,
        ...getCanvasElementFrame(candidate),
      }))

    const snapReferenceFrames = getCanvasSnapReferenceFrames(elements, dragElementIds)

    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      elementId: element.id,
      elementIds: dragElementIds,
      originFrame,
      originFrames,
      offsetX: pointerPosition.x - element.x,
      offsetY: pointerPosition.y - element.y,
      pointerId: event.pointerId,
      snapReferenceFrames,
      spacingSnapReference: getCanvasSpacingSnapReference(snapReferenceFrames),
      startClientX: event.clientX,
      startClientY: event.clientY,
      type: 'dragging-element',
    }
    setTransformPreviews([])
  }, [
    activeTool,
    applySelectedElementIds,
    canEdit,
    elements,
    rememberPointerClientPosition,
    resolveCanvasPointerPosition,
    selectedElementIds,
    setEditingElementId,
    setTransformPreviews,
  ])

  const handleResizeHandlePointerDown = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    element: CanvasElement,
    handle: CanvasResizeHandle,
  ) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      return
    }

    event.stopPropagation()
    rememberPointerClientPosition(event.clientX, event.clientY)
    surfaceRef.current?.focus()
    applySelectedElementIds([element.id])
    setEditingElementId(null)

    if (!canEdit || activeTool !== 'select' || element.elementType !== 'shape') {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      elementId: element.id,
      handle,
      originFrame: getCanvasElementFrame(element),
      pointerId: event.pointerId,
      snapReferenceFrames: getCanvasSnapReferenceFrames(elements, element.id),
      startClientX: event.clientX,
      startClientY: event.clientY,
      type: 'resizing-element',
    }
    setTransformPreviews([])
  }, [
    activeTool,
    applySelectedElementIds,
    canEdit,
    elements,
    rememberPointerClientPosition,
    setEditingElementId,
    setTransformPreviews,
  ])

  return {
    handleElementPointerDown,
    handleResizeHandlePointerDown,
    getLastPointerCanvasPosition,
    handleSurfacePointerCancel,
    handleSurfacePointerDown,
    handleSurfacePointerMove,
    handleSurfacePointerUp,
    handleSurfaceWheel,
    previewDrawing,
    previewSelectionMarquee,
    previewShape,
    surfaceRef,
    transformPreview,
    transformPreviews: transformPreviewsState,
  }
}
