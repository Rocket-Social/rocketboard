import {blobStore} from '../../platform/blob/blob-store'
import {rpcAdapter} from '../../platform/data/rpc-adapter'
import {getSupabaseBrowserClient} from '../../platform/supabase/client'
import type {
  CanvasElement,
  CanvasElementCreateInput,
  CanvasElementStyle,
  CanvasElementUpdateInput,
  CanvasImageUploadInput,
} from './canvas.types'

const CANVAS_IMAGE_MAX_DIMENSION = 400
const CANVAS_IMAGE_BUCKET = 'project-attachments'
const CANVAS_IMAGE_URL_TTL_SECONDS = 60 * 60 * 24 * 365

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

  return {
    fill_color: typeof style.fill_color === 'string' ? style.fill_color : null,
    shape_type:
      style.shape_type === 'circle' || style.shape_type === 'rectangle'
        ? style.shape_type
        : null,
    stroke_color: typeof style.stroke_color === 'string' ? style.stroke_color : null,
    stroke_opacity: typeof style.stroke_opacity === 'number' ? style.stroke_opacity : null,
    stroke_width: typeof style.stroke_width === 'number' ? style.stroke_width : null,
  }
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
  listCanvasElements(projectViewId: string): Promise<CanvasElement[]>
  updateCanvasElement(elementId: string, updates: CanvasElementUpdateInput): Promise<CanvasElement>
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
