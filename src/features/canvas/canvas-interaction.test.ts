import {describe, expect, it} from 'vitest'

import {
  buildCanvasPathData,
  clampCanvasZoom,
  getCanvasBoundingBox,
  getCanvasCoords,
  normalizeCanvasRect,
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
