/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ToolCallActionRow} from './ToolCallActionRow'

describe('ToolCallActionRow (D6 shared atom)', () => {
  it('renders label + description and fires onApprove / onReject', () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()
    render(
      <ToolCallActionRow
        description='priority=p1'
        label='Set status to Investigating'
        onApprove={onApprove}
        onReject={onReject}
      />,
    )

    expect(screen.getByText('Set status to Investigating')).toBeInTheDocument()
    expect(screen.getByText('priority=p1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {name: /Approve Set status/i}))
    fireEvent.click(screen.getByRole('button', {name: /Reject Set status/i}))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('hides buttons when isPermissionDenied=true (D17)', () => {
    render(
      <ToolCallActionRow
        isPermissionDenied
        label='Set status to Investigating'
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', {name: /Approve/i})).toBeNull()
    expect(screen.queryByRole('button', {name: /Reject/i})).toBeNull()
  })

  it('renders pendingState labels when transitioning (D12)', () => {
    render(
      <ToolCallActionRow
        isPending
        label='Set status to Investigating'
        onApprove={vi.fn()}
        onReject={vi.fn()}
        pendingState='approving'
      />,
    )

    expect(screen.getByRole('button', {name: /Approve/i})).toHaveTextContent('Approving…')
    expect(screen.getByRole('button', {name: /Approve/i})).toBeDisabled()
    expect(screen.getByRole('button', {name: /Reject/i})).toBeDisabled()
  })
})
