import {describe, expect, it} from 'vitest'

import {
  DEFAULT_CANVAS_SHAPE_FILL_COLOR,
  getCanvasOverlayZIndex,
  mergeCanvasElement,
  resolveCanvasShapeStyle,
  sortCanvasElements,
  withCanvasShapeDefaultTextAlignment,
  type CanvasElement,
} from './canvas.types'

function buildCanvasElement(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    assetPath: null,
    content: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    createdBy: 'user-1',
    elementType: 'note',
    height: 150,
    id: 'element-1',
    isResolved: false,
    pathData: null,
    projectViewId: 'view-1',
    style: {fill_color: '#fef3c7'},
    updatedAt: '2026-04-01T00:00:00.000Z',
    url: null,
    width: 200,
    x: 40,
    y: 80,
    zIndex: 1,
    ...overrides,
  }
}

describe('canvas types helpers', () => {
  it('sorts elements by z-index, then updatedAt, then id', () => {
    const sorted = sortCanvasElements([
      buildCanvasElement({id: 'c', updatedAt: '2026-04-01T00:00:03.000Z', zIndex: 2}),
      buildCanvasElement({id: 'b', updatedAt: '2026-04-01T00:00:01.000Z', zIndex: 1}),
      buildCanvasElement({id: 'a', updatedAt: '2026-04-01T00:00:01.000Z', zIndex: 1}),
    ])

    expect(sorted.map((element) => element.id)).toEqual(['a', 'b', 'c'])
  })

  it('merges partial element updates without dropping existing fields', () => {
    const baseElement = buildCanvasElement({
      content: 'Plan launch',
      style: {fill_color: '#fef3c7', stroke_color: '#17202b', text_align: 'left'},
    })

    expect(mergeCanvasElement(baseElement, {
      content: '',
      style: {fill_color: '#bfdbfe'},
      x: 120,
      zIndex: 4,
    })).toEqual({
      ...baseElement,
      content: '',
      style: {
        fill_color: '#bfdbfe',
        stroke_color: '#17202b',
        text_align: 'left',
      },
      x: 120,
      zIndex: 4,
    })
  })

  it('resolves missing shape fill to the default color but preserves explicit no-fill', () => {
    expect(resolveCanvasShapeStyle({}).fillColor).toBe(DEFAULT_CANVAS_SHAPE_FILL_COLOR)
    expect(resolveCanvasShapeStyle({fill_color: null}).fillColor).toBeNull()
    expect(resolveCanvasShapeStyle({fill_color: '#bfdbfe'}).fillColor).toBe('#bfdbfe')
  })

  it('preserves legacy left alignment when older shapes omit text_align', () => {
    expect(resolveCanvasShapeStyle({}).textAlign).toBe('left')
  })

  it('uses the current product default when text_align is explicitly present but empty', () => {
    expect(resolveCanvasShapeStyle({text_align: null}).textAlign).toBe('center')
    expect(resolveCanvasShapeStyle({text_align: 'left'}).textAlign).toBe('left')
  })

  it('can materialize the centered default into shape style data', () => {
    expect(withCanvasShapeDefaultTextAlignment({stroke_color: '#17202b'})).toEqual({
      stroke_color: '#17202b',
      text_align: 'center',
    })
    expect(withCanvasShapeDefaultTextAlignment({text_align: 'left'})).toEqual({
      text_align: 'left',
    })
  })

  it('allocates overlay layers above the highest canvas element z-index', () => {
    const elements = [
      buildCanvasElement({id: 'a', zIndex: 3}),
      buildCanvasElement({id: 'b', zIndex: 17}),
    ]

    expect(getCanvasOverlayZIndex(elements)).toBe(18)
    expect(getCanvasOverlayZIndex(elements, 2)).toBe(19)
  })
})
