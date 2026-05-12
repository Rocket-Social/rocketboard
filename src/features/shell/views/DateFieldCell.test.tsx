/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {DateFieldCell} from './DateFieldCell'

afterEach(() => {
  cleanup()
})

describe('DateFieldCell', () => {
  it('shows a clear button on hover and clears due dates when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DateFieldCell
        fieldKey='due_date'
        onChange={onChange}
        value='2026-04-06'
      />,
    )

    const clearButton = screen.getByRole('button', {name: 'Clear due date'})

    expect(clearButton.className).toContain('group-hover/date-cell:opacity-100')

    await user.click(clearButton)

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
