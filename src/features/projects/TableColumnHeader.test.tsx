/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {TableColumnHeader} from './TableColumnHeader'
import type {ProjectTableViewDraft} from './project-view.types'
import type {TableColumnDefinition} from './table-view-fields'

const builtinEffortColumn: TableColumnDefinition = {
  defaultWidth: 108,
  editable: true,
  key: 'effort',
  kind: 'builtin',
  label: 'Points',
}

const availableColumns: TableColumnDefinition[] = [
  builtinEffortColumn,
  {
    defaultWidth: 120,
    editable: true,
    key: 'due_date',
    kind: 'builtin',
    label: 'Due Date',
  },
  {
    defaultWidth: 120,
    editable: true,
    key: 'status',
    kind: 'builtin',
    label: 'Status',
  },
]

const draftSetter = vi.fn<(value: ProjectTableViewDraft | ((current: ProjectTableViewDraft) => ProjectTableViewDraft)) => void>()

afterEach(() => {
  cleanup()
})

describe('TableColumnHeader', () => {
  it('shows builtin disclosure and resets renamed builtin labels', async () => {
    const user = userEvent.setup()
    const onRenameBuiltinField = vi.fn()

    render(
      <TableColumnHeader
        availableColumns={availableColumns}
        builtinFieldLabels={{effort: 'Points'}}
        column={builtinEffortColumn}
        onRenameBuiltinField={onRenameBuiltinField}
        setDraft={draftSetter}
        sort={[]}
        visibleFieldKeys={['effort', 'status']}
      />,
    )

    await user.click(screen.getByRole('button'))

    expect(screen.getByText('Built-in: Effort')).toBeInTheDocument()

    await user.click(screen.getByText('Reset to "Effort"'))

    expect(onRenameBuiltinField).toHaveBeenCalledWith('effort', null)
  })

  it('shows the canonical builtin name in add-column menus when an alias exists', async () => {
    const user = userEvent.setup()

    render(
      <TableColumnHeader
        availableColumns={availableColumns}
        builtinFieldLabels={{effort: 'Points'}}
        column={null}
        setDraft={draftSetter}
        sort={[]}
        visibleFieldKeys={['status']}
      />,
    )

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('Add column to the right'))

    expect(screen.getByText('Effort')).toBeInTheDocument()
    expect(screen.getByText('Shown as Points')).toBeInTheDocument()
  })

  it('shows due date specific sort labels in the column menu', async () => {
    const user = userEvent.setup()

    render(
      <TableColumnHeader
        availableColumns={availableColumns}
        column={availableColumns[1]}
        setDraft={draftSetter}
        sort={[]}
        visibleFieldKeys={['due_date', 'status']}
      />,
    )

    await user.click(screen.getByRole('button'))

    expect(screen.getByText('Soonest to latest')).toBeInTheDocument()
    expect(screen.getByText('Latest to soonest')).toBeInTheDocument()
  })
})
