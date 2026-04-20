/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {BulkActionsBar} from './BulkActionsBar'

afterEach(() => {
  cleanup()
})

describe('BulkActionsBar', () => {
  it('offers sprint moves even when no groups exist', async () => {
    const user = userEvent.setup()
    const onMoveToSprint = vi.fn()

    render(
      <BulkActionsBar
        groups={[]}
        onArchive={() => undefined}
        onClearSelection={() => undefined}
        onDelete={() => undefined}
        onDuplicate={() => undefined}
        onMoveToGroup={() => undefined}
        onMoveToSprint={onMoveToSprint}
        selectedCount={3}
        sprints={[{id: 'sprint-1', label: 'Sprint 1'}]}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Move'}))

    expect(screen.getByRole('button', {name: 'Move to sprint'})).toBeInTheDocument()
    expect(screen.queryByText('No move targets available')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Move to sprint'}))

    expect(screen.getByText('Choose sprint')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Sprint 1'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Backlog'})).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Sprint 1'}))

    expect(onMoveToSprint).toHaveBeenCalledWith('sprint-1')
  })

  it('invokes onDuplicate when the Duplicate button is clicked', async () => {
    const user = userEvent.setup()
    const onDuplicate = vi.fn()

    render(
      <BulkActionsBar
        groups={[]}
        onArchive={() => undefined}
        onClearSelection={() => undefined}
        onDelete={() => undefined}
        onDuplicate={onDuplicate}
        onMoveToGroup={() => undefined}
        onMoveToSprint={() => undefined}
        selectedCount={3}
        sprints={[]}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Duplicate'}))

    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })
})
