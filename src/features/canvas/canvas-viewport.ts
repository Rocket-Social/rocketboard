import {clampCanvasZoom} from './canvas-interaction'
import {DEFAULT_CANVAS_VIEWPORT, type CanvasElementFrame, type CanvasViewport} from './canvas.types'

export const CANVAS_ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const

const CANVAS_FIT_PADDING_PX = 80

type CanvasSurfaceSize = {
  height: number
  width: number
}

function isFiniteCanvasFrame(frame: CanvasElementFrame) {
  const right = frame.x + frame.width
  const bottom = frame.y + frame.height

  return [
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    right,
    bottom,
  ].every(Number.isFinite)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatCanvasZoomLabel(scale: number) {
  const normalizedScale = isFiniteNumber(scale) ? scale : DEFAULT_CANVAS_VIEWPORT.scale

  return `${Math.round(normalizedScale * 100)}%`
}

export function normalizeCanvasViewport(viewport: unknown): CanvasViewport | null {
  if (!viewport || typeof viewport !== 'object') {
    return null
  }

  const candidate = viewport as Partial<CanvasViewport>

  if (!isFiniteNumber(candidate.scale) || !isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) {
    return null
  }

  return {
    scale: clampCanvasZoom(candidate.scale),
    x: candidate.x,
    y: candidate.y,
  }
}

export function getCanvasViewportForZoom(
  currentViewport: CanvasViewport,
  nextScale: number,
  surfaceSize: CanvasSurfaceSize | null,
): CanvasViewport {
  const scale = clampCanvasZoom(nextScale)

  if (!surfaceSize) {
    return {
      ...currentViewport,
      scale,
    }
  }

  const centerX = surfaceSize.width / 2
  const centerY = surfaceSize.height / 2
  const canvasCenterX = (centerX - currentViewport.x) / currentViewport.scale
  const canvasCenterY = (centerY - currentViewport.y) / currentViewport.scale

  return {
    scale,
    x: centerX - canvasCenterX * scale,
    y: centerY - canvasCenterY * scale,
  }
}

export function getCanvasViewportForFit(
  frames: CanvasElementFrame[],
  surfaceSize: CanvasSurfaceSize | null,
): CanvasViewport {
  if (frames.length === 0 || !surfaceSize) {
    return {...DEFAULT_CANVAS_VIEWPORT}
  }

  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  frames.forEach((frame) => {
    if (!isFiniteCanvasFrame(frame)) {
      return
    }

    left = Math.min(left, frame.x)
    top = Math.min(top, frame.y)
    right = Math.max(right, frame.x + frame.width)
    bottom = Math.max(bottom, frame.y + frame.height)
  })

  if (![left, top, right, bottom].every(Number.isFinite)) {
    return {...DEFAULT_CANVAS_VIEWPORT}
  }

  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const scale = clampCanvasZoom(Math.min(
    (surfaceSize.width - CANVAS_FIT_PADDING_PX * 2) / width,
    (surfaceSize.height - CANVAS_FIT_PADDING_PX * 2) / height,
  ))

  return {
    scale,
    x: surfaceSize.width / 2 - (left + width / 2) * scale,
    y: surfaceSize.height / 2 - (top + height / 2) * scale,
  }
}
