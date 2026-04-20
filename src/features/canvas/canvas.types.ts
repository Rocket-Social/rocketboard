export const canvasElementTypes = ['note', 'shape', 'drawing', 'image', 'comment', 'text'] as const

export const canvasToolModes = ['select', 'hand', 'pen', 'note', 'shape', 'comment'] as const

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

export const DEFAULT_CANVAS_VIEWPORT = {
  scale: 1,
  x: 120,
  y: 96,
} as const

export type CanvasElementType = (typeof canvasElementTypes)[number]
export type CanvasToolMode = (typeof canvasToolModes)[number]
export type CanvasShapeType = 'rectangle' | 'circle'

export type CanvasElementStyle = {
  fill_color?: string | null
  shape_type?: CanvasShapeType | null
  stroke_color?: string | null
  stroke_opacity?: number | null
  stroke_width?: number | null
}

export type CanvasViewport = {
  scale: number
  x: number
  y: number
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

export function mergeCanvasElement(
  element: CanvasElement,
  updates: CanvasElementUpdateInput,
) {
  return {
    ...element,
    ...updates,
    assetPath: element.assetPath,
    content: updates.content ?? element.content,
    height: updates.height ?? element.height,
    isResolved: updates.isResolved ?? element.isResolved,
    pathData: updates.pathData ?? element.pathData,
    style: updates.style ?? element.style,
    updatedAt: element.updatedAt,
    url: updates.url ?? element.url,
    width: updates.width ?? element.width,
    x: updates.x ?? element.x,
    y: updates.y ?? element.y,
    zIndex: updates.zIndex ?? element.zIndex,
  } satisfies CanvasElement
}
