/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from './dropdown-menu'

describe('DropdownMenuContent', () => {
  it('renders above high-z overlays like the AI drawer', () => {
    render(
      <DropdownMenu open onOpenChange={() => undefined}>
        <DropdownMenuTrigger asChild>
          <button type='button'>Open</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>Menu content</DropdownMenuContent>
      </DropdownMenu>,
    )

    expect(screen.getByText('Menu content')).toHaveClass('z-[70]')
  })
})
