/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, cleanup, render, waitFor} from '@testing-library/react'
import type {ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {plainTextToRichTextDocument} from '../rich-text/rich-text'
import type {CanvasElement, CanvasViewport} from './canvas.types'

const canvasState = vi.hoisted(() => ({
  drawingLayerProps: null as null | Record<string, unknown>,
  elements: [] as CanvasElement[],
  surfaceFocus: vi.fn(),
  setEditingElementId: null as null | ((elementId: string | null) => void),
  setSelectedElementId: null as null | ((elementId: string | null) => void),
  setViewport: null as null | ((
    updater: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)
  ) => void),
  toolbarProps: null as null | Record<string, unknown>,
  updateElement: vi.fn(),
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('./canvas.queries', () => ({
  useCanvasElements: () => ({
    data: canvasState.elements,
    error: null,
    isPending: false,
    refetch: vi.fn(),
  }),
  useCreateCanvasElement: () => ({
    mutateAsync: vi.fn(),
  }),
  useDeleteCanvasElements: () => ({
    mutate: vi.fn(),
  }),
  useUpdateCanvasElement: () => ({
    mutateAsync: canvasState.updateElement,
  }),
  useUpdateCanvasElements: () => ({
    mutateAsync: vi.fn(),
  }),
  useUploadCanvasImageElement: () => ({
    mutate: vi.fn(),
  }),
}))

vi.mock('./canvas.realtime', () => ({
  useCanvasRealtime: () => 'ready',
}))

vi.mock('./CanvasSurface', () => ({
  CanvasSurface: ({
    children,
    surfaceRef,
  }: {
    children: ReactNode
    surfaceRef: {current: HTMLDivElement | null}
  }) => (
    <div
      data-testid='canvas-surface'
      ref={(node) => {
        surfaceRef.current = node
        if (node) {
          node.focus = canvasState.surfaceFocus as typeof node.focus
        }
      }}
      tabIndex={0}
    >
      {children}
    </div>
  ),
}))

vi.mock('./CanvasDrawingLayer', () => ({
  CanvasDrawingLayer: (props: Record<string, unknown>) => {
    canvasState.drawingLayerProps = props

    return <div data-testid='drawing-layer'/>
  },
  resolveCanvasFrame: (element: CanvasElement) => ({
    height: element.height,
    width: element.width,
    x: element.x,
    y: element.y,
  }),
}))

vi.mock('./CanvasElements', () => ({
  CanvasElements: () => <div data-testid='canvas-elements'/>,
}))

vi.mock('./CanvasCommentPins', () => ({
  CanvasCommentPins: () => <div data-testid='comment-pins'/>,
}))

vi.mock('./CanvasToolbar', () => ({
  CanvasToolbar: () => <div data-testid='canvas-toolbar'/>,
}))

vi.mock('./CanvasShapeContextToolbar', () => ({
  CanvasShapeContextToolbar: (props: Record<string, unknown>) => {
    canvasState.toolbarProps = props
    return null
  },
}))

vi.mock('./useCanvasKeyboardShortcuts', () => ({
  useCanvasKeyboardShortcuts: vi.fn(),
}))

vi.mock('./useCanvasInteraction', () => ({
  useCanvasInteraction: (args: {
    setEditingElementId: (elementId: string | null) => void
    setSelectedElementId: (elementId: string | null) => void
    setViewport: (updater: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)) => void
  }) => {
    canvasState.setEditingElementId = args.setEditingElementId
    canvasState.setSelectedElementId = args.setSelectedElementId
    canvasState.setViewport = args.setViewport

    return {
      handleElementPointerDown: vi.fn(),
      handleResizeHandlePointerDown: vi.fn(),
      getLastPointerCanvasPosition: vi.fn(() => null),
      handleSurfacePointerCancel: vi.fn(),
      handleSurfacePointerDown: vi.fn(),
      handleSurfacePointerMove: vi.fn(),
      handleSurfacePointerUp: vi.fn(),
      handleSurfaceWheel: vi.fn(),
      previewDrawing: null,
      previewShape: null,
      surfaceRef: {current: null},
      transformPreview: null,
    }
  },
}))

import {CanvasView} from './CanvasView'
import {useCanvasKeyboardShortcuts} from './useCanvasKeyboardShortcuts'

const shapeElement: CanvasElement = {
  assetPath: null,
  content: 'Original text',
  createdAt: '2026-04-21T00:00:00.000Z',
  createdBy: 'user-1',
  elementType: 'shape',
  height: 180,
  id: 'shape-1',
  isResolved: false,
  pathData: null,
  projectViewId: 'view-1',
  style: {
    fill_color: '#f2eee6',
    shape_type: 'rectangle',
    stroke_color: '#17202b',
    stroke_opacity: 1,
    stroke_style: 'solid',
    stroke_width: 2,
    text_align: 'left',
    text_family: 'standard',
    text_size: 16,
  },
  updatedAt: '2026-04-21T00:00:00.000Z',
  url: null,
  width: 240,
  x: 120,
  y: 80,
  zIndex: 3,
}

function buildLegacyShapeElement(): CanvasElement {
  const legacyShape: CanvasElement = {
    ...shapeElement,
    id: 'shape-legacy',
    style: {
      ...shapeElement.style,
    },
  }

  delete legacyShape.style.text_align

  return legacyShape
}

function getDrawingLayerProps() {
  if (!canvasState.drawingLayerProps) {
    throw new Error('CanvasDrawingLayer props were not captured')
  }

  return canvasState.drawingLayerProps as {
    editingElementId: string | null
    onShapeEditorEscape: (elementId: string) => void
    onShapeTextDraftChange: (elementId: string, draft: {content: string; richText: unknown}) => void
    selectedElementId: string | null
    shapeEditingStyleDraft: {elementId: string; style: CanvasElement['style']} | null
    shapeTextDraft: {content: string; elementId: string; richText: unknown} | null
  }
}

function getKeyboardShortcutProps() {
  const call = vi.mocked(useCanvasKeyboardShortcuts).mock.calls.at(-1)

  if (!call) {
    throw new Error('Canvas keyboard shortcut props were not captured')
  }

  return call[0] as {
    onClearSelection: () => void
  }
}

function getToolbarProps() {
  if (!canvasState.toolbarProps) {
    throw new Error('CanvasShapeContextToolbar props were not captured')
  }

  return canvasState.toolbarProps as {
    onTextFamilyChange: (textFamily: 'standard' | 'technical' | 'scribbled') => void
  }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('CanvasView shape text editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canvasState.drawingLayerProps = null
    canvasState.elements = [shapeElement]
    canvasState.surfaceFocus.mockReset()
    canvasState.setEditingElementId = null
    canvasState.setSelectedElementId = null
    canvasState.setViewport = null
    canvasState.toolbarProps = null
    canvasState.updateElement.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('preserves the latest draft and editing session when a shape-text save fails', async () => {
    canvasState.updateElement.mockRejectedValueOnce(new Error('save failed'))

    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(shapeElement.id)
      canvasState.setEditingElementId?.(shapeElement.id)
    })
    await flushMicrotasks()

    const latestDraft = {
      content: 'Latest shape text',
      richText: plainTextToRichTextDocument('Latest shape text'),
    }

    await act(async () => {
      getDrawingLayerProps().onShapeTextDraftChange(shapeElement.id, latestDraft)
      canvasState.setSelectedElementId?.(null)
      canvasState.setEditingElementId?.(null)
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenCalledWith({
        elementId: shapeElement.id,
        updates: {
          content: latestDraft.content,
          style: {
            ...shapeElement.style,
            rich_text: latestDraft.richText,
          },
        },
      })
    })

    await flushMicrotasks()

    await waitFor(() => {
      expect(getDrawingLayerProps().selectedElementId).toBe(shapeElement.id)
      expect(getDrawingLayerProps().editingElementId).toBe(shapeElement.id)
      expect(getDrawingLayerProps().shapeTextDraft).toMatchObject({
        content: latestDraft.content,
        elementId: shapeElement.id,
      })
    })
  })

  it('drains newer shape-text edits that happen while a save is already in flight', async () => {
    let resolveFirstSave: (() => void) | null = null

    canvasState.updateElement
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstSave = () => resolve(shapeElement)
      }))
      .mockResolvedValueOnce(shapeElement)

    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(shapeElement.id)
      canvasState.setEditingElementId?.(shapeElement.id)
    })
    await flushMicrotasks()

    const firstDraft = {
      content: 'First save',
      richText: plainTextToRichTextDocument('First save'),
    }
    const secondDraft = {
      content: 'Second save',
      richText: plainTextToRichTextDocument('Second save'),
    }

    await act(async () => {
      getDrawingLayerProps().onShapeTextDraftChange(shapeElement.id, firstDraft)
      canvasState.setEditingElementId?.(null)
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenNthCalledWith(1, {
        elementId: shapeElement.id,
        updates: {
          content: firstDraft.content,
          style: {
            ...shapeElement.style,
            rich_text: firstDraft.richText,
          },
        },
      })
    })

    await act(async () => {
      getDrawingLayerProps().onShapeTextDraftChange(shapeElement.id, secondDraft)
    })

    await act(async () => {
      resolveFirstSave?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenNthCalledWith(2, {
        elementId: shapeElement.id,
        updates: {
          content: secondDraft.content,
          style: {
            ...shapeElement.style,
            rich_text: secondDraft.richText,
          },
        },
      })
    })

    await flushMicrotasks()

    await waitFor(() => {
      expect(getDrawingLayerProps().editingElementId).toBeNull()
      expect(getDrawingLayerProps().shapeTextDraft).toBeNull()
    })
  })

  it('preserves the latest local shape style when blur-save commits text', async () => {
    canvasState.updateElement.mockResolvedValue(shapeElement)

    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(shapeElement.id)
      canvasState.setEditingElementId?.(shapeElement.id)
    })
    await flushMicrotasks()

    const latestDraft = {
      content: 'Styled text',
      richText: plainTextToRichTextDocument('Styled text'),
    }

    await act(async () => {
      getDrawingLayerProps().onShapeTextDraftChange(shapeElement.id, latestDraft)
      getToolbarProps().onTextFamilyChange('technical')
      canvasState.setEditingElementId?.(null)
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenCalledWith({
        elementId: shapeElement.id,
        updates: {
          content: latestDraft.content,
          style: {
            ...shapeElement.style,
            rich_text: latestDraft.richText,
            text_family: 'technical',
          },
        },
      })
    })

    await flushMicrotasks()

    expect(canvasState.updateElement).toHaveBeenCalledTimes(1)
    expect(getDrawingLayerProps().editingElementId).toBeNull()
    expect(getDrawingLayerProps().shapeTextDraft).toBeNull()
  })

  it('materializes the centered text alignment when editing a legacy shape without text_align', async () => {
    const legacyShape = buildLegacyShapeElement()
    canvasState.elements = [legacyShape]
    canvasState.updateElement.mockResolvedValue(legacyShape)

    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(legacyShape.id)
      canvasState.setEditingElementId?.(legacyShape.id)
    })
    await flushMicrotasks()

    const latestDraft = {
      content: 'Centered text',
      richText: plainTextToRichTextDocument('Centered text'),
    }

    await act(async () => {
      getDrawingLayerProps().onShapeTextDraftChange(legacyShape.id, latestDraft)
      canvasState.setEditingElementId?.(null)
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenCalledWith({
        elementId: legacyShape.id,
        updates: {
          content: latestDraft.content,
          style: {
            ...legacyShape.style,
            rich_text: latestDraft.richText,
            text_align: 'center',
          },
        },
      })
    })
  })

  it('retries failed style saves before closing the editing session', async () => {
    const originalRichText = plainTextToRichTextDocument('Original text')

    canvasState.updateElement
      .mockRejectedValueOnce(new Error('style failed'))
      .mockResolvedValueOnce(shapeElement)

    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(shapeElement.id)
      canvasState.setEditingElementId?.(shapeElement.id)
    })
    await flushMicrotasks()

    await act(async () => {
      getToolbarProps().onTextFamilyChange('technical')
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenNthCalledWith(1, {
        elementId: shapeElement.id,
        updates: {
          content: shapeElement.content,
          style: {
            ...shapeElement.style,
            rich_text: originalRichText,
            text_family: 'technical',
          },
        },
      })
    })

    await act(async () => {
      canvasState.setEditingElementId?.(null)
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenNthCalledWith(2, {
        elementId: shapeElement.id,
        updates: {
          content: shapeElement.content,
          style: {
            ...shapeElement.style,
            rich_text: originalRichText,
            text_family: 'technical',
          },
        },
      })
    })

    await flushMicrotasks()

    expect(getDrawingLayerProps().editingElementId).toBeNull()
    expect(getDrawingLayerProps().shapeTextDraft).toBeNull()
    expect(getDrawingLayerProps().shapeEditingStyleDraft).toBeNull()
  })

  it('keeps the live shape editing session when the user re-enters the same shape during blur save', async () => {
    let resolvePendingSave: (() => void) | null = null

    canvasState.updateElement.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePendingSave = () => resolve(shapeElement)
    }))

    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(shapeElement.id)
      canvasState.setEditingElementId?.(shapeElement.id)
    })
    await flushMicrotasks()

    const latestDraft = {
      content: 'Still editing',
      richText: plainTextToRichTextDocument('Still editing'),
    }

    await act(async () => {
      getDrawingLayerProps().onShapeTextDraftChange(shapeElement.id, latestDraft)
      canvasState.setEditingElementId?.(null)
    })

    await waitFor(() => {
      expect(canvasState.updateElement).toHaveBeenCalledWith({
        elementId: shapeElement.id,
        updates: {
          content: latestDraft.content,
          style: {
            ...shapeElement.style,
            rich_text: latestDraft.richText,
          },
        },
      })
    })

    await act(async () => {
      canvasState.setEditingElementId?.(shapeElement.id)
    })

    await act(async () => {
      resolvePendingSave?.()
      await Promise.resolve()
    })

    await flushMicrotasks()

    expect(getDrawingLayerProps().editingElementId).toBe(shapeElement.id)
    expect(getDrawingLayerProps().shapeTextDraft).toMatchObject({
      content: latestDraft.content,
      elementId: shapeElement.id,
    })
  })

  it('backs out from text editing on Escape before clearing the selected shape on the next Escape', async () => {
    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    await act(async () => {
      canvasState.setSelectedElementId?.(shapeElement.id)
      canvasState.setEditingElementId?.(shapeElement.id)
    })
    await flushMicrotasks()

    await act(async () => {
      getDrawingLayerProps().onShapeEditorEscape(shapeElement.id)
    })
    await flushMicrotasks()

    expect(getDrawingLayerProps().selectedElementId).toBe(shapeElement.id)
    expect(getDrawingLayerProps().editingElementId).toBeNull()

    await act(async () => {
      getKeyboardShortcutProps().onClearSelection()
    })

    expect(getDrawingLayerProps().selectedElementId).toBeNull()
    expect(getDrawingLayerProps().editingElementId).toBeNull()
  })

  it('refocuses the canvas surface only after an Escape close actually lands', async () => {
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    try {
      render(
        <CanvasView
          canEdit
          projectId='project-1'
          projectViewId='view-1'
        />,
      )

      await act(async () => {
        canvasState.setSelectedElementId?.(shapeElement.id)
        canvasState.setEditingElementId?.(shapeElement.id)
      })
      await flushMicrotasks()

      await act(async () => {
        getDrawingLayerProps().onShapeEditorEscape(shapeElement.id)
      })
      await flushMicrotasks()

      expect(canvasState.surfaceFocus).toHaveBeenCalledTimes(1)

      canvasState.surfaceFocus.mockClear()
      canvasState.updateElement.mockRejectedValueOnce(new Error('save failed'))

      const latestDraft = {
        content: 'Latest shape text',
        richText: plainTextToRichTextDocument('Latest shape text'),
      }

      await act(async () => {
        canvasState.setEditingElementId?.(shapeElement.id)
      })
      await flushMicrotasks()

      await act(async () => {
        getDrawingLayerProps().onShapeTextDraftChange(shapeElement.id, latestDraft)
        getDrawingLayerProps().onShapeEditorEscape(shapeElement.id)
      })

      await waitFor(() => {
        expect(canvasState.updateElement).toHaveBeenCalledWith({
          elementId: shapeElement.id,
          updates: {
            content: latestDraft.content,
            style: {
              ...shapeElement.style,
              rich_text: latestDraft.richText,
            },
          },
        })
      })
      await flushMicrotasks()

      expect(getDrawingLayerProps().editingElementId).toBe(shapeElement.id)
      expect(canvasState.surfaceFocus).not.toHaveBeenCalled()

      await act(async () => {
        canvasState.setEditingElementId?.(null)
      })
      await flushMicrotasks()

      expect(canvasState.surfaceFocus).not.toHaveBeenCalled()
    } finally {
      requestAnimationFrameSpy.mockRestore()
      cancelAnimationFrameSpy.mockRestore()
    }
  })
})
