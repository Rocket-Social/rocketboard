/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {CanvasColorSwatchPalette, CanvasShapeGlyph, CanvasShapePickerGrid} from './CanvasShapeControls'
import type {CanvasShapeType} from './canvas.types'

describe('CanvasShapeControls', () => {
  it('offers the added shape choices in the shape picker', () => {
    render(
      <CanvasShapePickerGrid
        onShapeTypeChange={vi.fn()}
        selectedShapeType='rectangle'
      />,
    )

    expect(screen.getByRole('button', {name: 'Fat plus'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Star'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Thought bubble'})).toBeInTheDocument()
  })

  it('renders glyph geometry for the added shapes', () => {
    const shapeTypes: CanvasShapeType[] = ['plus', 'star', 'thought-bubble']

    shapeTypes.forEach((shapeType) => {
      const {container, unmount} = render(<CanvasShapeGlyph shapeType={shapeType}/>)

      expect(container.querySelector('svg > *')).toBeInTheDocument()
      unmount()
    })
  })

  it('offers the added red and light green swatches', () => {
    render(
      <CanvasColorSwatchPalette
        onChange={vi.fn()}
        selectedColor='#dc2626'
      />,
    )

    expect(screen.getByRole('button', {name: 'Select color #dc2626'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Select color #ef4444'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Select color #bbf7d0'})).toBeInTheDocument()
  })
})
