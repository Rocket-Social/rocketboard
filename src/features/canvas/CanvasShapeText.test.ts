import type {Editor} from '@tiptap/react'
import {describe, expect, it, vi} from 'vitest'

import {resolveCanvasShapeTextFocusPosition} from './CanvasShapeText'

describe('resolveCanvasShapeTextFocusPosition', () => {
  it('maps pointer requests through the editor view coordinates lookup', () => {
    const posAtCoords = vi.fn().mockReturnValue({pos: 27})
    const editor = {
      state: {
        doc: {
          textContent: 'hello world',
        },
      },
      view: {
        posAtCoords,
      },
    } as unknown as Pick<Editor, 'state' | 'view'>

    const position = resolveCanvasShapeTextFocusPosition(editor, {
      clientX: 144,
      clientY: 288,
      mode: 'pointer',
      requestKey: 1,
    })

    expect(position).toBe(27)
    expect(posAtCoords).toHaveBeenCalledWith({
      left: 144,
      top: 288,
    })
  })

  it('falls back to the end of the document when no pointer match is found', () => {
    const editor = {
      state: {
        doc: {
          textContent: 'hello world',
        },
      },
      view: {
        posAtCoords: vi.fn().mockReturnValue(null),
      },
    } as unknown as Pick<Editor, 'state' | 'view'>

    expect(resolveCanvasShapeTextFocusPosition(editor, {
      clientX: 12,
      clientY: 34,
      mode: 'pointer',
      requestKey: 2,
    })).toBe('end')
  })

  it('defaults to the centered document flow when a pointer request targets an empty shape', () => {
    const editor = {
      state: {
        doc: {
          textContent: '',
        },
      },
      view: {
        posAtCoords: vi.fn().mockReturnValue({pos: 27}),
      },
    } as unknown as Pick<Editor, 'state' | 'view'>

    expect(resolveCanvasShapeTextFocusPosition(editor, {
      clientX: 144,
      clientY: 288,
      mode: 'pointer',
      requestKey: 3,
    })).toBe('end')
    expect(editor.view.posAtCoords).not.toHaveBeenCalled()
  })

  it('defaults to the end of the document without a pointer request', () => {
    const editor = {
      state: {
        doc: {
          textContent: '',
        },
      },
      view: {
        posAtCoords: vi.fn(),
      },
    } as unknown as Pick<Editor, 'state' | 'view'>

    expect(resolveCanvasShapeTextFocusPosition(editor, null)).toBe('end')
  })
})
