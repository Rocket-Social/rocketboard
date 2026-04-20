/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import type {ComponentProps} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CreatePlanDialog} from './CreatePlanDialog'

describe('CreatePlanDialog', () => {
  afterEach(() => {
    cleanup()
  })

  function renderDialog(overrides: Partial<ComponentProps<typeof CreatePlanDialog>> = {}) {
    const onClose = vi.fn()
    const onCreate = vi.fn()

    render(
      <CreatePlanDialog
        isOpen
        onClose={onClose}
        onCreate={onCreate}
        {...overrides}
      />,
    )

    return {onClose, onCreate}
  }

  it('renders the planning copy and board options', () => {
    renderDialog()

    expect(screen.getByText('Add a plan to this workspace.')).toBeInTheDocument()
    expect(
      screen.getByText('Plans are a set of planning boards around a similar theme.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Planning boards')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g., Q2 Roadmap')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Roadmap board/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Releases board/i})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /Scorecard board/i})).toBeInTheDocument()
  })

  it('defaults to Roadmap selected', () => {
    renderDialog()

    const roadmapBtn = screen.getByRole('button', {name: /Roadmap board/i})
    expect(roadmapBtn.className).toContain('border-primary')
  })

  it('toggles board types on click', () => {
    renderDialog()

    const releasesBtn = screen.getByRole('button', {name: /Releases board/i})
    fireEvent.click(releasesBtn)
    expect(releasesBtn.className).toContain('bg-primary-soft/40')

    fireEvent.click(releasesBtn)
    expect(releasesBtn.className).not.toContain('bg-primary-soft/40')
  })

  it('submits the plan configuration', () => {
    const {onCreate} = renderDialog()

    fireEvent.change(screen.getByPlaceholderText('e.g., Q2 Roadmap'), {
      target: {value: 'Q4 Planning'},
    })
    fireEvent.click(screen.getByRole('button', {name: 'Create plan'}))

    expect(onCreate).toHaveBeenCalledWith({
      planName: 'Q4 Planning',
      viewTypes: ['roadmap'],
    })
  })

  it('hides board options when opened for a specific board type', () => {
    const {onCreate} = renderDialog({defaultViewType: 'releases'})

    expect(screen.queryByText('Planning boards')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Roadmap board/i})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Releases board/i})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /Scorecard board/i})).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('e.g., Q2 Roadmap'), {
      target: {value: 'April Launches'},
    })
    fireEvent.click(screen.getByRole('button', {name: 'Create plan'}))

    expect(onCreate).toHaveBeenCalledWith({
      planName: 'April Launches',
      viewTypes: ['releases'],
    })
  })

  it('close X button calls onClose', () => {
    const {onClose} = renderDialog()

    fireEvent.click(screen.getByRole('button', {name: 'Close'}))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
