import {describe, expect, it} from 'vitest'

import {copyCanvasShape, resolveCanvasPastePlacement, type CanvasClipboardPlacementState} from './canvas-clipboard'
import type {CanvasElement} from './canvas.types'

function buildShape(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    assetPath: null,
    content: null,
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

describe('canvas clipboard helpers', () => {
  it('only copies shape elements', () => {
    expect(copyCanvasShape(buildShape())).toMatchObject({
      elementType: 'shape',
      height: 80,
      width: 120,
      x: 200,
      y: 140,
    })

    expect(copyCanvasShape(buildShape({elementType: 'note'}))).toBeNull()
  })

  it('offsets pasted shapes when the pointer has not moved away from the source shape', () => {
    const shape = copyCanvasShape(buildShape())

    expect(shape).not.toBeNull()
    expect(resolveCanvasPastePlacement(shape!, {
      lastPlacement: null,
      lastPointerPosition: {x: 220, y: 180},
    })).toEqual({
      nextPlacement: {
        anchor: {x: 200, y: 140},
        anchorKind: 'source',
        sequence: 1,
      },
      x: 224,
      y: 164,
    })
  })

  it('pastes near the latest pointer location once the pointer has moved elsewhere', () => {
    const shape = copyCanvasShape(buildShape())

    expect(shape).not.toBeNull()
    expect(resolveCanvasPastePlacement(shape!, {
      lastPlacement: null,
      lastPointerPosition: {x: 540, y: 360},
    })).toEqual({
      nextPlacement: {
        anchor: {x: 480, y: 320},
        anchorKind: 'pointer',
        sequence: 0,
      },
      x: 480,
      y: 320,
    })
  })

  it('fans out repeated pastes around the same remote pointer anchor', () => {
    const shape = copyCanvasShape(buildShape())

    expect(shape).not.toBeNull()

    const firstPaste = resolveCanvasPastePlacement(shape!, {
      lastPlacement: null,
      lastPointerPosition: {x: 540, y: 360},
    })

    expect(firstPaste).toEqual({
      nextPlacement: {
        anchor: {x: 480, y: 320},
        anchorKind: 'pointer',
        sequence: 0,
      },
      x: 480,
      y: 320,
    })

    expect(resolveCanvasPastePlacement(shape!, {
      lastPlacement: firstPaste.nextPlacement,
      lastPointerPosition: {x: 540, y: 360},
    })).toEqual({
      nextPlacement: {
        anchor: {x: 480, y: 320},
        anchorKind: 'pointer',
        sequence: 1,
      },
      x: 504,
      y: 344,
    })
  })

  it('resets the paste fan-out when the anchor changes', () => {
    const shape = copyCanvasShape(buildShape())

    expect(shape).not.toBeNull()

    const lastPlacement: CanvasClipboardPlacementState = {
      anchor: {x: 480, y: 320},
      anchorKind: 'pointer',
      sequence: 2,
    }

    expect(resolveCanvasPastePlacement(shape!, {
      lastPlacement,
      lastPointerPosition: {x: 720, y: 420},
    })).toEqual({
      nextPlacement: {
        anchor: {x: 660, y: 380},
        anchorKind: 'pointer',
        sequence: 0,
      },
      x: 660,
      y: 380,
    })
  })

  it('does not carry the source paste sequence into a new remote anchor', () => {
    const shape = copyCanvasShape(buildShape())

    expect(shape).not.toBeNull()

    const sourcePlacement: CanvasClipboardPlacementState = {
      anchor: {x: 200, y: 140},
      anchorKind: 'source',
      sequence: 2,
    }

    expect(resolveCanvasPastePlacement(shape!, {
      lastPlacement: sourcePlacement,
      lastPointerPosition: {x: 540, y: 360},
    })).toEqual({
      nextPlacement: {
        anchor: {x: 480, y: 320},
        anchorKind: 'pointer',
        sequence: 0,
      },
      x: 480,
      y: 320,
    })
  })
})
