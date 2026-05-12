/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, cleanup, render} from '@testing-library/react'
import type {ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {CanvasElement, CanvasElementTransformPreview, CanvasViewport} from './canvas.types'

const canvasInteractionState = vi.hoisted(() => ({
  setViewport: null as null | ((
    updater: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)
  ) => void),
  setSelectedElementIds: null as null | ((elementIds: string[]) => void),
  elements: [] as Array<{
    height: number
    id: string
    elementType?: CanvasElement['elementType']
    width: number
    x: number
    y: number
  }>,
  createElement: vi.fn(),
  deleteElements: vi.fn(),
  keyboardShortcuts: null as null | {
    canCopySelected: boolean
    hasPasteableSelection: boolean
    onCopySelected: () => void
    onDeleteSelected: () => void
    onPasteSelection: () => void
  },
  getLastPointerCanvasPosition: vi.fn<() => ({x: number; y: number} | null)>(),
  transformPreview: null as CanvasElementTransformPreview | null,
  transformPreviews: [] as CanvasElementTransformPreview[],
}))

function buildShapeElement(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    assetPath: null,
    content: 'Shape',
    createdAt: '2026-04-23T00:00:00.000Z',
    createdBy: 'user-1',
    elementType: 'shape',
    height: 80,
    id: 'shape-1',
    isResolved: false,
    pathData: null,
    projectViewId: 'view-1',
    style: {
      fill_color: '#f2eee6',
      shape_type: 'rectangle',
      stroke_color: '#17202b',
      stroke_opacity: 1,
      stroke_width: 2,
    },
    updatedAt: '2026-04-23T00:00:00.000Z',
    url: null,
    width: 120,
    x: 200,
    y: 140,
    zIndex: 3,
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {promise, reject, resolve}
}

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('../projects/personal-view-storage', async () => {
  const actual = await vi.importActual<typeof import('../projects/personal-view-storage')>('../projects/personal-view-storage')

  return {
    ...actual,
    setPersonalCanvasViewportToStorage: vi.fn(actual.setPersonalCanvasViewportToStorage),
  }
})

vi.mock('./canvas.queries', () => ({
  useCanvasElements: () => ({
    data: canvasInteractionState.elements,
    error: null,
    isPending: false,
    refetch: vi.fn(),
  }),
  useCreateCanvasElement: () => ({
    mutateAsync: canvasInteractionState.createElement,
  }),
  useDeleteCanvasElements: () => ({
    mutate: canvasInteractionState.deleteElements,
  }),
  useUpdateCanvasElement: () => ({
    mutateAsync: vi.fn(),
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
  CanvasSurface: ({children}: {children: ReactNode}) => <div data-testid='canvas-surface'>{children}</div>,
}))

vi.mock('./CanvasDrawingLayer', () => ({
  CanvasDrawingLayer: () => <div data-testid='drawing-layer'/>,
  resolveCanvasFrame: (element: CanvasElement) => ({
    height: element.height,
    width: element.width,
    x: element.x,
    y: element.y,
  }),
}))

vi.mock('./CanvasElements', () => ({
  CanvasElements: ({elements, onElementPointerDown}: {
    elements: CanvasElement[]
    onElementPointerDown: (event: unknown, element: CanvasElement) => void
  }) => (
    <div data-testid='canvas-elements'>
      {elements.map((element) => (
        <button
          data-testid={`canvas-element-${element.id}`}
          key={element.id}
          onClick={() => {
            onElementPointerDown({
              button: 0,
              clientX: element.x + element.width / 2,
              clientY: element.y + element.height / 2,
              currentTarget: document.createElement('div'),
              pointerId: 1,
              pointerType: 'mouse',
              stopPropagation: vi.fn(),
            }, element)
          }}
          type='button'
        />
      ))}
    </div>
  ),
}))

vi.mock('./CanvasCommentPins', () => ({
  CanvasCommentPins: () => <div data-testid='comment-pins'/>,
}))

vi.mock('./CanvasShapeContextToolbar', () => ({
  CanvasShapeContextToolbar: () => <div data-testid='shape-toolbar'/>,
}))

vi.mock('./CanvasToolbar', () => ({
  CanvasToolbar: () => <div data-testid='canvas-toolbar'/>,
}))

vi.mock('./useCanvasKeyboardShortcuts', () => ({
  useCanvasKeyboardShortcuts: vi.fn((options) => {
    canvasInteractionState.keyboardShortcuts = options
  }),
}))

vi.mock('./useCanvasInteraction', () => ({
  useCanvasInteraction: (args: {
    setEditingElementId: (elementId: string | null) => void
    setSelectedElementId: (elementId: string | null) => void
    setSelectedElementIds: (elementIds: string[]) => void
    setViewport: (updater: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)) => void
  }) => {
    canvasInteractionState.setViewport = args.setViewport
    canvasInteractionState.setSelectedElementIds = args.setSelectedElementIds

    return {
      handleElementPointerDown: vi.fn((_event: unknown, element: CanvasElement) => {
        canvasInteractionState.getLastPointerCanvasPosition.mockReturnValue({
          x: element.x + element.width / 2,
          y: element.y + element.height / 2,
        })
        args.setSelectedElementId(element.id)
        args.setEditingElementId(null)
      }),
      handleResizeHandlePointerDown: vi.fn(),
      handleSurfacePointerCancel: vi.fn(),
      handleSurfacePointerDown: vi.fn(),
      handleSurfacePointerMove: vi.fn(),
      handleSurfacePointerUp: vi.fn(),
      handleSurfaceWheel: vi.fn(),
      getLastPointerCanvasPosition: canvasInteractionState.getLastPointerCanvasPosition,
      previewDrawing: null,
      previewSelectionMarquee: null,
      previewShape: null,
      surfaceRef: {current: null},
      transformPreview: canvasInteractionState.transformPreview,
      transformPreviews: canvasInteractionState.transformPreviews,
    }
  },
}))

import {
  getPersonalCanvasViewport,
  setPersonalCanvasViewportToStorage,
} from '../projects/personal-view-storage'
import {CanvasView} from './CanvasView'

function updateViewport(nextViewport: CanvasViewport | ((current: CanvasViewport) => CanvasViewport)) {
  if (!canvasInteractionState.setViewport) {
    throw new Error('Canvas interaction setter not captured')
  }

  act(() => {
    canvasInteractionState.setViewport?.(nextViewport)
  })
}

describe('CanvasView viewport persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.clearAllMocks()
    canvasInteractionState.setViewport = null
    canvasInteractionState.setSelectedElementIds = null
    canvasInteractionState.elements = []
    canvasInteractionState.createElement.mockReset()
    canvasInteractionState.deleteElements.mockReset()
    canvasInteractionState.keyboardShortcuts = null
    canvasInteractionState.getLastPointerCanvasPosition.mockReset()
    canvasInteractionState.getLastPointerCanvasPosition.mockReturnValue(null)
    canvasInteractionState.transformPreview = null
    canvasInteractionState.transformPreviews = []
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('debounces rapid viewport updates into a single storage write', async () => {
    render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    updateViewport({scale: 1, x: -24, y: 16})
    updateViewport({scale: 1.25, x: -80, y: 32})

    expect(setPersonalCanvasViewportToStorage).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(199)
    })

    expect(setPersonalCanvasViewportToStorage).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(setPersonalCanvasViewportToStorage).toHaveBeenCalledTimes(1)
    expect(setPersonalCanvasViewportToStorage).toHaveBeenLastCalledWith('view-1', {
      scale: 1.25,
      x: -80,
      y: 32,
    })
    expect(getPersonalCanvasViewport('view-1')).toEqual({
      scale: 1.25,
      x: -80,
      y: 32,
    })
  })

  it('flushes the previous board once on view switch without writing the new board immediately', async () => {
    const {rerender} = render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    updateViewport({scale: 1, x: -40, y: 20})

    rerender(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-2'
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(setPersonalCanvasViewportToStorage).toHaveBeenCalledWith('view-1', {
      scale: 1,
      x: -40,
      y: 20,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(getPersonalCanvasViewport('view-1')).toEqual({
      scale: 1,
      x: -40,
      y: 20,
    })
    expect(getPersonalCanvasViewport('view-2')).toBeNull()
    expect(setPersonalCanvasViewportToStorage).toHaveBeenCalledTimes(1)
  })

  it('flushes the latest pending viewport on unmount', () => {
    const {unmount} = render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    updateViewport({
      scale: 0.96,
      x: 48,
      y: -12,
    })

    unmount()

    expect(setPersonalCanvasViewportToStorage).toHaveBeenCalledTimes(1)
    expect(setPersonalCanvasViewportToStorage).toHaveBeenLastCalledWith('view-1', {
      scale: 0.96,
      x: 48,
      y: -12,
    })
    expect(getPersonalCanvasViewport('view-1')).toEqual({
      scale: 0.96,
      x: 48,
      y: -12,
    })
  })

  it('advances the clipboard placement synchronously across rapid repeated pastes', async () => {
    const sourceShape = buildShapeElement()
    const firstPaste = createDeferred<CanvasElement>()
    const secondPaste = createDeferred<CanvasElement>()

    canvasInteractionState.elements = [sourceShape]
    canvasInteractionState.createElement
      .mockImplementationOnce(() => firstPaste.promise)
      .mockImplementationOnce(() => secondPaste.promise)

    const {getByTestId} = render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    act(() => {
      getByTestId(`canvas-element-${sourceShape.id}`).click()
    })

    expect(canvasInteractionState.keyboardShortcuts?.canCopySelected).toBe(true)

    act(() => {
      canvasInteractionState.keyboardShortcuts?.onCopySelected()
    })

    expect(canvasInteractionState.keyboardShortcuts?.hasPasteableSelection).toBe(true)

    canvasInteractionState.getLastPointerCanvasPosition.mockReturnValue({x: 540, y: 360})

    const pasteSelection = canvasInteractionState.keyboardShortcuts?.onPasteSelection

    expect(pasteSelection).toBeTypeOf('function')

    act(() => {
      pasteSelection?.()
      pasteSelection?.()
    })

    expect(canvasInteractionState.createElement).toHaveBeenCalledTimes(2)
    expect(canvasInteractionState.createElement.mock.calls[0][0]).toMatchObject({
      x: 480,
      y: 320,
    })
    expect(canvasInteractionState.createElement.mock.calls[1][0]).toMatchObject({
      x: 504,
      y: 344,
    })

    firstPaste.resolve({
      ...sourceShape,
      id: 'shape-copy-1',
      x: 480,
      y: 320,
    })
    secondPaste.resolve({
      ...sourceShape,
      id: 'shape-copy-2',
      x: 504,
      y: 344,
    })

    await act(async () => {
      await Promise.all([firstPaste.promise, secondPaste.promise])
    })
  })

  it('batch deletes every selected canvas element and restores selection on error', async () => {
    vi.useRealTimers()
    const firstShape = buildShapeElement()
    const secondShape = buildShapeElement({
      id: 'shape-2',
      x: 360,
      y: 260,
    })
    let mutateOptions: {onError?: (error: Error) => void} | null = null

    canvasInteractionState.elements = [firstShape, secondShape]
    canvasInteractionState.deleteElements.mockImplementation((_elementIds: string[], options: {onError?: (error: Error) => void}) => {
      mutateOptions = options
    })

    const {getByText, queryByText} = render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    act(() => {
      canvasInteractionState.setSelectedElementIds?.([firstShape.id, secondShape.id])
    })

    expect(getByText('2 selected')).toBeInTheDocument()

    act(() => {
      canvasInteractionState.keyboardShortcuts?.onDeleteSelected()
    })

    expect(canvasInteractionState.deleteElements).toHaveBeenCalledTimes(1)
    expect(canvasInteractionState.deleteElements).toHaveBeenCalledWith([firstShape.id, secondShape.id], expect.any(Object))
    expect(queryByText('2 selected')).not.toBeInTheDocument()

    act(() => {
      mutateOptions?.onError?.(new Error('delete failed'))
    })

    expect(getByText('2 selected')).toBeInTheDocument()
  })

  it('hides the shape toolbar while spacing guides are active and restores it after shift is released', () => {
    vi.useRealTimers()
    const sourceShape = buildShapeElement()

    canvasInteractionState.elements = [sourceShape]

    const {getByTestId, queryByTestId, rerender} = render(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    act(() => {
      getByTestId(`canvas-element-${sourceShape.id}`).click()
    })

    expect(getByTestId('shape-toolbar')).toBeInTheDocument()

    canvasInteractionState.transformPreview = {
      elementId: sourceShape.id,
      height: sourceShape.height,
      width: sourceShape.width,
      x: sourceShape.x,
      y: sourceShape.y,
      guides: {
        alignment: [],
        size: [],
        spacing: [{
          axis: 'y',
          distance: 48,
          kind: 'spacing',
          segments: [],
        }],
      },
    }

    rerender(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    expect(queryByTestId('shape-toolbar')).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Shift'}))
    })

    expect(queryByTestId('shape-toolbar')).not.toBeInTheDocument()

    canvasInteractionState.transformPreview = null
    rerender(
      <CanvasView
        canEdit
        projectId='project-1'
        projectViewId='view-1'
      />,
    )

    expect(queryByTestId('shape-toolbar')).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', {key: 'Shift'}))
    })

    expect(getByTestId('shape-toolbar')).toBeInTheDocument()
  })
})
