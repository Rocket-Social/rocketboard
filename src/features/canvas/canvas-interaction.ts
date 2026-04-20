import type {CanvasPoint, CanvasViewport} from './canvas.types'

export const MIN_CANVAS_ZOOM = 0.25
export const MAX_CANVAS_ZOOM = 2

type CanvasClientPoint = {
  clientX: number
  clientY: number
}

type CanvasRectLike = {
  left: number
  top: number
}

function roundCanvasNumber(value: number) {
  return Number(value.toFixed(2))
}

export function clampCanvasZoom(value: number) {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, roundCanvasNumber(value)))
}

export function getCanvasCoords(
  point: CanvasClientPoint,
  surfaceRect: CanvasRectLike,
  viewport: CanvasViewport,
): CanvasPoint {
  return {
    x: roundCanvasNumber((point.clientX - surfaceRect.left - viewport.x) / viewport.scale),
    y: roundCanvasNumber((point.clientY - surfaceRect.top - viewport.y) / viewport.scale),
  }
}

export function normalizeCanvasRect(
  start: CanvasPoint,
  end: CanvasPoint,
  minimumSize = 1,
) {
  const width = Math.max(minimumSize, Math.abs(end.x - start.x))
  const height = Math.max(minimumSize, Math.abs(end.y - start.y))

  return {
    height: roundCanvasNumber(height),
    width: roundCanvasNumber(width),
    x: roundCanvasNumber(Math.min(start.x, end.x)),
    y: roundCanvasNumber(Math.min(start.y, end.y)),
  }
}

export function getCanvasBoundingBox(points: CanvasPoint[]) {
  if (points.length === 0) {
    return null
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    height: roundCanvasNumber(Math.max(1, maxY - minY)),
    width: roundCanvasNumber(Math.max(1, maxX - minX)),
    x: roundCanvasNumber(minX),
    y: roundCanvasNumber(minY),
  }
}

export function buildCanvasPathData(points: CanvasPoint[], origin?: CanvasPoint) {
  if (points.length === 0) {
    return ''
  }

  const originX = origin?.x ?? 0
  const originY = origin?.y ?? 0

  return points
    .map((point, index) => {
      const x = roundCanvasNumber(point.x - originX)
      const y = roundCanvasNumber(point.y - originY)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}
