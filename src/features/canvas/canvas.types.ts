import type {RichTextDocument} from '../rich-text/rich-text'

export const canvasElementTypes = ['note', 'shape', 'drawing', 'image', 'comment', 'text'] as const

export const canvasToolModes = ['select', 'hand', 'pen', 'note', 'shape', 'comment'] as const

export const canvasShapeTypes = [
  'rectangle',
  'rounded-rectangle',
  'circle',
  'diamond',
  'triangle',
  'hexagon',
  'parallelogram',
  'trapezoid',
  'arrow-right',
  'plus',
  'star',
  'thought-bubble',
] as const

export const canvasShapeStrokeStyles = ['solid', 'dashed', 'none'] as const

export const canvasShapeTextFamilies = ['standard', 'technical', 'scribbled'] as const

export const canvasShapeTextAlignments = ['left', 'center', 'right'] as const

export const CANVAS_NOTE_COLORS = [
  '#f2eee6',
  '#fef3c7',
  '#fed7aa',
  '#fecaca',
  '#ddd6fe',
  '#bfdbfe',
  '#a7f3d0',
  '#fbcfe8',
] as const

export const CANVAS_DRAWING_COLORS = ['#17202b', '#bf6224', '#2563eb', '#059669', '#dc2626'] as const

export const CANVAS_SHAPE_COLORS = [
  '#252525',
  '#8b8b8b',
  '#dc2626',
  '#ef4444',
  '#f97316',
  '#fb923c',
  '#fbbf24',
  '#65d46e',
  '#63d1ce',
  '#4ea9f4',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
  '#d4d4d4',
  '#f5f5f4',
  '#fecaca',
  '#fed7aa',
  '#fde68a',
  '#dcfce7',
  '#bbf7d0',
  '#cffafe',
  '#dbeafe',
  '#e9d5ff',
  '#fbcfe8',
] as const

export const CANVAS_SHAPE_TEXT_SIZE_PRESETS = [
  {label: 'Small', value: 16},
  {label: 'Medium', value: 20},
  {label: 'Large', value: 24},
  {label: 'Extra large', value: 32},
  {label: 'Huge', value: 40},
] as const

export const DEFAULT_CANVAS_SHAPE_TYPE = 'rectangle' as const
export const DEFAULT_CANVAS_SHAPE_FILL_COLOR = '#f2eee6'
export const DEFAULT_CANVAS_SHAPE_STROKE_COLOR = '#17202b'
export const DEFAULT_CANVAS_SHAPE_STROKE_OPACITY = 1
export const DEFAULT_CANVAS_SHAPE_STROKE_STYLE = 'solid' as const
export const DEFAULT_CANVAS_SHAPE_STROKE_WIDTH = 2
export const DEFAULT_CANVAS_SHAPE_TEXT_ALIGN = 'center' as const
export const LEGACY_CANVAS_SHAPE_TEXT_ALIGN_FALLBACK = 'left' as const
export const DEFAULT_CANVAS_SHAPE_TEXT_FAMILY = 'standard' as const
export const DEFAULT_CANVAS_SHAPE_TEXT_SIZE = 16
export const CANVAS_ALIGNMENT_GUIDE_COLOR = '#1685ff'
export const CANVAS_SIZE_GUIDE_COLOR = '#9747ff'
export const CANVAS_SPACING_GUIDE_COLOR = '#9747ff'
export const CANVAS_ELEMENT_BATCH_MUTATION_LIMIT = 250

export const DEFAULT_CANVAS_VIEWPORT = {
  scale: 1,
  x: 120,
  y: 96,
} as const

export type CanvasElementType = (typeof canvasElementTypes)[number]
export type CanvasToolMode = (typeof canvasToolModes)[number]
export type CanvasShapeType = (typeof canvasShapeTypes)[number]
export type CanvasShapeStrokeStyle = (typeof canvasShapeStrokeStyles)[number]
export type CanvasShapeTextFamily = (typeof canvasShapeTextFamilies)[number]
export type CanvasShapeTextAlign = (typeof canvasShapeTextAlignments)[number]
export type CanvasResizeHandle = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type CanvasElementFrame = {
  height: number
  width: number
  x: number
  y: number
}

export type CanvasGuideLine = {
  x1: number
  x2: number
  y1: number
  y2: number
}

export type CanvasAlignmentGuide = {
  axis: 'x' | 'y'
  kind: 'alignment'
  line: CanvasGuideLine
}

export type CanvasSizeGuide = {
  axis: 'width' | 'height'
  kind: 'size'
  line: CanvasGuideLine
  matchedSize: number
}

export type CanvasSpacingGuideSegment = {
  endCap: CanvasGuideLine
  line: CanvasGuideLine
  startCap: CanvasGuideLine
}

export type CanvasSpacingGuide = {
  axis: 'x' | 'y'
  distance: number
  kind: 'spacing'
  segments: CanvasSpacingGuideSegment[]
}

export type CanvasTransformGuides = {
  alignment: CanvasAlignmentGuide[]
  size: CanvasSizeGuide[]
  spacing: CanvasSpacingGuide[]
}

export type CanvasElementTransformPreview = CanvasElementFrame & {
  elementId: string
  guides?: CanvasTransformGuides
}

export type CanvasElementStyle = {
  fill_color?: string | null
  rich_text?: RichTextDocument | null
  shape_type?: CanvasShapeType | null
  stroke_color?: string | null
  stroke_opacity?: number | null
  stroke_style?: CanvasShapeStrokeStyle | null
  stroke_width?: number | null
  text_align?: CanvasShapeTextAlign | null
  text_family?: CanvasShapeTextFamily | null
  text_size?: number | null
}

export type CanvasViewport = {
  scale: number
  x: number
  y: number
}

export type ResolvedCanvasShapeStyle = {
  fillColor: string | null
  shapeType: CanvasShapeType
  strokeColor: string
  strokeOpacity: number
  strokeStyle: CanvasShapeStrokeStyle
  strokeWidth: number
  textAlign: CanvasShapeTextAlign
  textFamily: CanvasShapeTextFamily
  textSize: number
}

export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasElement = {
  assetPath: string | null
  content: string | null
  createdAt: string
  createdBy: string | null
  elementType: CanvasElementType
  height: number
  id: string
  isResolved: boolean
  pathData: string | null
  projectViewId: string
  style: CanvasElementStyle
  updatedAt: string
  url: string | null
  width: number
  x: number
  y: number
  zIndex: number
}

export type CanvasElementCreateInput = {
  content?: string | null
  elementType: CanvasElementType
  height?: number
  isResolved?: boolean
  pathData?: string | null
  projectViewId: string
  style?: CanvasElementStyle
  url?: string | null
  width?: number
  x: number
  y: number
  zIndex?: number
}

export type CanvasElementUpdateInput = {
  content?: string | null
  height?: number
  isResolved?: boolean
  pathData?: string | null
  style?: CanvasElementStyle
  url?: string | null
  width?: number
  x?: number
  y?: number
  zIndex?: number
}

export type CanvasElementBatchUpdateInput = {
  elementId: string
  updates: CanvasElementUpdateInput
}

export type CanvasImageUploadInput = {
  file: File
  projectId: string
  projectViewId: string
  x: number
  y: number
  zIndex?: number
}

export function sortCanvasElements(elements: CanvasElement[]) {
  return [...elements].sort((left, right) => {
    if (left.zIndex !== right.zIndex) {
      return left.zIndex - right.zIndex
    }

    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt.localeCompare(right.updatedAt)
    }

    return left.id.localeCompare(right.id)
  })
}

export function getCanvasMaxZIndex(elements: CanvasElement[]) {
  return elements.reduce((maxZIndex, element) => Math.max(maxZIndex, element.zIndex), 0)
}

export function getCanvasOverlayZIndex(elements: CanvasElement[], layer = 1) {
  return getCanvasMaxZIndex(elements) + layer
}

export function resolveCanvasShapeStyle(style: CanvasElementStyle): ResolvedCanvasShapeStyle {
  return {
    fillColor: style.fill_color === undefined ? DEFAULT_CANVAS_SHAPE_FILL_COLOR : style.fill_color ?? null,
    shapeType: style.shape_type ?? DEFAULT_CANVAS_SHAPE_TYPE,
    strokeColor: style.stroke_color ?? DEFAULT_CANVAS_SHAPE_STROKE_COLOR,
    strokeOpacity: style.stroke_opacity ?? DEFAULT_CANVAS_SHAPE_STROKE_OPACITY,
    strokeStyle: style.stroke_style ?? DEFAULT_CANVAS_SHAPE_STROKE_STYLE,
    strokeWidth: style.stroke_width ?? DEFAULT_CANVAS_SHAPE_STROKE_WIDTH,
    // Older shapes may omit text_align entirely. Keep their legacy left alignment
    // while letting newly created shapes persist the newer centered default.
    textAlign: style.text_align === undefined
      ? LEGACY_CANVAS_SHAPE_TEXT_ALIGN_FALLBACK
      : style.text_align ?? DEFAULT_CANVAS_SHAPE_TEXT_ALIGN,
    textFamily: style.text_family ?? DEFAULT_CANVAS_SHAPE_TEXT_FAMILY,
    textSize: style.text_size ?? DEFAULT_CANVAS_SHAPE_TEXT_SIZE,
  }
}

export function withCanvasShapeDefaultTextAlignment(style: CanvasElementStyle): CanvasElementStyle {
  if (style.text_align !== undefined) {
    return style
  }

  return {
    ...style,
    text_align: DEFAULT_CANVAS_SHAPE_TEXT_ALIGN,
  }
}

export function mergeCanvasElement(
  element: CanvasElement,
  updates: CanvasElementUpdateInput,
) {
  const nextStyle = updates.style
    ? {
        ...element.style,
        ...updates.style,
      }
    : element.style

  return {
    ...element,
    ...updates,
    assetPath: element.assetPath,
    content: updates.content ?? element.content,
    height: updates.height ?? element.height,
    isResolved: updates.isResolved ?? element.isResolved,
    pathData: updates.pathData ?? element.pathData,
    style: nextStyle,
    updatedAt: element.updatedAt,
    url: updates.url ?? element.url,
    width: updates.width ?? element.width,
    x: updates.x ?? element.x,
    y: updates.y ?? element.y,
    zIndex: updates.zIndex ?? element.zIndex,
  } satisfies CanvasElement
}
