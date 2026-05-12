/** @vitest-environment jsdom */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {
  createSignedUrlMock,
  fromMock,
  getSupabaseBrowserClientMock,
  removeMock,
  rpcCallMock,
  uploadProjectAttachmentMock,
} = vi.hoisted(() => ({
  createSignedUrlMock: vi.fn(),
  fromMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
  removeMock: vi.fn(),
  rpcCallMock: vi.fn(),
  uploadProjectAttachmentMock: vi.fn(),
}))

vi.mock('../../platform/blob/blob-store', () => ({
  blobStore: {
    remove: removeMock,
    uploadProjectAttachment: uploadProjectAttachmentMock,
  },
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: rpcCallMock,
  },
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

import {canvasRepository, mapCanvasElementRow, type CanvasElementRow} from './canvas.repository'

function buildCanvasElementRow(overrides: Partial<CanvasElementRow> = {}): CanvasElementRow {
  return {
    content: null,
    created_at: '2026-04-01T00:00:00.000Z',
    created_by: 'user-1',
    element_type: 'image',
    height: 200,
    id: 'element-1',
    is_resolved: false,
    path_data: null,
    project_view_id: 'view-1',
    style: {},
    updated_at: '2026-04-01T00:00:00.000Z',
    url: 'project-1/view-1/image.png',
    width: 400,
    x: 24,
    y: 36,
    z_index: 3,
    ...overrides,
  }
}

class MockImage {
  naturalHeight = 400
  naturalWidth = 800
  onerror: (() => void) | null = null
  onload: (() => void) | null = null

  set src(_value: string) {
    queueMicrotask(() => {
      this.onload?.()
    })
  }
}

const originalImage = global.Image
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('canvasRepository', () => {
  beforeEach(() => {
    createSignedUrlMock.mockReset()
    fromMock.mockReset()
    getSupabaseBrowserClientMock.mockReset()
    removeMock.mockReset()
    rpcCallMock.mockReset()
    uploadProjectAttachmentMock.mockReset()

    fromMock.mockReturnValue({
      createSignedUrl: createSignedUrlMock,
    })

    getSupabaseBrowserClientMock.mockReturnValue({
      storage: {
        from: fromMock,
      },
    })

    global.Image = MockImage as unknown as typeof Image
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:canvas-image'),
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    })
  })

  afterEach(() => {
    global.Image = originalImage
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
      writable: true,
    })
  })

  it('hydrates image storage paths into signed render URLs', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: {signedUrl: 'https://signed.example.com/canvas-image'},
      error: null,
    })

    await expect(mapCanvasElementRow(buildCanvasElementRow())).resolves.toMatchObject({
      assetPath: 'project-1/view-1/image.png',
      url: 'https://signed.example.com/canvas-image',
    })

    expect(fromMock).toHaveBeenCalledWith('project-attachments')
    expect(createSignedUrlMock).toHaveBeenCalledWith('project-1/view-1/image.png', 31536000)
  })

  it('keeps external image URLs unchanged', async () => {
    const row = buildCanvasElementRow({
      url: 'https://example.com/reference.png',
    })

    await expect(mapCanvasElementRow(row)).resolves.toMatchObject({
      assetPath: null,
      url: 'https://example.com/reference.png',
    })

    expect(createSignedUrlMock).not.toHaveBeenCalled()
  })

  it('preserves the distinction between missing and explicit null shape fills', async () => {
    const missingFill = await mapCanvasElementRow(buildCanvasElementRow({
      element_type: 'shape',
      style: {},
      url: null,
    }))
    const noFill = await mapCanvasElementRow(buildCanvasElementRow({
      element_type: 'shape',
      style: {fill_color: null},
      url: null,
    }))

    expect(missingFill.style).not.toHaveProperty('fill_color')
    expect(noFill.style.fill_color).toBeNull()
  })

  it('stores the uploaded storage path and only signs on readback', async () => {
    uploadProjectAttachmentMock.mockResolvedValue('project-1/view-1/uploaded-image.png')
    createSignedUrlMock.mockResolvedValue({
      data: {signedUrl: 'https://signed.example.com/uploaded-image'},
      error: null,
    })
    rpcCallMock.mockResolvedValue(buildCanvasElementRow({
      url: 'project-1/view-1/uploaded-image.png',
      x: 180,
      y: 220,
    }))

    const result = await canvasRepository.uploadCanvasImage({
      file: new File(['canvas'], 'canvas.png', {type: 'image/png'}),
      projectId: 'project-1',
      projectViewId: 'view-1',
      x: 180,
      y: 220,
      zIndex: 7,
    })

    expect(result).toMatchObject({
      assetPath: 'project-1/view-1/uploaded-image.png',
      url: 'https://signed.example.com/uploaded-image',
    })

    expect(rpcCallMock).toHaveBeenCalledWith('create_canvas_element', expect.objectContaining({
      target_project_view_id: 'view-1',
      target_url: 'project-1/view-1/uploaded-image.png',
      target_x: 180,
      target_y: 220,
      target_z_index: 7,
    }))
  })

  it('deletes canvas elements through the batch RPC', async () => {
    rpcCallMock.mockResolvedValue(null)

    await canvasRepository.deleteCanvasElements('view-1', ['shape-1', 'shape-2'])

    expect(rpcCallMock).toHaveBeenCalledWith('delete_canvas_elements', {
      target_element_ids: ['shape-1', 'shape-2'],
      target_project_view_id: 'view-1',
    })
  })

  it('rejects oversized batch deletes before calling the RPC', async () => {
    const elementIds = Array.from({length: 251}, (_value, index) => `shape-${index}`)

    await expect(canvasRepository.deleteCanvasElements('view-1', elementIds))
      .rejects
      .toThrow('Canvas batch mutations support up to 250 elements at a time.')

    expect(rpcCallMock).not.toHaveBeenCalled()
  })

  it('updates canvas elements through the batch RPC', async () => {
    rpcCallMock.mockResolvedValue([
      buildCanvasElementRow({
        element_type: 'shape',
        id: 'shape-1',
        url: null,
        x: 220,
        y: 260,
      }),
      buildCanvasElementRow({
        element_type: 'shape',
        id: 'shape-2',
        url: null,
        x: 360,
        y: 420,
      }),
    ])

    const result = await canvasRepository.updateCanvasElements('view-1', [{
      elementId: 'shape-1',
      updates: {
        x: 220,
        y: 260,
      },
    }, {
      elementId: 'shape-2',
      updates: {
        x: 360,
        y: 420,
      },
    }])

    expect(rpcCallMock).toHaveBeenCalledWith('update_canvas_elements', {
      target_project_view_id: 'view-1',
      target_updates: [{
        id: 'shape-1',
        x: 220,
        y: 260,
      }, {
        id: 'shape-2',
        x: 360,
        y: 420,
      }],
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'shape-1',
      x: 220,
      y: 260,
    })
  })

  it('rejects oversized batch updates before calling the RPC', async () => {
    const inputs = Array.from({length: 251}, (_value, index) => ({
      elementId: `shape-${index}`,
      updates: {x: index},
    }))

    await expect(canvasRepository.updateCanvasElements('view-1', inputs))
      .rejects
      .toThrow('Canvas batch mutations support up to 250 elements at a time.')

    expect(rpcCallMock).not.toHaveBeenCalled()
  })

  it('keeps omitted batch update fields distinct from explicit null fields', async () => {
    rpcCallMock.mockResolvedValue([
      buildCanvasElementRow({
        content: null,
        element_type: 'comment',
        id: 'comment-1',
        path_data: null,
        url: null,
      }),
    ])

    await canvasRepository.updateCanvasElements('view-1', [{
      elementId: 'comment-1',
      updates: {
        content: null,
        pathData: null,
        url: null,
        x: 128,
      },
    }])

    expect(rpcCallMock).toHaveBeenCalledWith('update_canvas_elements', {
      target_project_view_id: 'view-1',
      target_updates: [{
        content: null,
        id: 'comment-1',
        path_data: null,
        url: null,
        x: 128,
      }],
    })
  })
})
