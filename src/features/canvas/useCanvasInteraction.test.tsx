/** @vitest-environment jsdom */

import {act, renderHook, waitFor} from '@testing-library/react'
import type {PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {useCanvasInteraction} from './useCanvasInteraction'
import {CANVAS_ELEMENT_BATCH_MUTATION_LIMIT, type CanvasElement, type CanvasViewport} from './canvas.types'

const viewport: CanvasViewport = {
  scale: 1,
  x: 0,
  y: 0,
}

type HookProps = {
  activeTool?: 'comment' | 'hand' | 'note' | 'pen' | 'select' | 'shape'
  elements?: CanvasElement[]
  selectedElementIds?: string[]
  useMultiSelection?: boolean
  viewport?: CanvasViewport
}

const element: CanvasElement = {
  assetPath: null,
  content: 'Shape',
  createdAt: '2026-04-21T00:00:00.000Z',
  createdBy: 'user-1',
  elementType: 'shape',
  height: 120,
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
  updatedAt: '2026-04-21T00:00:00.000Z',
  url: null,
  width: 160,
  x: 80,
  y: 100,
  zIndex: 7,
}

function createSurfaceElement() {
  const surface = document.createElement('div')

  Object.defineProperty(surface, 'getBoundingClientRect', {
    value: () => ({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      toJSON: () => ({}),
      top: 0,
      width: 800,
      x: 0,
      y: 0,
    }),
  })

  surface.focus = vi.fn()
  Object.defineProperty(surface, 'setPointerCapture', {
    value: vi.fn(),
  })

  return surface
}

function createPointerTarget() {
  const target = document.createElement('div')
  Object.defineProperty(target, 'setPointerCapture', {
    value: vi.fn(),
  })
  return target
}

function createButtonTarget() {
  const target = document.createElement('button')
  Object.defineProperty(target, 'setPointerCapture', {
    value: vi.fn(),
  })
  return target
}

function createElementPointerEvent({
  clientX,
  clientY,
  currentTarget,
  pointerId,
  shiftKey = false,
}: {
  clientX: number
  clientY: number
  currentTarget: HTMLElement
  pointerId: number
  shiftKey?: boolean
}) {
  return {
    button: 0,
    clientX,
    clientY,
    currentTarget,
    pointerId,
    pointerType: 'mouse',
    shiftKey,
    stopPropagation: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLElement>
}

function createSurfacePointerEvent({
  clientX,
  clientY,
  currentTarget,
  pointerId,
  shiftKey = false,
}: {
  clientX: number
  clientY: number
  currentTarget?: HTMLDivElement
  pointerId: number
  shiftKey?: boolean
}) {
  return {
    button: 0,
    clientX,
    clientY,
    currentTarget,
    pointerId,
    pointerType: 'mouse',
    shiftKey,
  } as unknown as ReactPointerEvent<HTMLDivElement>
}

function createSurfaceWheelEvent({
  clientX = 200,
  clientY = 150,
  ctrlKey = false,
  deltaMode = 0,
  deltaX = 0,
  deltaY,
  metaKey = false,
  shiftKey = false,
}: {
  clientX?: number
  clientY?: number
  ctrlKey?: boolean
  deltaMode?: number
  deltaX?: number
  deltaY: number
  metaKey?: boolean
  shiftKey?: boolean
}) {
  return {
    clientX,
    clientY,
    ctrlKey,
    deltaMode,
    deltaX,
    deltaY,
    metaKey,
    preventDefault: vi.fn(),
    shiftKey,
  } as unknown as ReactWheelEvent<HTMLDivElement>
}

describe('useCanvasInteraction', () => {
  function renderCanvasInteraction(props: HookProps = {}) {
    const onCreateElement = vi.fn().mockResolvedValue(element)
    const onSelectionLimitExceeded = vi.fn()
    const onUpdateElement = vi.fn().mockResolvedValue(undefined)
    const onUpdateElements = vi.fn().mockResolvedValue([])
    const setEditingElementId = vi.fn()
    const setSelectedElementId = vi.fn()
    const setSelectedElementIds = vi.fn()
    const setViewport = vi.fn()

    const hook = renderHook(
      ({activeTool = 'select', selectedElementIds = props.selectedElementIds ?? []}: HookProps) => useCanvasInteraction({
        activeTool,
        canEdit: true,
        elements: props.elements ?? [element],
        noteColor: '#fef3c7',
        onCreateElement,
        onSelectionLimitExceeded,
        onUpdateElement,
        onUpdateElements,
        penColor: '#17202b',
        penWidth: 3,
        projectViewId: 'view-1',
        selectedElementIds,
        setEditingElementId,
        setSelectedElementId,
        setSelectedElementIds: props.useMultiSelection ? setSelectedElementIds : undefined,
        setViewport,
        shapeFillColor: '#f2eee6',
        shapeType: 'rectangle',
        viewport: props.viewport ?? viewport,
      }),
      {
        initialProps: props,
      },
    )

    act(() => {
      hook.result.current.surfaceRef.current = createSurfaceElement()
    })

    return {
      ...hook,
      onCreateElement,
      onSelectionLimitExceeded,
      onUpdateElement,
      onUpdateElements,
      setEditingElementId,
      setSelectedElementId,
      setSelectedElementIds,
      setViewport,
    }
  }

  it('does not start dragging an element outside select mode', () => {
    const {
      onUpdateElement,
      result,
      setSelectedElementId,
    } = renderCanvasInteraction({activeTool: 'shape'})

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 1,
      }), element)
    })

    expect(setSelectedElementId).toHaveBeenCalledWith(element.id)
    expect(result.current.transformPreview).toBeNull()

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 1,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 1,
      }))
    })

    expect(onUpdateElement).not.toHaveBeenCalled()
  })

  it('creates new shapes with an explicit centered text alignment', async () => {
    const {
      onCreateElement,
      result,
    } = renderCanvasInteraction({activeTool: 'shape'})

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 120,
        clientY: 140,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 7,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 120,
        clientY: 140,
        pointerId: 7,
      }))
    })

    await waitFor(() => expect(onCreateElement).toHaveBeenCalledWith(expect.objectContaining({
      elementType: 'shape',
      style: expect.objectContaining({
        text_align: 'center',
      }),
    })))
  })

  it('only writes after a real move in select mode', async () => {
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction()

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 1,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 100,
        clientY: 120,
        pointerId: 1,
      }))
    })

    expect(onUpdateElement).not.toHaveBeenCalled()

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 2,
      }), element)
    })

    expect(result.current.transformPreview).toBeNull()

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 2,
      }))
    })

    expect(result.current.transformPreview).toEqual({
      elementId: element.id,
      guides: {
        alignment: [],
        size: [],
        spacing: [],
      },
      height: element.height,
      width: element.width,
      x: 200,
      y: 240,
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 2,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      x: 200,
      y: 240,
    }))
  })

  it('selects every element touched by a marquee drag', () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 320,
      y: 280,
      zIndex: 8,
    }
    const {
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      elements: [element, otherElement],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 20,
        clientY: 20,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 12,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 170,
        clientY: 150,
        pointerId: 12,
      }))
    })

    expect(result.current.previewSelectionMarquee).toEqual({
      height: 130,
      width: 150,
      x: 20,
      y: 20,
    })
    expect(setSelectedElementIds).toHaveBeenLastCalledWith([element.id])
    expect(setSelectedElementIds).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 170,
        clientY: 150,
        pointerId: 12,
      }))
    })

    expect(setSelectedElementIds).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 170,
        clientY: 150,
        pointerId: 12,
      }))
    })

    expect(result.current.previewSelectionMarquee).toBeNull()
  })

  it('caps marquee selection at the batch mutation limit', () => {
    const cappedElements: CanvasElement[] = Array.from(
      {length: CANVAS_ELEMENT_BATCH_MUTATION_LIMIT + 1},
      (_, index) => ({
        ...element,
        height: 4,
        id: `shape-${index + 1}`,
        width: 4,
        x: 10 + (index % 30) * 10,
        y: 10 + Math.floor(index / 30) * 10,
        zIndex: index,
      }),
    )
    const {
      onSelectionLimitExceeded,
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      elements: cappedElements,
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 0,
        clientY: 0,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 19,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 400,
        clientY: 200,
        pointerId: 19,
      }))
    })

    expect(setSelectedElementIds).toHaveBeenLastCalledWith(
      cappedElements.slice(0, CANVAS_ELEMENT_BATCH_MUTATION_LIMIT).map((candidate) => candidate.id),
    )
    expect(onSelectionLimitExceeded).toHaveBeenCalledWith(CANVAS_ELEMENT_BATCH_MUTATION_LIMIT)
    expect(onSelectionLimitExceeded).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 400,
        clientY: 200,
        pointerId: 19,
      }))
    })

    expect(setSelectedElementIds).toHaveBeenCalledTimes(1)
    expect(onSelectionLimitExceeded).toHaveBeenCalledTimes(1)
  })

  it('adds marquee hits to the current selection while shift is held', () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 320,
      y: 280,
      zIndex: 8,
    }
    const {
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      elements: [element, otherElement],
      selectedElementIds: [otherElement.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 20,
        clientY: 20,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 13,
        shiftKey: true,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 170,
        clientY: 150,
        pointerId: 13,
      }))
    })

    expect(setSelectedElementIds).toHaveBeenLastCalledWith([otherElement.id, element.id])
  })

  it('toggles individual elements with shift-click', () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 320,
      y: 280,
      zIndex: 8,
    }
    const {
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      elements: [element, otherElement],
      selectedElementIds: [element.id, otherElement.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 14,
        shiftKey: true,
      }), element)
    })

    expect(setSelectedElementIds).toHaveBeenCalledWith([otherElement.id])
    expect(result.current.transformPreview).toBeNull()
  })

  it('adds an unselected element with shift-click without starting a drag', () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 320,
      y: 280,
      zIndex: 8,
    }
    const {
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      elements: [element, otherElement],
      selectedElementIds: [otherElement.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 16,
        shiftKey: true,
      }), element)
    })

    expect(setSelectedElementIds).toHaveBeenCalledWith([otherElement.id, element.id])
    expect(result.current.transformPreview).toBeNull()
  })

  it('clears selection on an empty surface click without a marquee drag', () => {
    const {
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      selectedElementIds: [element.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 20,
        clientY: 20,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 17,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 20,
        clientY: 20,
        pointerId: 17,
      }))
    })

    expect(setSelectedElementIds).toHaveBeenLastCalledWith([])
    expect(result.current.previewSelectionMarquee).toBeNull()
  })

  it('preserves selection on an empty surface shift-click without a marquee drag', () => {
    const {
      result,
      setSelectedElementIds,
    } = renderCanvasInteraction({
      selectedElementIds: [element.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 20,
        clientY: 20,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 18,
        shiftKey: true,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 20,
        clientY: 20,
        pointerId: 18,
      }))
    })

    expect(setSelectedElementIds).not.toHaveBeenCalled()
    expect(result.current.previewSelectionMarquee).toBeNull()
  })

  it('moves every selected element when dragging an item in a multi-selection', async () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 260,
      y: 220,
      zIndex: 8,
    }
    const {
      onUpdateElement,
      onUpdateElements,
      result,
    } = renderCanvasInteraction({
      elements: [element, otherElement],
      selectedElementIds: [element.id, otherElement.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 15,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 15,
      }))
    })

    expect(result.current.transformPreviews).toEqual([{
      elementId: element.id,
      guides: {
        alignment: [],
        size: [],
        spacing: [],
      },
      height: element.height,
      width: element.width,
      x: 200,
      y: 240,
    }, {
      elementId: otherElement.id,
      height: otherElement.height,
      width: otherElement.width,
      x: 380,
      y: 360,
    }])

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 15,
      }))
    })

    await waitFor(() => expect(onUpdateElements).toHaveBeenCalledWith([{
      elementId: element.id,
      updates: {
        x: 200,
        y: 240,
      },
    }, {
      elementId: otherElement.id,
      updates: {
        x: 380,
        y: 360,
      },
    }]))
    expect(onUpdateElement).not.toHaveBeenCalled()
  })

  it('keeps the dragged element as the canonical preview in a multi-selection drag', () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 260,
      y: 220,
      zIndex: 8,
    }
    const {
      result,
    } = renderCanvasInteraction({
      elements: [otherElement, element],
      selectedElementIds: [element.id, otherElement.id],
      useMultiSelection: true,
    })

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 20,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 20,
      }))
    })

    expect(result.current.transformPreviews[0]?.elementId).toBe(otherElement.id)
    expect(result.current.transformPreview?.elementId).toBe(element.id)
  })

  it('only bumps z-index when another element is competing above it', async () => {
    const otherElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 260,
      y: 220,
      zIndex: 12,
    }
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction({elements: [element, otherElement]})

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 4,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 4,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 220,
        clientY: 260,
        pointerId: 4,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      x: 200,
      y: 240,
      zIndex: 13,
    }))
  })

  it('snaps a dragged shape to nearby object alignment using viewport-scaled tolerance', async () => {
    const nearbyElement: CanvasElement = {
      ...element,
      height: 90,
      id: 'shape-2',
      width: 160,
      x: 284,
      y: 420,
      zIndex: 3,
    }
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction({
      elements: [element, nearbyElement],
      viewport: {
        scale: 0.5,
        x: 0,
        y: 0,
      },
    })

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 50,
        clientY: 60,
        currentTarget: createPointerTarget(),
        pointerId: 8,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 151,
        clientY: 130,
        pointerId: 8,
      }))
    })

    expect(result.current.transformPreview).toEqual(expect.objectContaining({
      elementId: element.id,
      height: element.height,
      width: element.width,
      x: 284,
      y: 240,
    }))
    expect(result.current.transformPreview?.guides?.alignment.length).toBeGreaterThan(0)

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 151,
        clientY: 130,
        pointerId: 8,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      x: 284,
      y: 240,
    }))
  })

  it('snaps a dragged shape into equal spacing and keeps the spacing guides in the preview', async () => {
    const firstReference: CanvasElement = {
      ...element,
      id: 'shape-2',
      y: 100,
      zIndex: 3,
    }
    const secondReference: CanvasElement = {
      ...element,
      id: 'shape-3',
      y: 240,
      zIndex: 4,
    }
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction({
      elements: [element, firstReference, secondReference],
    })

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 12,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 100,
        clientY: 398,
        pointerId: 12,
      }))
    })

    expect(result.current.transformPreview).toEqual(expect.objectContaining({
      elementId: element.id,
      height: element.height,
      width: element.width,
      x: 80,
      y: 380,
    }))
    expect(result.current.transformPreview?.guides?.spacing?.[0]).toEqual(expect.objectContaining({
      axis: 'y',
      distance: 20,
      kind: 'spacing',
    }))
    expect(result.current.transformPreview?.guides?.spacing?.[0]?.segments).toHaveLength(2)

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 100,
        clientY: 398,
        pointerId: 12,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      x: 80,
      y: 380,
    }))
  })

  it('keeps alignment guides visible when snapping pins a drag to the original frame', () => {
    const alignedElement: CanvasElement = {
      ...element,
      id: 'shape-2',
      x: 80,
      y: 320,
      zIndex: 3,
    }
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction({elements: [element, alignedElement]})

    act(() => {
      result.current.handleElementPointerDown(createElementPointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: createPointerTarget(),
        pointerId: 10,
      }), element)
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 104,
        clientY: 120,
        pointerId: 10,
      }))
    })

    expect(result.current.transformPreview).toEqual(expect.objectContaining({
      elementId: element.id,
      height: element.height,
      width: element.width,
      x: element.x,
      y: element.y,
    }))
    expect(result.current.transformPreview?.guides?.alignment.length).toBeGreaterThan(0)

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 104,
        clientY: 120,
        pointerId: 10,
      }))
    })

    expect(onUpdateElement).not.toHaveBeenCalled()
  })

  it('resizes a shape from a corner handle and commits the new frame', async () => {
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction()

    act(() => {
      result.current.handleResizeHandlePointerDown(
        createElementPointerEvent({
          clientX: 240,
          clientY: 220,
          currentTarget: createButtonTarget(),
          pointerId: 3,
        }) as unknown as ReactPointerEvent<HTMLButtonElement>,
        element,
        'bottom-right',
      )
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 300,
        clientY: 260,
        pointerId: 3,
      }))
    })

    expect(result.current.transformPreview).toEqual({
      elementId: element.id,
      guides: {
        alignment: [],
        size: [],
        spacing: [],
      },
      height: 160,
      width: 220,
      x: 80,
      y: 100,
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 300,
        clientY: 260,
        pointerId: 3,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      height: 160,
      width: 220,
      x: 80,
      y: 100,
    }))
  })

  it('resizes a shape from a side border and preserves the opposite axis', async () => {
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction()

    act(() => {
      result.current.handleResizeHandlePointerDown(
        createElementPointerEvent({
          clientX: 240,
          clientY: 160,
          currentTarget: createButtonTarget(),
          pointerId: 13,
        }) as unknown as ReactPointerEvent<HTMLButtonElement>,
        element,
        'right',
      )
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 300,
        clientY: 260,
        pointerId: 13,
      }))
    })

    expect(result.current.transformPreview).toEqual({
      elementId: element.id,
      guides: {
        alignment: [],
        size: [],
        spacing: [],
      },
      height: 120,
      width: 220,
      x: 80,
      y: 100,
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 300,
        clientY: 260,
        pointerId: 13,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      height: 120,
      width: 220,
      x: 80,
      y: 100,
    }))
  })

  it('resizes a shape from the top border without changing width', async () => {
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction()

    act(() => {
      result.current.handleResizeHandlePointerDown(
        createElementPointerEvent({
          clientX: 160,
          clientY: 100,
          currentTarget: createButtonTarget(),
          pointerId: 14,
        }) as unknown as ReactPointerEvent<HTMLButtonElement>,
        element,
        'top',
      )
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 300,
        clientY: 60,
        pointerId: 14,
      }))
    })

    expect(result.current.transformPreview).toEqual({
      elementId: element.id,
      guides: {
        alignment: [],
        size: [],
        spacing: [],
      },
      height: 160,
      width: 160,
      x: 80,
      y: 60,
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 300,
        clientY: 60,
        pointerId: 14,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      height: 160,
      width: 160,
      x: 80,
      y: 60,
    }))
  })

  it('snaps resized dimensions and preserves a screen-stable size-guide offset', async () => {
    const sameWidthElement: CanvasElement = {
      ...element,
      height: 90,
      id: 'shape-2',
      width: 160,
      x: 500,
      y: 500,
      zIndex: 3,
    }
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction({
      elements: [element, sameWidthElement],
      viewport: {
        scale: 2,
        x: 0,
        y: 0,
      },
    })

    act(() => {
      result.current.handleResizeHandlePointerDown(
        createElementPointerEvent({
          clientX: 480,
          clientY: 440,
          currentTarget: createButtonTarget(),
          pointerId: 9,
        }) as unknown as ReactPointerEvent<HTMLButtonElement>,
        element,
        'bottom-right',
      )
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 476,
        clientY: 520,
        pointerId: 9,
      }))
    })

    expect(result.current.transformPreview).toEqual({
      elementId: element.id,
      guides: {
        alignment: [],
        size: [{
          axis: 'width',
          kind: 'size',
          line: {
            x1: 80,
            x2: 240,
            y1: 97,
            y2: 97,
          },
          matchedSize: 160,
        }],
        spacing: [],
      },
      height: 160,
      width: 160,
      x: 80,
      y: 100,
    })

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 476,
        clientY: 520,
        pointerId: 9,
      }))
    })

    await waitFor(() => expect(onUpdateElement).toHaveBeenCalledWith(element.id, {
      height: 160,
      width: 160,
      x: 80,
      y: 100,
    }))
  })

  it('keeps size guides visible when snapping pins a resize to the original frame', () => {
    const sameWidthElement: CanvasElement = {
      ...element,
      height: 90,
      id: 'shape-2',
      width: 160,
      x: 500,
      y: 500,
      zIndex: 3,
    }
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction({elements: [element, sameWidthElement]})

    act(() => {
      result.current.handleResizeHandlePointerDown(
        createElementPointerEvent({
          clientX: 240,
          clientY: 220,
          currentTarget: createButtonTarget(),
          pointerId: 11,
        }) as unknown as ReactPointerEvent<HTMLButtonElement>,
        element,
        'bottom-right',
      )
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 244,
        clientY: 220,
        pointerId: 11,
      }))
    })

    expect(result.current.transformPreview).toEqual(expect.objectContaining({
      elementId: element.id,
      height: element.height,
      width: element.width,
      x: element.x,
      y: element.y,
    }))
    expect(result.current.transformPreview?.guides?.size.length).toBeGreaterThan(0)

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 244,
        clientY: 220,
        pointerId: 11,
      }))
    })

    expect(onUpdateElement).not.toHaveBeenCalled()
  })

  it('does not commit a resize until the pointer crosses the resize threshold', () => {
    const {
      onUpdateElement,
      result,
    } = renderCanvasInteraction()

    act(() => {
      result.current.handleResizeHandlePointerDown(
        createElementPointerEvent({
          clientX: 240,
          clientY: 220,
          currentTarget: createButtonTarget(),
          pointerId: 5,
        }) as unknown as ReactPointerEvent<HTMLButtonElement>,
        element,
        'bottom-right',
      )
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 241,
        clientY: 221,
        pointerId: 5,
      }))
    })

    expect(result.current.transformPreview).toBeNull()

    act(() => {
      result.current.handleSurfacePointerUp(createSurfacePointerEvent({
        clientX: 241,
        clientY: 221,
        pointerId: 5,
      }))
    })

    expect(onUpdateElement).not.toHaveBeenCalled()
  })

  it('resolves the last pointer position against the latest viewport after drag panning', () => {
    const {result} = renderCanvasInteraction({activeTool: 'hand'})

    act(() => {
      result.current.handleSurfacePointerDown(createSurfacePointerEvent({
        clientX: 100,
        clientY: 120,
        currentTarget: result.current.surfaceRef.current!,
        pointerId: 8,
      }))
    })

    act(() => {
      result.current.handleSurfacePointerMove(createSurfacePointerEvent({
        clientX: 140,
        clientY: 150,
        pointerId: 8,
      }))
    })

    expect(result.current.getLastPointerCanvasPosition()).toEqual({
      x: 100,
      y: 120,
    })
  })

  it('resolves the last pointer position against the latest viewport after wheel panning', () => {
    const {
      result,
      setViewport,
    } = renderCanvasInteraction()

    act(() => {
      result.current.handleSurfaceWheel(createSurfaceWheelEvent({
        clientX: 240,
        clientY: 180,
        deltaX: 32,
        deltaY: 48,
      }))
    })

    const updateViewport = setViewport.mock.calls[0]?.[0]

    expect(typeof updateViewport).toBe('function')
    updateViewport(viewport)

    expect(result.current.getLastPointerCanvasPosition()).toEqual({
      x: 272,
      y: 228,
    })
  })

  it('pans the viewport on wheel by default', () => {
    const {
      result,
      setViewport,
    } = renderCanvasInteraction()
    const event = createSurfaceWheelEvent({
      deltaX: 32,
      deltaY: 48,
    })

    act(() => {
      result.current.handleSurfaceWheel(event)
    })

    expect(event.preventDefault).toHaveBeenCalled()
    expect(setViewport).toHaveBeenCalledTimes(1)

    const updateViewport = setViewport.mock.calls[0]?.[0]

    expect(typeof updateViewport).toBe('function')
    expect(updateViewport(viewport)).toEqual({
      scale: 1,
      x: -32,
      y: -48,
    })
  })

  it('zooms the viewport from deltaY for ctrl+wheel even when deltaX is larger', () => {
    const {
      result,
      setViewport,
    } = renderCanvasInteraction()
    const event = createSurfaceWheelEvent({
      ctrlKey: true,
      deltaX: -48,
      deltaY: -6,
    })

    act(() => {
      result.current.handleSurfaceWheel(event)
    })

    const updateViewport = setViewport.mock.calls[0]?.[0]

    expect(typeof updateViewport).toBe('function')
    expect(updateViewport(viewport)).toEqual({
      scale: 1.04,
      x: -8,
      y: -6,
    })
  })

  it('keeps shift+wheel as horizontal pan and meta+wheel as zoom', () => {
    const {
      result,
      setViewport,
    } = renderCanvasInteraction()
    const horizontalPanEvent = createSurfaceWheelEvent({
      deltaMode: 1,
      deltaY: 3,
      shiftKey: true,
    })

    act(() => {
      result.current.handleSurfaceWheel(horizontalPanEvent)
    })

    const horizontalPanUpdate = setViewport.mock.calls[0]?.[0]

    expect(typeof horizontalPanUpdate).toBe('function')
    expect(horizontalPanUpdate(viewport)).toEqual({
      scale: 1,
      x: -48,
      y: 0,
    })

    const zoomEvent = createSurfaceWheelEvent({
      metaKey: true,
      deltaMode: 1,
      deltaY: -1,
    })

    act(() => {
      result.current.handleSurfaceWheel(zoomEvent)
    })

    const zoomUpdate = setViewport.mock.calls[1]?.[0]

    expect(typeof zoomUpdate).toBe('function')
    expect(zoomUpdate(viewport)).toEqual({
      scale: 1.04,
      x: -8,
      y: -6,
    })
  })

  it('keeps plain pixel-mode wheel gestures in the pan path', () => {
    const {
      result,
      setViewport,
    } = renderCanvasInteraction()
    const event = createSurfaceWheelEvent({
      deltaX: 6.5,
      deltaY: -4.5,
      shiftKey: true,
    })

    act(() => {
      result.current.handleSurfaceWheel(event)
    })

    const updateViewport = setViewport.mock.calls[0]?.[0]

    expect(typeof updateViewport).toBe('function')
    expect(updateViewport(viewport)).toEqual({
      scale: 1,
      x: -6.5,
      y: 4.5,
    })
  })
})
