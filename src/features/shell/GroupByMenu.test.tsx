/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {GroupByMenu} from './GroupByMenu'

describe('GroupByMenu', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders only the grouping options supported by the current view', () => {
    const onGroupByChange = vi.fn()

    render(
      <GroupByMenu
        groupBy='group'
        onGroupByChange={onGroupByChange}
        options={['group', 'status']}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', {name: /group/i}), {button: 0, ctrlKey: false})

    expect(screen.getByText('Group (default)')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.queryByText('Initiative')).not.toBeInTheDocument()
    expect(screen.queryByText('Priority')).not.toBeInTheDocument()
    expect(screen.queryByText('Sprint')).not.toBeInTheDocument()
  })

  it('always restores the default group option even if the caller omits it', () => {
    const onGroupByChange = vi.fn()

    render(
      <GroupByMenu
        groupBy='status'
        onGroupByChange={onGroupByChange}
        options={['status', 'assignee']}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', {name: /status/i}), {button: 0, ctrlKey: false})
    fireEvent.click(screen.getByText('Group (default)'))

    expect(onGroupByChange).toHaveBeenCalledWith('group')
  })

  it('can relabel the default grouping for sprint mode', () => {
    const onGroupByChange = vi.fn()

    render(
      <GroupByMenu
        groupBy='group'
        groupLabel='None'
        onGroupByChange={onGroupByChange}
        options={['group', 'status']}
      />,
    )

    expect(screen.getByRole('button', {name: /none/i})).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', {name: /none/i}), {button: 0, ctrlKey: false})

    expect(screen.getByText('None (default)')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })
})
