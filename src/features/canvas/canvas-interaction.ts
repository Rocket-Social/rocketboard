import type {
  CanvasAlignmentGuide,
  CanvasElement,
  CanvasElementFrame,
  CanvasElementTransformPreview,
  CanvasPoint,
  CanvasResizeHandle,
  CanvasSizeGuide,
  CanvasSpacingGuide,
  CanvasSpacingGuideSegment,
  CanvasTransformGuides,
  CanvasViewport,
} from './canvas.types'

export const MIN_CANVAS_ZOOM = 0.25
export const MAX_CANVAS_ZOOM = 2
export const CANVAS_WHEEL_ZOOM_STEP = 0.04
export const CANVAS_OBJECT_SNAP_TOLERANCE_PX = 6
export const CANVAS_SIZE_GUIDE_OFFSET_PX = 6
export const CANVAS_SPACING_GUIDE_CAP_PX = 10
export const CANVAS_MAX_SPACING_GUIDE_SEGMENTS = 6
export const CANVAS_MAX_SPACING_SNAP_REFERENCE_FRAMES = 250
const CANVAS_WHEEL_LINE_DELTA_PX = 16
const CANVAS_WHEEL_PAGE_DELTA_PX = 800
const CANVAS_GUIDE_MATCH_EPSILON = 0.01
const CANVAS_SPACING_GAP_MATCH_TOLERANCE = 1
const CANVAS_MAX_ALIGNMENT_GUIDES = 4

const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2

type CanvasSnapAxis = 'x' | 'y'
type CanvasSnapPoint = 'start' | 'center' | 'end'

export type CanvasSnapReferenceFrame = CanvasElementFrame
export type CanvasTransformPreviewLookup = Map<string, CanvasElementTransformPreview>

type CanvasAlignmentCandidate = {
  activePoint: CanvasSnapPoint
  axis: CanvasSnapAxis
  delta: number
  distance: number
  targetFrame: CanvasSnapReferenceFrame
  targetPoint: CanvasSnapPoint
}

type CanvasSizeCandidate = {
  axis: CanvasSizeGuide['axis']
  distance: number
  matchedSize: number
  targetFrame: CanvasSnapReferenceFrame
}

type CanvasReferenceSpacingGap = {
  afterFrame: CanvasSnapReferenceFrame
  beforeFrame: CanvasSnapReferenceFrame
  gap: number
}

type CanvasSpacingSnapAxisReference = {
  gapCounts: Map<number, number[]>
  gaps: CanvasReferenceSpacingGap[]
}

export type CanvasSpacingSnapReference = {
  x: CanvasSpacingSnapAxisReference
  y: CanvasSpacingSnapAxisReference
}

type CanvasSpacingCandidate = {
  axis: CanvasSnapAxis
  delta: number
  distance: number
  neighborFrame: CanvasSnapReferenceFrame
  placement: 'after' | 'before' | 'between'
  sourceGap: CanvasReferenceSpacingGap
  sourceGapCount: number
  spacing: number
}

type CanvasResizeAlignmentCandidate = CanvasAlignmentCandidate & {
  controlDelta: number
}

type CanvasSnapResult = {
  frame: CanvasElementFrame
  guides: CanvasTransformGuides
}

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

function normalizeCanvasWheelDelta(delta: number, deltaMode: number) {
  switch (deltaMode) {
    case DOM_DELTA_LINE:
      return delta * CANVAS_WHEEL_LINE_DELTA_PX
    case DOM_DELTA_PAGE:
      return delta * CANVAS_WHEEL_PAGE_DELTA_PX
    case DOM_DELTA_PIXEL:
    default:
      return delta
  }
}

export function clampCanvasZoom(value: number) {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, roundCanvasNumber(value)))
}

export function getNextCanvasWheelZoom(currentScale: number, deltaY: number) {
  if (deltaY === 0) {
    return clampCanvasZoom(currentScale)
  }

  const zoomFactor = deltaY < 0 ? 1 + CANVAS_WHEEL_ZOOM_STEP : 1 / (1 + CANVAS_WHEEL_ZOOM_STEP)
  return clampCanvasZoom(currentScale * zoomFactor)
}

export function getCanvasWheelZoomDelta(event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY'>) {
  return normalizeCanvasWheelDelta(event.deltaY, event.deltaMode)
}

export function getCanvasWheelPanDelta(event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY' | 'shiftKey'>) {
  const deltaX = normalizeCanvasWheelDelta(event.deltaX, event.deltaMode)
  const deltaY = normalizeCanvasWheelDelta(event.deltaY, event.deltaMode)

  if (event.shiftKey && deltaX === 0 && deltaY !== 0) {
    return {
      x: deltaY,
      y: 0,
    }
  }

  return {
    x: deltaX,
    y: deltaY,
  }
}

export function shouldZoomCanvasWheel(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey'>) {
  return event.ctrlKey || event.metaKey
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

export function getCanvasElementFrame(frame: CanvasElementFrame) {
  return {
    height: roundCanvasNumber(frame.height),
    width: roundCanvasNumber(frame.width),
    x: roundCanvasNumber(frame.x),
    y: roundCanvasNumber(frame.y),
  }
}

export function areCanvasElementFramesEqual(left: CanvasElementFrame, right: CanvasElementFrame) {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
}

export function doCanvasElementFramesIntersect(left: CanvasElementFrame, right: CanvasElementFrame) {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y
}

export function createCanvasTransformPreviewLookup(
  transformPreview: CanvasElementTransformPreview | null,
  transformPreviews: CanvasElementTransformPreview[] = [],
): CanvasTransformPreviewLookup {
  const lookup: CanvasTransformPreviewLookup = new Map(
    transformPreviews.map((preview) => [preview.elementId, preview]),
  )

  if (transformPreview && !lookup.has(transformPreview.elementId)) {
    lookup.set(transformPreview.elementId, transformPreview)
  }

  return lookup
}

export function getCanvasRenderedElementFrame(
  element: CanvasElement,
  transformPreviewLookup: CanvasTransformPreviewLookup,
) {
  const preview = transformPreviewLookup.get(element.id)

  return preview ? getCanvasElementFrame(preview) : getCanvasElementFrame(element)
}

function createEmptyTransformGuides(): CanvasTransformGuides {
  return {
    alignment: [],
    size: [],
    spacing: [],
  }
}

function getCanvasFrameAxisValue(
  frame: CanvasElementFrame,
  axis: CanvasSnapAxis,
  point: CanvasSnapPoint,
) {
  if (axis === 'x') {
    switch (point) {
      case 'start':
        return frame.x
      case 'center':
        return frame.x + frame.width / 2
      case 'end':
        return frame.x + frame.width
      default: {
        const exhaustivePoint: never = point
        throw new Error(`Unsupported canvas snap point: ${exhaustivePoint}`)
      }
    }
  }

  switch (point) {
    case 'start':
      return frame.y
    case 'center':
      return frame.y + frame.height / 2
    case 'end':
      return frame.y + frame.height
    default: {
      const exhaustivePoint: never = point
      throw new Error(`Unsupported canvas snap point: ${exhaustivePoint}`)
    }
  }
}

function getCanvasFrameAxisStart(frame: CanvasElementFrame, axis: CanvasSnapAxis) {
  return getCanvasFrameAxisValue(frame, axis, 'start')
}

function getCanvasFrameAxisEnd(frame: CanvasElementFrame, axis: CanvasSnapAxis) {
  return getCanvasFrameAxisValue(frame, axis, 'end')
}

function getCanvasFrameAxisSize(frame: CanvasElementFrame, axis: CanvasSnapAxis) {
  return axis === 'x' ? frame.width : frame.height
}

function getCanvasCrossAxis(axis: CanvasSnapAxis): CanvasSnapAxis {
  return axis === 'x' ? 'y' : 'x'
}

function setCanvasFrameAxisStart(
  frame: CanvasElementFrame,
  axis: CanvasSnapAxis,
  start: number,
): CanvasElementFrame {
  return axis === 'x'
    ? {...frame, x: roundCanvasNumber(start)}
    : {...frame, y: roundCanvasNumber(start)}
}

function getCanvasFrameAxisCenter(frame: CanvasElementFrame, axis: CanvasSnapAxis) {
  return getCanvasFrameAxisValue(frame, axis, 'center')
}

function doCanvasFramesOverlapOnAxis(
  left: CanvasElementFrame,
  right: CanvasElementFrame,
  axis: CanvasSnapAxis,
) {
  const overlap = Math.min(getCanvasFrameAxisEnd(left, axis), getCanvasFrameAxisEnd(right, axis))
    - Math.max(getCanvasFrameAxisStart(left, axis), getCanvasFrameAxisStart(right, axis))

  return overlap > CANVAS_GUIDE_MATCH_EPSILON
}

function getCanvasFrameAxisOverlapCenter(
  left: CanvasElementFrame,
  right: CanvasElementFrame,
  axis: CanvasSnapAxis,
) {
  const overlapStart = Math.max(getCanvasFrameAxisStart(left, axis), getCanvasFrameAxisStart(right, axis))
  const overlapEnd = Math.min(getCanvasFrameAxisEnd(left, axis), getCanvasFrameAxisEnd(right, axis))

  if (overlapEnd > overlapStart) {
    return roundCanvasNumber((overlapStart + overlapEnd) / 2)
  }

  return roundCanvasNumber((getCanvasFrameAxisCenter(left, axis) + getCanvasFrameAxisCenter(right, axis)) / 2)
}

function doCanvasFramesOverlapWhenPlaced(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  axis: CanvasSnapAxis,
) {
  const crossAxis = getCanvasCrossAxis(axis)
  const frameStart = getCanvasFrameAxisStart(frame, axis)
  const frameEnd = getCanvasFrameAxisEnd(frame, axis)

  return referenceFrames.some((referenceFrame) => (
    doCanvasFramesOverlapOnAxis(frame, referenceFrame, crossAxis)
    && frameStart < getCanvasFrameAxisEnd(referenceFrame, axis) - CANVAS_GUIDE_MATCH_EPSILON
    && frameEnd > getCanvasFrameAxisStart(referenceFrame, axis) + CANVAS_GUIDE_MATCH_EPSILON
  ))
}

function getCanvasFrameCenterDistance(left: CanvasElementFrame, right: CanvasElementFrame) {
  return Math.hypot(
    left.x + left.width / 2 - (right.x + right.width / 2),
    left.y + left.height / 2 - (right.y + right.height / 2),
  )
}

function getCanvasSnapPointPriority(candidate: CanvasAlignmentCandidate) {
  if (candidate.activePoint === 'center' && candidate.targetPoint === 'center') {
    return 0
  }

  if (candidate.activePoint === candidate.targetPoint) {
    return 1
  }

  if (candidate.activePoint === 'center' || candidate.targetPoint === 'center') {
    return 2
  }

  return 3
}

function compareCanvasAlignmentCandidates(
  activeFrame: CanvasElementFrame,
  left: CanvasAlignmentCandidate,
  right: CanvasAlignmentCandidate,
) {
  const distanceDelta = left.distance - right.distance

  if (Math.abs(distanceDelta) > CANVAS_GUIDE_MATCH_EPSILON) {
    return distanceDelta
  }

  const priorityDelta = getCanvasSnapPointPriority(left) - getCanvasSnapPointPriority(right)

  if (priorityDelta !== 0) {
    return priorityDelta
  }

  return getCanvasFrameCenterDistance(activeFrame, left.targetFrame)
    - getCanvasFrameCenterDistance(activeFrame, right.targetFrame)
}

function compareCanvasSizeCandidates(
  activeFrame: CanvasElementFrame,
  left: CanvasSizeCandidate,
  right: CanvasSizeCandidate,
) {
  const distanceDelta = left.distance - right.distance

  if (Math.abs(distanceDelta) > CANVAS_GUIDE_MATCH_EPSILON) {
    return distanceDelta
  }

  return getCanvasFrameCenterDistance(activeFrame, left.targetFrame)
    - getCanvasFrameCenterDistance(activeFrame, right.targetFrame)
}

function compareCanvasSpacingCandidates(
  activeFrame: CanvasElementFrame,
  left: CanvasSpacingCandidate,
  right: CanvasSpacingCandidate,
) {
  const distanceDelta = left.distance - right.distance

  if (Math.abs(distanceDelta) > CANVAS_GUIDE_MATCH_EPSILON) {
    return distanceDelta
  }

  const sourceGapCountDelta = right.sourceGapCount - left.sourceGapCount

  if (sourceGapCountDelta !== 0) {
    return sourceGapCountDelta
  }

  return getCanvasFrameCenterDistance(activeFrame, left.neighborFrame)
    - getCanvasFrameCenterDistance(activeFrame, right.neighborFrame)
}

function chooseCanvasMoveAxisDelta(
  bestAlignment: CanvasAlignmentCandidate | null,
  bestSpacing: CanvasSpacingCandidate | null,
) {
  if (!bestAlignment) {
    return bestSpacing?.delta ?? 0
  }

  if (!bestSpacing) {
    return bestAlignment.delta
  }

  const distanceDelta = bestAlignment.distance - bestSpacing.distance

  if (Math.abs(distanceDelta) <= CANVAS_GUIDE_MATCH_EPSILON) {
    return bestAlignment.delta
  }

  return distanceDelta < 0 ? bestAlignment.delta : bestSpacing.delta
}

function getBestCanvasAlignmentCandidate<TCandidate extends CanvasAlignmentCandidate>(
  activeFrame: CanvasElementFrame,
  candidates: TCandidate[],
) {
  return candidates.reduce<TCandidate | null>((bestCandidate, candidate) => {
    if (!bestCandidate) {
      return candidate
    }

    return compareCanvasAlignmentCandidates(activeFrame, candidate, bestCandidate) < 0
      ? candidate
      : bestCandidate
  }, null)
}

function getBestCanvasSpacingCandidate(
  activeFrame: CanvasElementFrame,
  candidates: CanvasSpacingCandidate[],
) {
  return candidates.reduce<CanvasSpacingCandidate | null>((bestCandidate, candidate) => {
    if (!bestCandidate) {
      return candidate
    }

    return compareCanvasSpacingCandidates(activeFrame, candidate, bestCandidate) < 0
      ? candidate
      : bestCandidate
  }, null)
}

function getBestCanvasSizeCandidate(
  activeFrame: CanvasElementFrame,
  candidates: CanvasSizeCandidate[],
) {
  return candidates.reduce<CanvasSizeCandidate | null>((bestCandidate, candidate) => {
    if (!bestCandidate) {
      return candidate
    }

    return compareCanvasSizeCandidates(activeFrame, candidate, bestCandidate) < 0
      ? candidate
      : bestCandidate
  }, null)
}

function collectCanvasAlignmentCandidates(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  axis: CanvasSnapAxis,
  snapTolerance: number,
  activePoints: readonly CanvasSnapPoint[] = ['start', 'center', 'end'],
) {
  const candidates: CanvasAlignmentCandidate[] = []
  const targetPoints: readonly CanvasSnapPoint[] = ['start', 'center', 'end']

  for (const activePoint of activePoints) {
    const activeValue = getCanvasFrameAxisValue(frame, axis, activePoint)

    for (const targetFrame of referenceFrames) {
      for (const targetPoint of targetPoints) {
        const targetValue = getCanvasFrameAxisValue(targetFrame, axis, targetPoint)
        const delta = targetValue - activeValue
        const distance = Math.abs(delta)

        if (distance <= snapTolerance) {
          candidates.push({
            activePoint,
            axis,
            delta,
            distance,
            targetFrame,
            targetPoint,
          })
        }
      }
    }
  }

  return candidates
}

function buildCanvasAlignmentGuideLine(
  axis: CanvasSnapAxis,
  frame: CanvasElementFrame,
  targetFrame: CanvasElementFrame,
  position: number,
) {
  if (axis === 'x') {
    return {
      x1: roundCanvasNumber(position),
      x2: roundCanvasNumber(position),
      y1: roundCanvasNumber(Math.min(frame.y, targetFrame.y)),
      y2: roundCanvasNumber(Math.max(frame.y + frame.height, targetFrame.y + targetFrame.height)),
    }
  }

  return {
    x1: roundCanvasNumber(Math.min(frame.x, targetFrame.x)),
    x2: roundCanvasNumber(Math.max(frame.x + frame.width, targetFrame.x + targetFrame.width)),
    y1: roundCanvasNumber(position),
    y2: roundCanvasNumber(position),
  }
}

function buildCanvasAlignmentGuides(
  frame: CanvasElementFrame,
  candidates: CanvasAlignmentCandidate[],
  appliedDelta: number,
) {
  const guides: CanvasAlignmentGuide[] = []
  const seenGuideKeys = new Set<string>()

  const matchingCandidates = candidates
    .filter((candidate) => Math.abs(candidate.delta - appliedDelta) <= CANVAS_GUIDE_MATCH_EPSILON)
    .sort((left, right) => compareCanvasAlignmentCandidates(frame, left, right))
    .slice(0, CANVAS_MAX_ALIGNMENT_GUIDES)

  for (const candidate of matchingCandidates) {
    const position = getCanvasFrameAxisValue(candidate.targetFrame, candidate.axis, candidate.targetPoint)
    const line = buildCanvasAlignmentGuideLine(candidate.axis, frame, candidate.targetFrame, position)
    const guideKey = `${candidate.axis}:${line.x1}:${line.y1}:${line.x2}:${line.y2}`

    if (seenGuideKeys.has(guideKey)) {
      continue
    }

    seenGuideKeys.add(guideKey)
    guides.push({
      axis: candidate.axis,
      kind: 'alignment',
      line,
    })
  }

  return guides
}

function collectCanvasReferenceSpacingGaps(
  referenceFrames: CanvasSnapReferenceFrame[],
  axis: CanvasSnapAxis,
) {
  const gaps: CanvasReferenceSpacingGap[] = []
  const crossAxis = getCanvasCrossAxis(axis)
  const orderedFrames = [...referenceFrames].sort((left, right) => {
    const axisDelta = getCanvasFrameAxisStart(left, axis) - getCanvasFrameAxisStart(right, axis)

    if (Math.abs(axisDelta) > CANVAS_GUIDE_MATCH_EPSILON) {
      return axisDelta
    }

    return getCanvasFrameAxisStart(left, crossAxis) - getCanvasFrameAxisStart(right, crossAxis)
  })

  for (let beforeIndex = 0; beforeIndex < orderedFrames.length - 1; beforeIndex += 1) {
    const beforeFrame = orderedFrames[beforeIndex]

    for (let afterIndex = beforeIndex + 1; afterIndex < orderedFrames.length; afterIndex += 1) {
      const afterFrame = orderedFrames[afterIndex]
      const gap = getCanvasFrameAxisStart(afterFrame, axis) - getCanvasFrameAxisEnd(beforeFrame, axis)

      if (gap <= CANVAS_GUIDE_MATCH_EPSILON) {
        if (doCanvasFramesOverlapOnAxis(beforeFrame, afterFrame, crossAxis)) {
          break
        }

        continue
      }

      if (!doCanvasFramesOverlapOnAxis(beforeFrame, afterFrame, crossAxis)) {
        continue
      }

      gaps.push({
        afterFrame,
        beforeFrame,
        gap: roundCanvasNumber(gap),
      })
      break
    }
  }

  return gaps
}

function getCanvasSpacingGapBucket(gap: number) {
  return Math.round(gap)
}

function buildCanvasSpacingGapCounts(referenceGaps: CanvasReferenceSpacingGap[]) {
  const gapCounts = new Map<number, number[]>()

  referenceGaps.forEach((referenceGap) => {
    const gapBucket = getCanvasSpacingGapBucket(referenceGap.gap)
    gapCounts.set(gapBucket, [...(gapCounts.get(gapBucket) ?? []), referenceGap.gap])
  })

  return gapCounts
}

function buildCanvasSpacingSnapAxisReference(
  referenceFrames: CanvasSnapReferenceFrame[],
  axis: CanvasSnapAxis,
): CanvasSpacingSnapAxisReference {
  const gaps = collectCanvasReferenceSpacingGaps(referenceFrames, axis)

  return {
    gapCounts: buildCanvasSpacingGapCounts(gaps),
    gaps,
  }
}

export function getCanvasSpacingSnapReference(
  referenceFrames: CanvasSnapReferenceFrame[],
): CanvasSpacingSnapReference {
  if (referenceFrames.length > CANVAS_MAX_SPACING_SNAP_REFERENCE_FRAMES) {
    return {
      x: {gapCounts: new Map(), gaps: []},
      y: {gapCounts: new Map(), gaps: []},
    }
  }

  return {
    x: buildCanvasSpacingSnapAxisReference(referenceFrames, 'x'),
    y: buildCanvasSpacingSnapAxisReference(referenceFrames, 'y'),
  }
}

function countCanvasMatchingReferenceSpacingGaps(
  referenceGaps: CanvasReferenceSpacingGap[],
  gap: number,
  gapCounts?: Map<number, number[]>,
) {
  if (gapCounts) {
    const gapBucket = getCanvasSpacingGapBucket(gap)
    let matchingCount = 0

    for (let bucket = gapBucket - CANVAS_SPACING_GAP_MATCH_TOLERANCE; bucket <= gapBucket + CANVAS_SPACING_GAP_MATCH_TOLERANCE; bucket += 1) {
      matchingCount += (gapCounts.get(bucket) ?? []).filter((referenceGap) => (
        Math.abs(referenceGap - gap) <= CANVAS_SPACING_GAP_MATCH_TOLERANCE
      )).length
    }

    return matchingCount
  }

  return referenceGaps.filter((referenceGap) => (
    Math.abs(referenceGap.gap - gap) <= CANVAS_SPACING_GAP_MATCH_TOLERANCE
  )).length
}

function collectCanvasSpacingCandidates(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  axis: CanvasSnapAxis,
  snapTolerance: number,
  spacingSnapAxisReference?: CanvasSpacingSnapAxisReference,
) {
  const candidates: CanvasSpacingCandidate[] = []
  const crossAxis = getCanvasCrossAxis(axis)
  const referenceGaps = spacingSnapAxisReference?.gaps ?? collectCanvasReferenceSpacingGaps(referenceFrames, axis)
  const gapCounts = spacingSnapAxisReference?.gapCounts
  const activeSize = getCanvasFrameAxisSize(frame, axis)
  const activeStart = getCanvasFrameAxisStart(frame, axis)

  for (const sourceGap of referenceGaps) {
    const spacing = sourceGap.gap
    const sourceGapCount = countCanvasMatchingReferenceSpacingGaps(referenceGaps, spacing, gapCounts)
    const availableInnerSpacing = sourceGap.gap - activeSize

    if (
      availableInnerSpacing > CANVAS_GUIDE_MATCH_EPSILON
      && doCanvasFramesOverlapOnAxis(frame, sourceGap.beforeFrame, crossAxis)
      && doCanvasFramesOverlapOnAxis(frame, sourceGap.afterFrame, crossAxis)
    ) {
      const innerSpacing = roundCanvasNumber(availableInnerSpacing / 2)
      const betweenStart = getCanvasFrameAxisEnd(sourceGap.beforeFrame, axis) + innerSpacing
      const betweenDelta = betweenStart - activeStart

      if (Math.abs(betweenDelta) <= snapTolerance) {
        const snappedFrame = setCanvasFrameAxisStart(frame, axis, betweenStart)

        if (!doCanvasFramesOverlapWhenPlaced(snappedFrame, referenceFrames, axis)) {
          candidates.push({
            axis,
            delta: betweenDelta,
            distance: Math.abs(betweenDelta),
            neighborFrame: getCanvasFrameCenterDistance(frame, sourceGap.beforeFrame) <= getCanvasFrameCenterDistance(frame, sourceGap.afterFrame)
              ? sourceGap.beforeFrame
              : sourceGap.afterFrame,
            placement: 'between',
            sourceGap,
            sourceGapCount: countCanvasMatchingReferenceSpacingGaps(referenceGaps, innerSpacing, gapCounts),
            spacing: innerSpacing,
          })
        }
      }
    }

    for (const neighborFrame of referenceFrames) {
      if (!doCanvasFramesOverlapOnAxis(frame, neighborFrame, crossAxis)) {
        continue
      }

      const afterStart = getCanvasFrameAxisEnd(neighborFrame, axis) + spacing
      const afterDelta = afterStart - activeStart

      if (Math.abs(afterDelta) <= snapTolerance) {
        const snappedFrame = setCanvasFrameAxisStart(frame, axis, afterStart)

        if (!doCanvasFramesOverlapWhenPlaced(snappedFrame, referenceFrames, axis)) {
          candidates.push({
            axis,
            delta: afterDelta,
            distance: Math.abs(afterDelta),
            neighborFrame,
            placement: 'after',
            sourceGap,
            sourceGapCount,
            spacing,
          })
        }
      }

      const beforeStart = getCanvasFrameAxisStart(neighborFrame, axis) - spacing - activeSize
      const beforeDelta = beforeStart - activeStart

      if (Math.abs(beforeDelta) <= snapTolerance) {
        const snappedFrame = setCanvasFrameAxisStart(frame, axis, beforeStart)

        if (!doCanvasFramesOverlapWhenPlaced(snappedFrame, referenceFrames, axis)) {
          candidates.push({
            axis,
            delta: beforeDelta,
            distance: Math.abs(beforeDelta),
            neighborFrame,
            placement: 'before',
            sourceGap,
            sourceGapCount,
            spacing,
          })
        }
      }
    }
  }

  return candidates
}

function isCanvasSpacingCandidateValidForFrame(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  candidate: CanvasSpacingCandidate,
) {
  const crossAxis = getCanvasCrossAxis(candidate.axis)

  if (doCanvasFramesOverlapWhenPlaced(frame, referenceFrames, candidate.axis)) {
    return false
  }

  if (candidate.placement === 'between') {
    return doCanvasFramesOverlapOnAxis(frame, candidate.sourceGap.beforeFrame, crossAxis)
      && doCanvasFramesOverlapOnAxis(frame, candidate.sourceGap.afterFrame, crossAxis)
  }

  return doCanvasFramesOverlapOnAxis(frame, candidate.neighborFrame, crossAxis)
}

function buildCanvasSpacingGuideSegment(
  axis: CanvasSnapAxis,
  beforeFrame: CanvasElementFrame,
  afterFrame: CanvasElementFrame,
  capSize: number,
): CanvasSpacingGuideSegment | null {
  const gapStart = getCanvasFrameAxisEnd(beforeFrame, axis)
  const gapEnd = getCanvasFrameAxisStart(afterFrame, axis)

  if (gapEnd - gapStart <= CANVAS_GUIDE_MATCH_EPSILON) {
    return null
  }

  const crossAxis = getCanvasCrossAxis(axis)
  const crossCenter = getCanvasFrameAxisOverlapCenter(beforeFrame, afterFrame, crossAxis)
  const halfCapSize = capSize / 2

  if (axis === 'x') {
    return {
      endCap: {
        x1: roundCanvasNumber(gapEnd),
        x2: roundCanvasNumber(gapEnd),
        y1: roundCanvasNumber(crossCenter - halfCapSize),
        y2: roundCanvasNumber(crossCenter + halfCapSize),
      },
      line: {
        x1: roundCanvasNumber(gapStart),
        x2: roundCanvasNumber(gapEnd),
        y1: crossCenter,
        y2: crossCenter,
      },
      startCap: {
        x1: roundCanvasNumber(gapStart),
        x2: roundCanvasNumber(gapStart),
        y1: roundCanvasNumber(crossCenter - halfCapSize),
        y2: roundCanvasNumber(crossCenter + halfCapSize),
      },
    }
  }

  return {
    endCap: {
      x1: roundCanvasNumber(crossCenter - halfCapSize),
      x2: roundCanvasNumber(crossCenter + halfCapSize),
      y1: roundCanvasNumber(gapEnd),
      y2: roundCanvasNumber(gapEnd),
    },
    line: {
      x1: crossCenter,
      x2: crossCenter,
      y1: roundCanvasNumber(gapStart),
      y2: roundCanvasNumber(gapEnd),
    },
    startCap: {
      x1: roundCanvasNumber(crossCenter - halfCapSize),
      x2: roundCanvasNumber(crossCenter + halfCapSize),
      y1: roundCanvasNumber(gapStart),
      y2: roundCanvasNumber(gapStart),
    },
  }
}

function getCanvasSpacingSegmentKey(segment: CanvasSpacingGuideSegment) {
  return [
    segment.line.x1,
    segment.line.y1,
    segment.line.x2,
    segment.line.y2,
    segment.startCap.x1,
    segment.startCap.y1,
    segment.endCap.x2,
    segment.endCap.y2,
  ].join(':')
}

function addCanvasSpacingGuideSegment(
  segments: CanvasSpacingGuideSegment[],
  segmentKeys: Set<string>,
  segment: CanvasSpacingGuideSegment | null,
) {
  if (!segment) {
    return
  }

  const key = getCanvasSpacingSegmentKey(segment)

  if (segmentKeys.has(key)) {
    return
  }

  segmentKeys.add(key)
  segments.push(segment)
}

function buildCanvasSpacingGuides(
  frame: CanvasElementFrame,
  candidates: CanvasSpacingCandidate[],
  appliedDelta: number,
  capSize: number,
) {
  const bestCandidate = getBestCanvasSpacingCandidate(
    frame,
    candidates.filter((candidate) => Math.abs(candidate.delta - appliedDelta) <= CANVAS_GUIDE_MATCH_EPSILON),
  )

  if (!bestCandidate) {
    return []
  }

  const matchingCandidates = candidates
    .filter((candidate) => (
      Math.abs(candidate.delta - appliedDelta) <= CANVAS_GUIDE_MATCH_EPSILON
      && Math.abs(candidate.spacing - bestCandidate.spacing) <= CANVAS_SPACING_GAP_MATCH_TOLERANCE
    ))
    .sort((left, right) => compareCanvasSpacingCandidates(frame, left, right))

  const segments: CanvasSpacingGuideSegment[] = []
  const segmentKeys = new Set<string>()

  for (const candidate of matchingCandidates) {
    if (candidate.placement === 'between') {
      addCanvasSpacingGuideSegment(
        segments,
        segmentKeys,
        buildCanvasSpacingGuideSegment(candidate.axis, candidate.sourceGap.beforeFrame, frame, capSize),
      )
      addCanvasSpacingGuideSegment(
        segments,
        segmentKeys,
        buildCanvasSpacingGuideSegment(candidate.axis, frame, candidate.sourceGap.afterFrame, capSize),
      )

      if (segments.length >= CANVAS_MAX_SPACING_GUIDE_SEGMENTS) {
        break
      }

      continue
    }

    addCanvasSpacingGuideSegment(
      segments,
      segmentKeys,
      buildCanvasSpacingGuideSegment(
        candidate.axis,
        candidate.sourceGap.beforeFrame,
        candidate.sourceGap.afterFrame,
        capSize,
      ),
    )

    const activeBeforeFrame = candidate.placement === 'before' ? frame : candidate.neighborFrame
    const activeAfterFrame = candidate.placement === 'before' ? candidate.neighborFrame : frame

    addCanvasSpacingGuideSegment(
      segments,
      segmentKeys,
      buildCanvasSpacingGuideSegment(candidate.axis, activeBeforeFrame, activeAfterFrame, capSize),
    )

    if (segments.length >= CANVAS_MAX_SPACING_GUIDE_SEGMENTS) {
      break
    }
  }

  const cappedSegments = segments.slice(0, CANVAS_MAX_SPACING_GUIDE_SEGMENTS)

  if (cappedSegments.length < 2) {
    return []
  }

  return [{
    axis: bestCandidate.axis,
    distance: roundCanvasNumber(bestCandidate.spacing),
    kind: 'spacing',
    segments: cappedSegments,
  }] satisfies CanvasSpacingGuide[]
}

function getCanvasTranslatedFrame(
  frame: CanvasElementFrame,
  xDelta: number,
  yDelta: number,
): CanvasElementFrame {
  return {
    ...frame,
    x: roundCanvasNumber(frame.x + xDelta),
    y: roundCanvasNumber(frame.y + yDelta),
  }
}

function getCanvasResizeControlPoint(frame: CanvasElementFrame, handle: CanvasResizeHandle): CanvasPoint {
  switch (handle) {
    case 'top':
      return {x: frame.x + frame.width / 2, y: frame.y}
    case 'right':
      return {x: frame.x + frame.width, y: frame.y + frame.height / 2}
    case 'bottom':
      return {x: frame.x + frame.width / 2, y: frame.y + frame.height}
    case 'left':
      return {x: frame.x, y: frame.y + frame.height / 2}
    case 'top-left':
      return {x: frame.x, y: frame.y}
    case 'top-right':
      return {x: frame.x + frame.width, y: frame.y}
    case 'bottom-left':
      return {x: frame.x, y: frame.y + frame.height}
    case 'bottom-right':
      return {x: frame.x + frame.width, y: frame.y + frame.height}
    default: {
      const exhaustiveHandle: never = handle
      throw new Error(`Unsupported canvas resize handle: ${exhaustiveHandle}`)
    }
  }
}

function getCanvasResizeAxisActivePoints(handle: CanvasResizeHandle, axis: CanvasSnapAxis) {
  if (axis === 'x') {
    if (handle === 'top' || handle === 'bottom') {
      return [] as const
    }

    return handle === 'left' || handle === 'top-left' || handle === 'bottom-left'
      ? ['start', 'center'] as const
      : ['end', 'center'] as const
  }

  if (handle === 'left' || handle === 'right') {
    return [] as const
  }

  return handle === 'top' || handle === 'top-left' || handle === 'top-right'
    ? ['start', 'center'] as const
    : ['end', 'center'] as const
}

function getCanvasResizeSizeControlValue(
  anchor: CanvasPoint,
  handle: CanvasResizeHandle,
  axis: CanvasSizeGuide['axis'],
  size: number,
) {
  if (axis === 'width') {
    return handle === 'left' || handle === 'top-left' || handle === 'bottom-left'
      ? anchor.x - size
      : anchor.x + size
  }

  return handle === 'top' || handle === 'top-left' || handle === 'top-right'
    ? anchor.y - size
    : anchor.y + size
}

function doesCanvasResizeHandleControlWidth(handle: CanvasResizeHandle) {
  return handle !== 'top' && handle !== 'bottom'
}

function doesCanvasResizeHandleControlHeight(handle: CanvasResizeHandle) {
  return handle !== 'left' && handle !== 'right'
}

function collectCanvasSizeCandidates(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  axis: CanvasSizeGuide['axis'],
  snapTolerance: number,
) {
  const candidates: CanvasSizeCandidate[] = []
  const activeSize = axis === 'width' ? frame.width : frame.height

  for (const targetFrame of referenceFrames) {
    const matchedSize = axis === 'width' ? targetFrame.width : targetFrame.height
    const distance = Math.abs(matchedSize - activeSize)

    if (distance <= snapTolerance) {
      candidates.push({
        axis,
        distance,
        matchedSize,
        targetFrame,
      })
    }
  }

  return candidates
}

function buildCanvasSizeGuide(
  frame: CanvasElementFrame,
  candidate: CanvasSizeCandidate,
  guideOffset: number,
): CanvasSizeGuide {
  if (candidate.axis === 'width') {
    const y = roundCanvasNumber(frame.y - guideOffset)

    return {
      axis: 'width',
      kind: 'size',
      line: {
        x1: roundCanvasNumber(frame.x),
        x2: roundCanvasNumber(frame.x + frame.width),
        y1: y,
        y2: y,
      },
      matchedSize: roundCanvasNumber(candidate.matchedSize),
    }
  }

  const x = roundCanvasNumber(frame.x - guideOffset)

  return {
    axis: 'height',
    kind: 'size',
    line: {
      x1: x,
      x2: x,
      y1: roundCanvasNumber(frame.y),
      y2: roundCanvasNumber(frame.y + frame.height),
    },
    matchedSize: roundCanvasNumber(candidate.matchedSize),
  }
}

function getCanvasResizeAlignmentCandidates(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  handle: CanvasResizeHandle,
  axis: CanvasSnapAxis,
  snapTolerance: number,
) {
  const activePoints = getCanvasResizeAxisActivePoints(handle, axis)

  return collectCanvasAlignmentCandidates(frame, referenceFrames, axis, snapTolerance, activePoints)
    .map((candidate): CanvasResizeAlignmentCandidate => ({
      ...candidate,
      controlDelta: candidate.activePoint === 'center' ? candidate.delta * 2 : candidate.delta,
    }))
}

export function getCanvasSnappedMoveFrame(
  frame: CanvasElementFrame,
  referenceFrames: CanvasSnapReferenceFrame[],
  snapTolerance: number,
  spacingGuideCapSize = CANVAS_SPACING_GUIDE_CAP_PX,
  spacingSnapReference = getCanvasSpacingSnapReference(referenceFrames),
): CanvasSnapResult {
  const xCandidates = collectCanvasAlignmentCandidates(frame, referenceFrames, 'x', snapTolerance)
  const yCandidates = collectCanvasAlignmentCandidates(frame, referenceFrames, 'y', snapTolerance)
  const xSpacingCandidates = collectCanvasSpacingCandidates(frame, referenceFrames, 'x', snapTolerance, spacingSnapReference.x)
  const ySpacingCandidates = collectCanvasSpacingCandidates(frame, referenceFrames, 'y', snapTolerance, spacingSnapReference.y)
  const bestX = getBestCanvasAlignmentCandidate(frame, xCandidates)
  const bestY = getBestCanvasAlignmentCandidate(frame, yCandidates)
  let validXSpacingCandidates = xSpacingCandidates
  let validYSpacingCandidates = ySpacingCandidates
  let xDelta = chooseCanvasMoveAxisDelta(bestX, getBestCanvasSpacingCandidate(frame, validXSpacingCandidates))
  let yDelta = chooseCanvasMoveAxisDelta(bestY, getBestCanvasSpacingCandidate(frame, validYSpacingCandidates))
  let snappedFrame = getCanvasTranslatedFrame(frame, xDelta, yDelta)

  for (let iteration = 0; iteration < 3; iteration += 1) {
    validXSpacingCandidates = xSpacingCandidates.filter((candidate) => (
      isCanvasSpacingCandidateValidForFrame(snappedFrame, referenceFrames, candidate)
    ))
    validYSpacingCandidates = ySpacingCandidates.filter((candidate) => (
      isCanvasSpacingCandidateValidForFrame(snappedFrame, referenceFrames, candidate)
    ))

    const nextXDelta = chooseCanvasMoveAxisDelta(bestX, getBestCanvasSpacingCandidate(frame, validXSpacingCandidates))
    const nextYDelta = chooseCanvasMoveAxisDelta(bestY, getBestCanvasSpacingCandidate(frame, validYSpacingCandidates))

    if (
      Math.abs(nextXDelta - xDelta) <= CANVAS_GUIDE_MATCH_EPSILON
      && Math.abs(nextYDelta - yDelta) <= CANVAS_GUIDE_MATCH_EPSILON
    ) {
      break
    }

    xDelta = nextXDelta
    yDelta = nextYDelta
    snappedFrame = getCanvasTranslatedFrame(frame, xDelta, yDelta)
  }

  validXSpacingCandidates = xSpacingCandidates.filter((candidate) => (
    isCanvasSpacingCandidateValidForFrame(snappedFrame, referenceFrames, candidate)
  ))
  validYSpacingCandidates = ySpacingCandidates.filter((candidate) => (
    isCanvasSpacingCandidateValidForFrame(snappedFrame, referenceFrames, candidate)
  ))

  const guides = createEmptyTransformGuides()

  if (bestX && Math.abs(bestX.delta - xDelta) <= CANVAS_GUIDE_MATCH_EPSILON) {
    guides.alignment.push(...buildCanvasAlignmentGuides(snappedFrame, xCandidates, xDelta))
  }

  if (bestY && Math.abs(bestY.delta - yDelta) <= CANVAS_GUIDE_MATCH_EPSILON) {
    guides.alignment.push(...buildCanvasAlignmentGuides(snappedFrame, yCandidates, yDelta))
  }

  const spacingGuides = [
    ...buildCanvasSpacingGuides(snappedFrame, validXSpacingCandidates, xDelta, spacingGuideCapSize),
    ...buildCanvasSpacingGuides(snappedFrame, validYSpacingCandidates, yDelta, spacingGuideCapSize),
  ]

  guides.spacing = spacingGuides

  return {
    frame: snappedFrame,
    guides,
  }
}

export function getCanvasResizeAnchor(frame: CanvasElementFrame, handle: CanvasResizeHandle): CanvasPoint {
  let anchor: CanvasPoint

  switch (handle) {
    case 'top':
      anchor = {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height,
      }
      break
    case 'right':
      anchor = {
        x: frame.x,
        y: frame.y + frame.height / 2,
      }
      break
    case 'bottom':
      anchor = {
        x: frame.x + frame.width / 2,
        y: frame.y,
      }
      break
    case 'left':
      anchor = {
        x: frame.x + frame.width,
        y: frame.y + frame.height / 2,
      }
      break
    case 'top-left':
      anchor = {
        x: frame.x + frame.width,
        y: frame.y + frame.height,
      }
      break
    case 'top-right':
      anchor = {
        x: frame.x,
        y: frame.y + frame.height,
      }
      break
    case 'bottom-left':
      anchor = {
        x: frame.x + frame.width,
        y: frame.y,
      }
      break
    case 'bottom-right':
      anchor = {
        x: frame.x,
        y: frame.y,
      }
      break
    default: {
      const exhaustiveHandle: never = handle
      throw new Error(`Unsupported canvas resize handle: ${exhaustiveHandle}`)
    }
  }

  return {
    x: roundCanvasNumber(anchor.x),
    y: roundCanvasNumber(anchor.y),
  }
}

function clampCanvasResizePoint(
  anchor: CanvasPoint,
  handle: CanvasResizeHandle,
  point: CanvasPoint,
  minimumSize: number,
) {
  switch (handle) {
    case 'top':
      return {
        x: anchor.x,
        y: roundCanvasNumber(Math.min(point.y, anchor.y - minimumSize)),
      }
    case 'right':
      return {
        x: roundCanvasNumber(Math.max(point.x, anchor.x + minimumSize)),
        y: anchor.y,
      }
    case 'bottom':
      return {
        x: anchor.x,
        y: roundCanvasNumber(Math.max(point.y, anchor.y + minimumSize)),
      }
    case 'left':
      return {
        x: roundCanvasNumber(Math.min(point.x, anchor.x - minimumSize)),
        y: anchor.y,
      }
    case 'top-left':
      return {
        x: roundCanvasNumber(Math.min(point.x, anchor.x - minimumSize)),
        y: roundCanvasNumber(Math.min(point.y, anchor.y - minimumSize)),
      }
    case 'top-right':
      return {
        x: roundCanvasNumber(Math.max(point.x, anchor.x + minimumSize)),
        y: roundCanvasNumber(Math.min(point.y, anchor.y - minimumSize)),
      }
    case 'bottom-left':
      return {
        x: roundCanvasNumber(Math.min(point.x, anchor.x - minimumSize)),
        y: roundCanvasNumber(Math.max(point.y, anchor.y + minimumSize)),
      }
    case 'bottom-right':
      return {
        x: roundCanvasNumber(Math.max(point.x, anchor.x + minimumSize)),
        y: roundCanvasNumber(Math.max(point.y, anchor.y + minimumSize)),
      }
    default: {
      const exhaustiveHandle: never = handle
      throw new Error(`Unsupported canvas resize handle: ${exhaustiveHandle}`)
    }
  }
}

export function getCanvasResizedFrame(
  frame: CanvasElementFrame,
  handle: CanvasResizeHandle,
  point: CanvasPoint,
  minimumSize = 1,
) {
  const anchor = getCanvasResizeAnchor(frame, handle)
  const clampedPoint = clampCanvasResizePoint(anchor, handle, point, minimumSize)

  switch (handle) {
    case 'top':
      return {
        height: roundCanvasNumber(anchor.y - clampedPoint.y),
        width: roundCanvasNumber(frame.width),
        x: roundCanvasNumber(frame.x),
        y: roundCanvasNumber(clampedPoint.y),
      }
    case 'right':
      return {
        height: roundCanvasNumber(frame.height),
        width: roundCanvasNumber(clampedPoint.x - anchor.x),
        x: roundCanvasNumber(frame.x),
        y: roundCanvasNumber(frame.y),
      }
    case 'bottom':
      return {
        height: roundCanvasNumber(clampedPoint.y - anchor.y),
        width: roundCanvasNumber(frame.width),
        x: roundCanvasNumber(frame.x),
        y: roundCanvasNumber(frame.y),
      }
    case 'left':
      return {
        height: roundCanvasNumber(frame.height),
        width: roundCanvasNumber(anchor.x - clampedPoint.x),
        x: roundCanvasNumber(clampedPoint.x),
        y: roundCanvasNumber(frame.y),
      }
    case 'top-left':
    case 'top-right':
    case 'bottom-left':
    case 'bottom-right':
      return normalizeCanvasRect(anchor, clampedPoint, minimumSize)
    default: {
      const exhaustiveHandle: never = handle
      throw new Error(`Unsupported canvas resize handle: ${exhaustiveHandle}`)
    }
  }

}

export function getCanvasSnappedResizeFrame(
  frame: CanvasElementFrame,
  handle: CanvasResizeHandle,
  point: CanvasPoint,
  referenceFrames: CanvasSnapReferenceFrame[],
  minimumSize = 1,
  snapTolerance = CANVAS_OBJECT_SNAP_TOLERANCE_PX,
  sizeGuideOffset = CANVAS_SIZE_GUIDE_OFFSET_PX,
): CanvasSnapResult {
  const anchor = getCanvasResizeAnchor(frame, handle)
  let controlPoint = getCanvasResizeControlPoint(
    getCanvasResizedFrame(frame, handle, point, minimumSize),
    handle,
  )
  let snappedFrame = getCanvasResizedFrame(frame, handle, controlPoint, minimumSize)
  const controlsWidth = doesCanvasResizeHandleControlWidth(handle)
  const controlsHeight = doesCanvasResizeHandleControlHeight(handle)
  let widthSizeCandidate = controlsWidth
    ? getBestCanvasSizeCandidate(
      snappedFrame,
      collectCanvasSizeCandidates(snappedFrame, referenceFrames, 'width', snapTolerance),
    )
    : null
  let heightSizeCandidate = controlsHeight
    ? getBestCanvasSizeCandidate(
      snappedFrame,
      collectCanvasSizeCandidates(snappedFrame, referenceFrames, 'height', snapTolerance),
    )
    : null

  if (widthSizeCandidate) {
    controlPoint = {
      ...controlPoint,
      x: getCanvasResizeSizeControlValue(anchor, handle, 'width', widthSizeCandidate.matchedSize),
    }
    snappedFrame = getCanvasResizedFrame(frame, handle, controlPoint, minimumSize)
  }

  if (heightSizeCandidate) {
    controlPoint = {
      ...controlPoint,
      y: getCanvasResizeSizeControlValue(anchor, handle, 'height', heightSizeCandidate.matchedSize),
    }
    snappedFrame = getCanvasResizedFrame(frame, handle, controlPoint, minimumSize)
  }

  let xAlignmentCandidates = getCanvasResizeAlignmentCandidates(snappedFrame, referenceFrames, handle, 'x', snapTolerance)
  let yAlignmentCandidates = getCanvasResizeAlignmentCandidates(snappedFrame, referenceFrames, handle, 'y', snapTolerance)
  const bestXAlignment = getBestCanvasAlignmentCandidate(snappedFrame, xAlignmentCandidates)
  const bestYAlignment = getBestCanvasAlignmentCandidate(snappedFrame, yAlignmentCandidates)

  if (bestXAlignment) {
    controlPoint = {
      ...controlPoint,
      x: controlPoint.x + bestXAlignment.controlDelta,
    }
    snappedFrame = getCanvasResizedFrame(frame, handle, controlPoint, minimumSize)
  }

  if (bestYAlignment) {
    controlPoint = {
      ...controlPoint,
      y: controlPoint.y + bestYAlignment.controlDelta,
    }
    snappedFrame = getCanvasResizedFrame(frame, handle, controlPoint, minimumSize)
  }

  widthSizeCandidate = widthSizeCandidate
    && Math.abs(snappedFrame.width - widthSizeCandidate.matchedSize) <= CANVAS_GUIDE_MATCH_EPSILON
    ? widthSizeCandidate
    : null
  heightSizeCandidate = heightSizeCandidate
    && Math.abs(snappedFrame.height - heightSizeCandidate.matchedSize) <= CANVAS_GUIDE_MATCH_EPSILON
    ? heightSizeCandidate
    : null
  xAlignmentCandidates = getCanvasResizeAlignmentCandidates(snappedFrame, referenceFrames, handle, 'x', CANVAS_GUIDE_MATCH_EPSILON)
  yAlignmentCandidates = getCanvasResizeAlignmentCandidates(snappedFrame, referenceFrames, handle, 'y', CANVAS_GUIDE_MATCH_EPSILON)

  const guides = createEmptyTransformGuides()

  if (widthSizeCandidate) {
    guides.size.push(buildCanvasSizeGuide(snappedFrame, widthSizeCandidate, sizeGuideOffset))
  }

  if (heightSizeCandidate) {
    guides.size.push(buildCanvasSizeGuide(snappedFrame, heightSizeCandidate, sizeGuideOffset))
  }

  if (bestXAlignment) {
    guides.alignment.push(...buildCanvasAlignmentGuides(snappedFrame, xAlignmentCandidates, 0))
  }

  if (bestYAlignment) {
    guides.alignment.push(...buildCanvasAlignmentGuides(snappedFrame, yAlignmentCandidates, 0))
  }

  return {
    frame: snappedFrame,
    guides,
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
