import {describe, expect, it} from 'vitest'

import {
  DEFAULT_CANVAS_VIEWPORT,
} from './canvas.types'
import {
  formatCanvasZoomLabel,
  getCanvasViewportForFit,
  getCanvasViewportForZoom,
  normalizeCanvasViewport,
} from './canvas-viewport'

describe('canvas viewport helpers', () => {
  it('formats zoom scales as percentages', () => {
    expect(formatCanvasZoomLabel(1)).toBe('100%')
    expect(formatCanvasZoomLabel(0.75)).toBe('75%')
    expect(formatCanvasZoomLabel(1.234)).toBe('123%')
    expect(formatCanvasZoomLabel(Number.NaN)).toBe('100%')
  })

  it('normalizes persisted viewport values before use', () => {
    expect(normalizeCanvasViewport({scale: 3, x: 10, y: 20})).toEqual({
      scale: 2,
      x: 10,
      y: 20,
    })
    expect(normalizeCanvasViewport({scale: '1', x: 10, y: 20})).toBeNull()
    expect(normalizeCanvasViewport({scale: 1, x: Number.NaN, y: 20})).toBeNull()
  })

  it('sets zoom around the visible surface center', () => {
    expect(getCanvasViewportForZoom(
      {scale: 1, x: -100, y: -50},
      2,
      {height: 600, width: 800},
    )).toEqual({
      scale: 2,
      x: -600,
      y: -400,
    })
  })

  it('clamps selected zoom levels into the supported range', () => {
    expect(getCanvasViewportForZoom(
      {scale: 1, x: 10, y: 20},
      3,
      null,
    )).toEqual({
      scale: 2,
      x: 10,
      y: 20,
    })
  })

  it('fits element frames into the available surface', () => {
    const viewport = getCanvasViewportForFit([
      {height: 100, width: 200, x: 100, y: 100},
      {height: 200, width: 100, x: 500, y: 300},
    ], {height: 600, width: 1000})

    expect(viewport.scale).toBe(1.1)
    expect(viewport.x).toBeCloseTo(115)
    expect(viewport.y).toBe(-30)
  })

  it('falls back to the default viewport when fit has no frames or surface size', () => {
    expect(getCanvasViewportForFit([], {height: 600, width: 1000})).toEqual(DEFAULT_CANVAS_VIEWPORT)
    expect(getCanvasViewportForFit([
      {height: 100, width: 200, x: 100, y: 100},
    ], null)).toEqual(DEFAULT_CANVAS_VIEWPORT)
  })

  it('clamps fit zoom when the surface is smaller than the fit padding', () => {
    expect(getCanvasViewportForFit([
      {height: 200, width: 200, x: 0, y: 0},
    ], {height: 120, width: 120})).toEqual({
      scale: 0.25,
      x: 35,
      y: 35,
    })
  })

  it('ignores non-finite frames when fitting canvas content', () => {
    expect(getCanvasViewportForFit([
      {height: Number.NaN, width: 200, x: 100, y: 100},
      {height: 100, width: 100, x: 200, y: 200},
    ], {height: 600, width: 600})).toEqual({
      scale: 2,
      x: -200,
      y: -200,
    })
    expect(getCanvasViewportForFit([
      {height: Number.NaN, width: 200, x: 100, y: 100},
    ], {height: 600, width: 600})).toEqual(DEFAULT_CANVAS_VIEWPORT)
  })

  it('fits large frame lists without spreading arrays into Math.min or Math.max', () => {
    const frames = Array.from({length: 150_000}, (_entry, index) => ({
      height: 10,
      width: 10,
      x: index,
      y: index,
    }))
    const viewport = getCanvasViewportForFit(frames, {height: 600, width: 1000})

    expect(viewport.scale).toBe(0.25)
    expect(Number.isFinite(viewport.x)).toBe(true)
    expect(Number.isFinite(viewport.y)).toBe(true)
  })
})
