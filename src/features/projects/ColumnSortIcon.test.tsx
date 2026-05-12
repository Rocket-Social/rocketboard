/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ColumnSortIcon} from './ColumnSortIcon'

afterEach(() => {
  cleanup()
})

describe('ColumnSortIcon', () => {
  it('uses a down arrow for ascending when active direction icons are reversed', () => {
    const {container} = render(
      <ColumnSortIcon
        direction='asc'
        onClear={vi.fn()}
        onSave={vi.fn()}
        onToggle={vi.fn()}
        reverseActiveDirectionIcon
      />,
    )

    expect(container.querySelector('.lucide-arrow-down')).toBeInTheDocument()
    expect(container.querySelector('.lucide-arrow-up')).not.toBeInTheDocument()
  })
})
