import {describe, expect, it} from 'vitest'

import {
  areCanvasElementFramesEqual,
  buildCanvasPathData,
  CANVAS_MAX_SPACING_SNAP_REFERENCE_FRAMES,
  CANVAS_WHEEL_ZOOM_STEP,
  clampCanvasZoom,
  doCanvasElementFramesIntersect,
  getCanvasWheelPanDelta,
  getCanvasWheelZoomDelta,
  getCanvasResizedFrame,
  getCanvasSnappedMoveFrame,
  getCanvasSnappedResizeFrame,
  getCanvasBoundingBox,
  getCanvasCoords,
  getNextCanvasWheelZoom,
  normalizeCanvasRect,
  shouldZoomCanvasWheel,
} from './canvas-interaction'

describe('canvas interaction helpers', () => {
  it('converts client coordinates into canvas coordinates using pan and zoom', () => {
    expect(getCanvasCoords(
      {clientX: 220, clientY: 190},
      {left: 20, top: 30},
      {scale: 2, x: 40, y: 50},
    )).toEqual({
      x: 80,
      y: 55,
    })
  })

  it('clamps zoom into the supported range', () => {
    expect(clampCanvasZoom(0.1)).toBe(0.25)
    expect(clampCanvasZoom(3)).toBe(2)
    expect(clampCanvasZoom(1.234)).toBe(1.23)
  })

  it('uses a slower wheel zoom step for canvas gestures', () => {
    expect(CANVAS_WHEEL_ZOOM_STEP).toBe(0.04)
    expect(getNextCanvasWheelZoom(1, 0)).toBe(1)
    expect(getNextCanvasWheelZoom(1, -1)).toBe(1.04)
    expect(getNextCanvasWheelZoom(1, 1)).toBe(0.96)
  })

  it('treats wheel movement as pan by default and converts shift+wheel into horizontal mouse pan', () => {
    expect(getCanvasWheelPanDelta({
      deltaMode: 0,
      deltaX: 18,
      deltaY: -24,
      shiftKey: false,
    })).toEqual({
      x: 18,
      y: -24,
    })

    expect(getCanvasWheelPanDelta({
      deltaMode: 1,
      deltaX: 0,
      deltaY: 3,
      shiftKey: true,
    })).toEqual({
      x: 48,
      y: 0,
    })

    expect(getCanvasWheelPanDelta({
      deltaMode: 2,
      deltaX: 0,
      deltaY: -1,
      shiftKey: false,
    })).toEqual({
      x: 0,
      y: -800,
    })
  })

  it('uses normalized deltaY for zoom gestures even when deltaX is larger', () => {
    expect(getCanvasWheelZoomDelta({
      deltaMode: 0,
      deltaX: -16,
      deltaY: -8,
    })).toBe(-8)

    expect(getCanvasWheelZoomDelta({
      deltaMode: 1,
      deltaX: 0,
      deltaY: 2,
    })).toBe(32)

    expect(getCanvasWheelZoomDelta({
      deltaMode: 2,
      deltaX: 0,
      deltaY: -1,
    })).toBe(-800)
  })

  it('only zooms on modified wheel gestures', () => {
    expect(shouldZoomCanvasWheel({
      ctrlKey: false,
      metaKey: false,
    })).toBe(false)

    expect(shouldZoomCanvasWheel({
      ctrlKey: true,
      metaKey: false,
    })).toBe(true)

    expect(shouldZoomCanvasWheel({
      ctrlKey: false,
      metaKey: true,
    })).toBe(true)

    expect(shouldZoomCanvasWheel({
      ctrlKey: false,
      metaKey: false,
    })).toBe(false)
  })

  it('normalizes negative shape drags into a positive frame', () => {
    expect(normalizeCanvasRect(
      {x: 240, y: 180},
      {x: 120, y: 80},
      16,
    )).toEqual({
      height: 100,
      width: 120,
      x: 120,
      y: 80,
    })
  })

  it('treats selection marquee edge contact as an intersection', () => {
    expect(doCanvasElementFramesIntersect(
      {height: 80, width: 120, x: 40, y: 60},
      {height: 100, width: 80, x: 160, y: 120},
    )).toBe(true)

    expect(doCanvasElementFramesIntersect(
      {height: 80, width: 120, x: 40, y: 60},
      {height: 100, width: 80, x: 161, y: 120},
    )).toBe(false)
  })

  it('resizes a shape from a corner using the opposite corner as the anchor', () => {
    expect(getCanvasResizedFrame(
      {height: 80, width: 100, x: 40, y: 60},
      'top-left',
      {x: 10, y: 20},
      16,
    )).toEqual({
      height: 120,
      width: 130,
      x: 10,
      y: 20,
    })
  })

  it('keeps the opposite corner fixed when resize hits the minimum size', () => {
    expect(getCanvasResizedFrame(
      {height: 80, width: 100, x: 40, y: 60},
      'top-left',
      {x: 138, y: 138},
      16,
    )).toEqual({
      height: 16,
      width: 16,
      x: 124,
      y: 124,
    })
  })

  it('snaps moving frames to nearby object centers and returns a center-cutting guide', () => {
    expect(getCanvasSnappedMoveFrame(
      {height: 120, width: 160, x: 304, y: 82},
      [{
        height: 140,
        width: 120,
        x: 324,
        y: 70,
      }],
      6,
    )).toEqual({
      frame: {
        height: 120,
        width: 160,
        x: 304,
        y: 80,
      },
      guides: {
        alignment: [{
          axis: 'x',
          kind: 'alignment',
          line: {
            x1: 384,
            x2: 384,
            y1: 70,
            y2: 210,
          },
        }, {
          axis: 'y',
          kind: 'alignment',
          line: {
            x1: 304,
            x2: 464,
            y1: 140,
            y2: 140,
          },
        }],
        size: [],
        spacing: [],
      },
    })
  })

  it('snaps moving frames to equal spacing and returns capped gap guides', () => {
    const result = getCanvasSnappedMoveFrame(
      {height: 80, width: 100, x: 100, y: 237},
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 140,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual({
      height: 80,
      width: 100,
      x: 100,
      y: 240,
    })
    expect(result.guides.spacing).toEqual([{
      axis: 'y',
      distance: 20,
      kind: 'spacing',
      segments: [{
        endCap: {
          x1: 145,
          x2: 155,
          y1: 140,
          y2: 140,
        },
        line: {
          x1: 150,
          x2: 150,
          y1: 120,
          y2: 140,
        },
        startCap: {
          x1: 145,
          x2: 155,
          y1: 120,
          y2: 120,
        },
      }, {
        endCap: {
          x1: 145,
          x2: 155,
          y1: 240,
          y2: 240,
        },
        line: {
          x1: 150,
          x2: 150,
          y1: 220,
          y2: 240,
        },
        startCap: {
          x1: 145,
          x2: 155,
          y1: 220,
          y2: 220,
        },
      }],
    }])
  })

  it('snaps moving frames between two objects when both side gaps become equal', () => {
    const result = getCanvasSnappedMoveFrame(
      {height: 80, width: 100, x: 100, y: 127},
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 220,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual({
      height: 80,
      width: 100,
      x: 100,
      y: 130,
    })
    expect(result.guides.spacing).toEqual([{
      axis: 'y',
      distance: 10,
      kind: 'spacing',
      segments: [{
        endCap: {
          x1: 145,
          x2: 155,
          y1: 130,
          y2: 130,
        },
        line: {
          x1: 150,
          x2: 150,
          y1: 120,
          y2: 130,
        },
        startCap: {
          x1: 145,
          x2: 155,
          y1: 120,
          y2: 120,
        },
      }, {
        endCap: {
          x1: 145,
          x2: 155,
          y1: 220,
          y2: 220,
        },
        line: {
          x1: 150,
          x2: 150,
          y1: 210,
          y2: 220,
        },
        startCap: {
          x1: 145,
          x2: 155,
          y1: 210,
          y2: 210,
        },
      }],
    }])
  })

  it('snaps moving frames to horizontal equal spacing guides', () => {
    const result = getCanvasSnappedMoveFrame(
      {height: 100, width: 80, x: 237, y: 100},
      [{
        height: 100,
        width: 80,
        x: 40,
        y: 100,
      }, {
        height: 100,
        width: 80,
        x: 140,
        y: 100,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual({
      height: 100,
      width: 80,
      x: 240,
      y: 100,
    })
    expect(result.guides.spacing).toEqual([{
      axis: 'x',
      distance: 20,
      kind: 'spacing',
      segments: [{
        endCap: {
          x1: 140,
          x2: 140,
          y1: 145,
          y2: 155,
        },
        line: {
          x1: 120,
          x2: 140,
          y1: 150,
          y2: 150,
        },
        startCap: {
          x1: 120,
          x2: 120,
          y1: 145,
          y2: 155,
        },
      }, {
        endCap: {
          x1: 240,
          x2: 240,
          y1: 145,
          y2: 155,
        },
        line: {
          x1: 220,
          x2: 240,
          y1: 150,
          y2: 150,
        },
        startCap: {
          x1: 220,
          x2: 220,
          y1: 145,
          y2: 155,
        },
      }],
    }])
  })

  it('drops spacing snaps that stop overlapping after the other axis snaps', () => {
    const result = getCanvasSnappedMoveFrame(
      {height: 100, width: 80, x: 237, y: 195},
      [{
        height: 100,
        width: 80,
        x: 40,
        y: 100,
      }, {
        height: 100,
        width: 80,
        x: 140,
        y: 100,
      }, {
        height: 100,
        width: 80,
        x: 500,
        y: 201,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual({
      height: 100,
      width: 80,
      x: 237,
      y: 200,
    })
    expect(result.guides.alignment.length).toBeGreaterThan(0)
    expect(result.guides.spacing).toEqual([])
  })

  it('skips equal-spacing snaps on very large reference sets to keep drag work bounded', () => {
    const frame = {height: 80, width: 100, x: 130, y: 237}
    const references = [{
      height: 80,
      width: 100,
      x: 100,
      y: 40,
    }, {
      height: 80,
      width: 100,
      x: 100,
      y: 140,
    }, ...Array.from({length: CANVAS_MAX_SPACING_SNAP_REFERENCE_FRAMES - 1}, (_, index) => ({
      height: 80,
      width: 100,
      x: 1000,
      y: 10000 + index * 200,
    }))]

    const result = getCanvasSnappedMoveFrame(frame, references, 6, 10)

    expect(result.frame).toEqual(frame)
    expect(result.guides.spacing).toEqual([])
  })

  it('does not snap to equal spacing when reference gaps do not overlap on the cross axis', () => {
    const frame = {height: 80, width: 100, x: 130, y: 237}
    const result = getCanvasSnappedMoveFrame(
      frame,
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 260,
        y: 140,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual(frame)
    expect(result.guides.spacing).toEqual([])
  })

  it('does not snap to equal spacing when reference objects touch or overlap', () => {
    const frame = {height: 80, width: 100, x: 130, y: 137}
    const result = getCanvasSnappedMoveFrame(
      frame,
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 120,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual(frame)
    expect(result.guides.spacing).toEqual([])
  })

  it('does not span equal-spacing gaps across overlapping intervening references', () => {
    const frame = {height: 80, width: 100, x: 130, y: 397}
    const result = getCanvasSnappedMoveFrame(
      frame,
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 100,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 220,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual(frame)
    expect(result.guides.spacing).toEqual([])
  })

  it('does not snap to equal spacing when the snapped frame would collide with another object', () => {
    const frame = {height: 80, width: 100, x: 130, y: 237}
    const result = getCanvasSnappedMoveFrame(
      frame,
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 140,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 245,
      }],
      6,
      10,
    )

    expect(result.frame).toEqual(frame)
    expect(result.guides.spacing).toEqual([])
  })

  it('prefers alignment over equal spacing when both snaps are equally close', () => {
    const result = getCanvasSnappedMoveFrame(
      {height: 80, width: 100, x: 130, y: 237},
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 140,
      }, {
        height: 80,
        width: 100,
        x: 500,
        y: 234,
      }],
      6,
      10,
    )

    expect(result.frame.y).toBe(234)
    expect(result.guides.alignment.length).toBeGreaterThan(0)
    expect(result.guides.spacing).toEqual([])
  })

  it('prefers equal spacing over alignment when spacing is closer', () => {
    const result = getCanvasSnappedMoveFrame(
      {height: 80, width: 100, x: 130, y: 237},
      [{
        height: 80,
        width: 100,
        x: 100,
        y: 40,
      }, {
        height: 80,
        width: 100,
        x: 100,
        y: 140,
      }, {
        height: 80,
        width: 100,
        x: 500,
        y: 232,
      }],
      6,
      10,
    )

    expect(result.frame.y).toBe(240)
    expect(result.guides.alignment).toEqual([])
    expect(result.guides.spacing).toHaveLength(1)
  })

  it('snaps resize dimensions to another object and returns a purple size guide', () => {
    expect(getCanvasSnappedResizeFrame(
      {height: 120, width: 160, x: 80, y: 100},
      'bottom-right',
      {x: 238, y: 226},
      [{
        height: 90,
        width: 160,
        x: 320,
        y: 80,
      }],
      16,
      6,
    )).toEqual({
      frame: {
        height: 126,
        width: 160,
        x: 80,
        y: 100,
      },
      guides: {
        alignment: [],
        size: [{
          axis: 'width',
          kind: 'size',
          line: {
            x1: 80,
            x2: 240,
            y1: 94,
            y2: 94,
          },
          matchedSize: 160,
        }],
        spacing: [],
      },
    })
  })

  it('snaps top-left resizes to matching heights while preserving the opposite corner', () => {
    expect(getCanvasSnappedResizeFrame(
      {height: 120, width: 160, x: 80, y: 100},
      'top-left',
      {x: 82, y: 128},
      [{
        height: 90,
        width: 300,
        x: 400,
        y: 400,
      }],
      16,
      6,
    )).toEqual({
      frame: {
        height: 90,
        width: 158,
        x: 82,
        y: 130,
      },
      guides: {
        alignment: [],
        size: [{
          axis: 'height',
          kind: 'size',
          line: {
            x1: 76,
            x2: 76,
            y1: 130,
            y2: 220,
          },
          matchedSize: 90,
        }],
        spacing: [],
      },
    })
  })

  it('snaps resized edges to nearby object alignment points', () => {
    expect(getCanvasSnappedResizeFrame(
      {height: 120, width: 160, x: 80, y: 100},
      'bottom-right',
      {x: 356, y: 219},
      [{
        height: 90,
        width: 120,
        x: 360,
        y: 130,
      }],
      16,
      6,
    )).toEqual({
      frame: {
        height: 120,
        width: 280,
        x: 80,
        y: 100,
      },
      guides: {
        alignment: [{
          axis: 'x',
          kind: 'alignment',
          line: {
            x1: 360,
            x2: 360,
            y1: 100,
            y2: 220,
          },
        }, {
          axis: 'y',
          kind: 'alignment',
          line: {
            x1: 80,
            x2: 480,
            y1: 220,
            y2: 220,
          },
        }],
        size: [],
        spacing: [],
      },
    })
  })

  it('compares element frames exactly after canvas rounding', () => {
    expect(areCanvasElementFramesEqual(
      {height: 80, width: 100, x: 40, y: 60},
      {height: 80, width: 100, x: 40, y: 60},
    )).toBe(true)

    expect(areCanvasElementFramesEqual(
      {height: 80, width: 100, x: 40, y: 60},
      {height: 80, width: 101, x: 40, y: 60},
    )).toBe(false)
  })

  it('derives a drawing bounding box from the path points', () => {
    expect(getCanvasBoundingBox([
      {x: 80, y: 120},
      {x: 120, y: 160},
      {x: 150, y: 110},
    ])).toEqual({
      height: 50,
      width: 70,
      x: 80,
      y: 110,
    })
  })

  it('builds relative svg path data from the drawing points', () => {
    expect(buildCanvasPathData([
      {x: 120, y: 160},
      {x: 145, y: 180},
      {x: 170, y: 150},
    ], {x: 120, y: 150})).toBe('M 0 10 L 25 30 L 50 0')
  })
})
