/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {ReactElement} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {LazySurfaceBoundary} from './LazySurfaceBoundary'

let shouldThrow = true

function FlakySurface() {
  if (shouldThrow) {
    throw new Error('boom')
  }

  return <div>Surface loaded</div>
}

const neverSettles = new Promise<never>(() => {})

function SuspendedSurface(): ReactElement {
  throw neverSettles
}

describe('LazySurfaceBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    shouldThrow = true
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    consoleErrorSpy.mockRestore()
  })

  it('shows a local retry surface and recovers without reloading the page', async () => {
    const user = userEvent.setup()

    render(
      <LazySurfaceBoundary label='Share menu' variant='popover'>
        <FlakySurface/>
      </LazySurfaceBoundary>,
    )

    expect(screen.getByText('Share menu failed to load.')).toBeInTheDocument()

    shouldThrow = false
    await user.click(screen.getByRole('button', {name: 'Retry'}))

    expect(screen.getByText('Surface loaded')).toBeInTheDocument()
  })

  it('shows a dismissible dialog loading state while a lazy surface is still pending', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(
      <LazySurfaceBoundary
        label='Create sprint'
        onDismiss={onDismiss}
        variant='dialog'
      >
        <SuspendedSurface/>
      </LazySurfaceBoundary>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Close'}))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
