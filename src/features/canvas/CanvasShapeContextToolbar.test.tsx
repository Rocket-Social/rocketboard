/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {CanvasShapeContextToolbar} from './CanvasShapeContextToolbar'
import type {CanvasElementStyle} from './canvas.types'

function createEditorStub() {
  return {
    getAttributes: vi.fn(() => ({})),
    isActive: vi.fn(() => false),
    off: vi.fn(),
    on: vi.fn(),
    state: {
      selection: {
        empty: true,
        from: 0,
      },
    },
  }
}

const shapeStyle: CanvasElementStyle = {
  fill_color: '#f2eee6',
  shape_type: 'rectangle',
  stroke_color: '#17202b',
  stroke_style: 'solid',
  text_align: 'left',
  text_family: 'standard',
  text_size: 16,
}

describe('CanvasShapeContextToolbar', () => {
  it('keeps the toolbar layered above the board content', () => {
    render(
      <CanvasShapeContextToolbar
        editor={null}
        editing={false}
        left={240}
        onFillColorChange={vi.fn()}
        onShapeTypeChange={vi.fn()}
        onStrokeColorChange={vi.fn()}
        onStrokeStyleChange={vi.fn()}
        onTextAlignChange={vi.fn()}
        onTextFamilyChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        style={shapeStyle}
        top={160}
        zIndex={88}
      />,
    )

    expect(screen.getByTestId('canvas-shape-context-toolbar')).toHaveStyle({zIndex: '88'})
  })

  it('allows creating a link when the caret is collapsed', () => {
    render(
      <CanvasShapeContextToolbar
        editor={createEditorStub() as never}
        editing
        left={240}
        onFillColorChange={vi.fn()}
        onShapeTypeChange={vi.fn()}
        onStrokeColorChange={vi.fn()}
        onStrokeStyleChange={vi.fn()}
        onTextAlignChange={vi.fn()}
        onTextFamilyChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        style={shapeStyle}
        top={160}
        zIndex={88}
      />,
    )

    expect(screen.getByTitle('Create link')).not.toBeDisabled()
  })

  it('opens the fill popover and applies a fill color change', async () => {
    const onFillColorChange = vi.fn()

    render(
      <CanvasShapeContextToolbar
        editor={null}
        editing={false}
        left={240}
        onFillColorChange={onFillColorChange}
        onShapeTypeChange={vi.fn()}
        onStrokeColorChange={vi.fn()}
        onStrokeStyleChange={vi.fn()}
        onTextAlignChange={vi.fn()}
        onTextFamilyChange={vi.fn()}
        onTextSizeChange={vi.fn()}
        style={shapeStyle}
        top={160}
        zIndex={88}
      />,
    )

    fireEvent.click(screen.getByTitle('Fill color'))
    fireEvent.click(await screen.findByText('No fill'))

    expect(onFillColorChange).toHaveBeenCalledWith(null)
  })
})
