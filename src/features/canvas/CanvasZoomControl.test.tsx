/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {CanvasZoomControl} from './CanvasZoomControl'

describe('CanvasZoomControl', () => {
  it('shows the current zoom and triggers fit or preset zoom changes', async () => {
    const user = userEvent.setup()
    const onFit = vi.fn()
    const onZoomChange = vi.fn()

    render(
      <CanvasZoomControl
        onFit={onFit}
        onZoomChange={onZoomChange}
        scale={1}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Canvas zoom 100%'}))

    expect(screen.getByRole('menuitem', {name: 'Fit'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem', {name: '100%'})).toHaveClass('bg-canvas-accent')

    await user.click(screen.getByRole('menuitem', {name: 'Fit'}))
    expect(onFit).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', {name: 'Canvas zoom 100%'}))
    await user.click(screen.getByRole('menuitem', {name: '125%'}))

    expect(onZoomChange).toHaveBeenCalledWith(1.25)
  })

  it('does not mark a preset selected when the displayed zoom is between presets', async () => {
    const user = userEvent.setup()

    render(
      <CanvasZoomControl
        onFit={vi.fn()}
        onZoomChange={vi.fn()}
        scale={0.96}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Canvas zoom 96%'}))

    expect(screen.getByRole('menuitem', {name: '100%'})).not.toHaveClass('bg-canvas-accent')
  })

  it('falls back to a readable label when scale is not finite at runtime', () => {
    render(
      <CanvasZoomControl
        onFit={vi.fn()}
        onZoomChange={vi.fn()}
        scale={Number.NaN}
      />,
    )

    expect(screen.getByRole('button', {name: 'Canvas zoom 100%'})).toBeInTheDocument()
  })
})
