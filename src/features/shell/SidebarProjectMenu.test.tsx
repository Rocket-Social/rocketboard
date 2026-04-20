/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {SidebarProjectMenu} from './SidebarProjectMenu'

describe('SidebarProjectMenu', () => {
  it('does not bubble menu item clicks to the parent row', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const onRename = vi.fn()

    render(
      <div onClick={onRowClick}>
        <SidebarProjectMenu
          darkSidebar
          onCopyLink={() => undefined}
          onDelete={() => undefined}
          onDuplicate={() => undefined}
          onOpenInNewTab={() => undefined}
          onRename={onRename}
          onToggleFavorite={() => undefined}
        />
      </div>,
    )

    await user.click(screen.getByRole('button', {name: 'Menu'}))
    await user.click(await screen.findByText('Rename'))

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
