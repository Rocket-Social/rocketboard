import {describe, expect, it} from 'vitest'

import {mergeCanvasElement, sortCanvasElements, type CanvasElement} from './canvas.types'

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
      style: {fill_color: '#fef3c7', stroke_color: '#17202b'},
    })

    expect(mergeCanvasElement(baseElement, {
      content: '',
      x: 120,
      zIndex: 4,
    })).toEqual({
      ...baseElement,
      content: '',
      x: 120,
      zIndex: 4,
    })
  })
})
