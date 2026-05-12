import type {CanvasElement, CanvasPoint} from './canvas.types'

const CANVAS_PASTE_OFFSET = 24
const CANVAS_PASTE_ANCHOR_MARGIN = 24
const CANVAS_PASTE_SOURCE_MARGIN = 24

function roundCanvasNumber(value: number) {
  return Number(value.toFixed(2))
}

function areCanvasPointsNear(left: CanvasPoint, right: CanvasPoint) {
  return (
    Math.abs(left.x - right.x) <= CANVAS_PASTE_ANCHOR_MARGIN
    && Math.abs(left.y - right.y) <= CANVAS_PASTE_ANCHOR_MARGIN
  )
}

function isPointerNearElement(
  pointer: CanvasPoint,
  element: Pick<CanvasElement, 'height' | 'width' | 'x' | 'y'>,
) {
  return (
    pointer.x >= element.x - CANVAS_PASTE_SOURCE_MARGIN
    && pointer.x <= element.x + element.width + CANVAS_PASTE_SOURCE_MARGIN
    && pointer.y >= element.y - CANVAS_PASTE_SOURCE_MARGIN
    && pointer.y <= element.y + element.height + CANVAS_PASTE_SOURCE_MARGIN
  )
}

export type CanvasClipboardShape = Pick<
  CanvasElement,
  'content' | 'elementType' | 'height' | 'pathData' | 'projectViewId' | 'style' | 'url' | 'width' | 'x' | 'y'
>

type CanvasPasteAnchorKind = 'pointer' | 'source'

export type CanvasClipboardPlacementState = {
  anchor: CanvasPoint
  anchorKind: CanvasPasteAnchorKind
  sequence: number
}

function resolveCanvasPasteAnchor(
  element: CanvasClipboardShape,
  lastPointerPosition: CanvasPoint | null,
): {anchor: CanvasPoint; anchorKind: CanvasPasteAnchorKind} {
  if (!lastPointerPosition || isPointerNearElement(lastPointerPosition, element)) {
    return {
      anchor: {
        x: element.x,
        y: element.y,
      },
      anchorKind: 'source',
    }
  }

  return {
    anchor: {
      x: roundCanvasNumber(lastPointerPosition.x - element.width / 2),
      y: roundCanvasNumber(lastPointerPosition.y - element.height / 2),
    },
    anchorKind: 'pointer',
  }
}

export function copyCanvasShape(element: CanvasElement): CanvasClipboardShape | null {
  if (element.elementType !== 'shape') {
    return null
  }

  return {
    content: element.content,
    elementType: element.elementType,
    height: element.height,
    pathData: element.pathData,
    projectViewId: element.projectViewId,
    style: {...element.style},
    url: element.url,
    width: element.width,
    x: element.x,
    y: element.y,
  }
}

export function resolveCanvasPastePlacement(
  element: CanvasClipboardShape,
  options: {
    lastPlacement: CanvasClipboardPlacementState | null
    lastPointerPosition: CanvasPoint | null
  },
) {
  const nextAnchor = resolveCanvasPasteAnchor(element, options.lastPointerPosition)
  const nextSequence = options.lastPlacement
    && options.lastPlacement.anchorKind === nextAnchor.anchorKind
    && areCanvasPointsNear(options.lastPlacement.anchor, nextAnchor.anchor)
    ? options.lastPlacement.sequence + 1
    // Keep the first source-anchored paste visibly offset from the original shape.
    : nextAnchor.anchorKind === 'source'
      ? 1
      : 0
  const nextPlacement: CanvasClipboardPlacementState = {
    anchor: nextAnchor.anchor,
    anchorKind: nextAnchor.anchorKind,
    sequence: nextSequence,
  }

  return {
    nextPlacement,
    x: roundCanvasNumber(nextPlacement.anchor.x + nextPlacement.sequence * CANVAS_PASTE_OFFSET),
    y: roundCanvasNumber(nextPlacement.anchor.y + nextPlacement.sequence * CANVAS_PASTE_OFFSET),
  }
}
