import {blobStore} from '../../platform/blob/blob-store'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import type {
  CanvasElement,
  CanvasElementBatchUpdateInput,
  CanvasElementCreateInput,
  CanvasElementStyle,
  CanvasElementUpdateInput,
  CanvasImageUploadInput,
} from './canvas.types'
import {
  CANVAS_ELEMENT_BATCH_MUTATION_LIMIT,
  canvasShapeStrokeStyles,
  canvasShapeTextAlignments,
  canvasShapeTextFamilies,
  canvasShapeTypes,
} from './canvas.types'

const CANVAS_IMAGE_MAX_DIMENSION = 400
const CANVAS_IMAGE_BUCKET = 'project-attachments'
const CANVAS_IMAGE_URL_TTL_SECONDS = 60 * 60 * 24 * 365

type CanvasElementBatchUpdateRpcInput = {
  content?: string | null
  height?: number
  id: string
  is_resolved?: boolean
  path_data?: string | null
  style?: CanvasElementStyle
  url?: string | null
  width?: number
  x?: number
  y?: number
  z_index?: number
}

export type CanvasElementRow = {
  content: string | null
  created_at: string
  created_by: string | null
  element_type: CanvasElement['elementType']
  height: number
  id: string
  is_resolved: boolean
  path_data: string | null
  project_view_id: string
  style: Record<string, unknown> | null
  updated_at: string
  url: string | null
  width: number
  x: number
  y: number
  z_index: number
}

function isExternalCanvasUrl(value: string) {
  return /^[a-z]+:\/\//i.test(value) || value.startsWith('data:')
}

function mapCanvasElementStyle(value: unknown): CanvasElementStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const style = value as Record<string, unknown>
  const hasStyleKey = (key: string) => Object.prototype.hasOwnProperty.call(style, key)
  const mapString = (key: string) => {
    if (!hasStyleKey(key)) {
      return undefined
    }

    return typeof style[key] === 'string' ? style[key] : style[key] === null ? null : undefined
  }
  const mapNumber = (key: string) => {
    if (!hasStyleKey(key)) {
      return undefined
    }

    return typeof style[key] === 'number' ? style[key] : style[key] === null ? null : undefined
  }
  const mapEnum = <T extends readonly string[]>(key: string, values: T) => {
    if (!hasStyleKey(key)) {
      return undefined
    }

    return typeof style[key] === 'string' && values.includes(style[key] as T[number])
      ? style[key] as T[number]
      : style[key] === null
        ? null
        : undefined
  }
  const mapObject = (key: string) => {
    if (!hasStyleKey(key)) {
      return undefined
    }

    return style[key] && typeof style[key] === 'object' && !Array.isArray(style[key])
      ? style[key] as CanvasElementStyle['rich_text']
      : style[key] === null
        ? null
        : undefined
  }
  const nextStyle: CanvasElementStyle = {}
  const fillColor = mapString('fill_color')
  const richText = mapObject('rich_text')
  const shapeType = mapEnum('shape_type', canvasShapeTypes)
  const strokeColor = mapString('stroke_color')
  const strokeOpacity = mapNumber('stroke_opacity')
  const strokeStyle = mapEnum('stroke_style', canvasShapeStrokeStyles)
  const strokeWidth = mapNumber('stroke_width')
  const textAlign = mapEnum('text_align', canvasShapeTextAlignments)
  const textFamily = mapEnum('text_family', canvasShapeTextFamilies)
  const textSize = mapNumber('text_size')

  if (fillColor !== undefined) {
    nextStyle.fill_color = fillColor
  }
  if (richText !== undefined) {
    nextStyle.rich_text = richText
  }
  if (shapeType !== undefined) {
    nextStyle.shape_type = shapeType
  }
  if (strokeColor !== undefined) {
    nextStyle.stroke_color = strokeColor
  }
  if (strokeOpacity !== undefined) {
    nextStyle.stroke_opacity = strokeOpacity
  }
  if (strokeStyle !== undefined) {
    nextStyle.stroke_style = strokeStyle
  }
  if (strokeWidth !== undefined) {
    nextStyle.stroke_width = strokeWidth
  }
  if (textAlign !== undefined) {
    nextStyle.text_align = textAlign
  }
  if (textFamily !== undefined) {
    nextStyle.text_family = textFamily
  }
  if (textSize !== undefined) {
    nextStyle.text_size = textSize
  }

  return nextStyle
}

async function resolveCanvasImageSource(row: CanvasElementRow) {
  if (row.element_type !== 'image' || !row.url) {
    return {
      assetPath: null,
      url: row.url,
    }
  }

  if (isExternalCanvasUrl(row.url)) {
    return {
      assetPath: null,
      url: row.url,
    }
  }

  const {data, error} = await getSupabaseBrowserClient()
    .storage
    .from(CANVAS_IMAGE_BUCKET)
    .createSignedUrl(row.url, CANVAS_IMAGE_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw error ?? new Error('The uploaded image could not be prepared for canvas rendering.')
  }

  return {
    assetPath: row.url,
    url: data.signedUrl,
  }
}

function mapCanvasElementBatchUpdateInput({
  elementId,
  updates,
}: CanvasElementBatchUpdateInput): CanvasElementBatchUpdateRpcInput {
  const nextInput: CanvasElementBatchUpdateRpcInput = {
    id: elementId,
  }

  if (updates.content !== undefined) {
    nextInput.content = updates.content
  }
  if (updates.height !== undefined) {
    nextInput.height = updates.height
  }
  if (updates.isResolved !== undefined) {
    nextInput.is_resolved = updates.isResolved
  }
  if (updates.pathData !== undefined) {
    nextInput.path_data = updates.pathData
  }
  if (updates.style !== undefined) {
    nextInput.style = updates.style
  }
  if (updates.url !== undefined) {
    nextInput.url = updates.url
  }
  if (updates.width !== undefined) {
    nextInput.width = updates.width
  }
  if (updates.x !== undefined) {
    nextInput.x = updates.x
  }
  if (updates.y !== undefined) {
    nextInput.y = updates.y
  }
  if (updates.zIndex !== undefined) {
    nextInput.z_index = updates.zIndex
  }

  return nextInput
}

function assertCanvasElementBatchMutationLimit(elementCount: number) {
  if (elementCount > CANVAS_ELEMENT_BATCH_MUTATION_LIMIT) {
    throw new Error(`Canvas batch mutations support up to ${CANVAS_ELEMENT_BATCH_MUTATION_LIMIT} elements at a time.`)
  }
}

export async function mapCanvasElementRow(row: CanvasElementRow): Promise<CanvasElement> {
  const imageSource = await resolveCanvasImageSource(row)

  return {
    assetPath: imageSource.assetPath,
    content: row.content,
    createdAt: row.created_at,
    createdBy: row.created_by,
    elementType: row.element_type,
    height: Number.isFinite(row.height) ? row.height : 150,
    id: row.id,
    isResolved: row.is_resolved === true,
    pathData: row.path_data,
    projectViewId: row.project_view_id,
    style: mapCanvasElementStyle(row.style),
    updatedAt: row.updated_at,
    url: imageSource.url,
    width: Number.isFinite(row.width) ? row.width : 200,
    x: Number.isFinite(row.x) ? row.x : 0,
    y: Number.isFinite(row.y) ? row.y : 0,
    zIndex: Number.isFinite(row.z_index) ? row.z_index : 0,
  }
}

async function measureImage(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const {height, width} = await new Promise<{height: number; width: number}>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({height: image.naturalHeight, width: image.naturalWidth})
      image.onerror = () => reject(new Error('The selected image could not be loaded.'))
      image.src = objectUrl
    })

    if (width <= 0 || height <= 0) {
      throw new Error('The selected image could not be loaded.')
    }

    const scale = Math.min(1, CANVAS_IMAGE_MAX_DIMENSION / Math.max(width, height))

    return {
      height: Math.max(80, Math.round(height * scale)),
      width: Math.max(80, Math.round(width * scale)),
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export type CanvasRepository = {
  createCanvasElement(input: CanvasElementCreateInput): Promise<CanvasElement>
  deleteCanvasElement(elementId: string): Promise<void>
  deleteCanvasElements(projectViewId: string, elementIds: string[]): Promise<void>
  listCanvasElements(projectViewId: string): Promise<CanvasElement[]>
  updateCanvasElement(elementId: string, updates: CanvasElementUpdateInput): Promise<CanvasElement>
  updateCanvasElements(projectViewId: string, inputs: CanvasElementBatchUpdateInput[]): Promise<CanvasElement[]>
  uploadCanvasImage(input: CanvasImageUploadInput): Promise<CanvasElement>
}

export const canvasRepository: CanvasRepository = {
  async createCanvasElement(input) {
    const data = await rpcAdapter.call<CanvasElementRow>('create_canvas_element', {
      target_content: input.content ?? null,
      target_element_type: input.elementType,
      target_height: input.height ?? null,
      target_is_resolved: input.isResolved ?? false,
      target_path_data: input.pathData ?? null,
      target_project_view_id: input.projectViewId,
      target_style: input.style ?? {},
      target_url: input.url ?? null,
      target_width: input.width ?? null,
      target_x: input.x,
      target_y: input.y,
      target_z_index: input.zIndex ?? null,
    })

    return await mapCanvasElementRow(data)
  },
  async deleteCanvasElement(elementId) {
    await rpcAdapter.call('delete_canvas_element', {
      target_element_id: elementId,
    })
  },
  async deleteCanvasElements(projectViewId, elementIds) {
    if (elementIds.length === 0) {
      return
    }
    assertCanvasElementBatchMutationLimit(elementIds.length)

    await rpcAdapter.call('delete_canvas_elements', {
      target_element_ids: elementIds,
      target_project_view_id: projectViewId,
    })
  },
  async listCanvasElements(projectViewId) {
    const {data, error} = await getSupabaseBrowserClient()
      .from('canvas_elements')
      .select('*')
      .eq('project_view_id', projectViewId)
      .order('z_index', {ascending: true})
      .order('updated_at', {ascending: true})

    if (error) {
      throw error
    }

    return await Promise.all((data ?? []).map((row) => mapCanvasElementRow(row as CanvasElementRow)))
  },
  async updateCanvasElement(elementId, updates) {
    const data = await rpcAdapter.call<CanvasElementRow>('update_canvas_element', {
      target_content: updates.content ?? null,
      target_element_id: elementId,
      target_height: updates.height ?? null,
      target_is_resolved: updates.isResolved ?? null,
      target_path_data: updates.pathData ?? null,
      target_style: updates.style ?? null,
      target_url: updates.url ?? null,
      target_width: updates.width ?? null,
      target_x: updates.x ?? null,
      target_y: updates.y ?? null,
      target_z_index: updates.zIndex ?? null,
    })

    return await mapCanvasElementRow(data)
  },
  async updateCanvasElements(projectViewId, inputs) {
    if (inputs.length === 0) {
      return []
    }
    assertCanvasElementBatchMutationLimit(inputs.length)

    const data = await rpcAdapter.call<CanvasElementRow[]>('update_canvas_elements', {
      target_project_view_id: projectViewId,
      target_updates: inputs.map((input) => mapCanvasElementBatchUpdateInput(input)),
    })

    return await Promise.all((data ?? []).map((row) => mapCanvasElementRow(row)))
  },
  async uploadCanvasImage(input) {
    if (!input.file.type.startsWith('image/')) {
      throw new Error('Only image uploads are supported on the canvas.')
    }

    const dimensions = await measureImage(input.file)
    const storagePath = await blobStore.uploadProjectAttachment({
      file: input.file,
      parentId: input.projectViewId,
      projectId: input.projectId,
    })

    try {
      return await canvasRepository.createCanvasElement({
        elementType: 'image',
        height: dimensions.height,
        projectViewId: input.projectViewId,
        url: storagePath,
        width: dimensions.width,
        x: input.x,
        y: input.y,
        zIndex: input.zIndex,
      })
    } catch (error) {
      await blobStore.remove([storagePath])
      throw error
    }
  },
}
