/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CreateWorkspaceDialog} from './CreateWorkspaceDialog'

const {mutateSpy} = vi.hoisted(() => ({
  mutateSpy: vi.fn(),
}))

vi.mock('./setup.queries', () => ({
  useCreateWorkspaceMutation: () => ({
    error: null,
    isPending: false,
    mutate: mutateSpy,
  }),
}))

describe('CreateWorkspaceDialog', () => {
  afterEach(() => {
    cleanup()
    mutateSpy.mockReset()
  })

  function renderDialog() {
    render(
      <CreateWorkspaceDialog
        isOpen
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    )
  }

  it('renders the workspace setup copy and starter project form', () => {
    renderDialog()

    expect(screen.getByText('Start a new workspace')).toBeInTheDocument()
    expect(
      screen.getByText('Rocketboard will create the workspace plus a starter board project in one step.'),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Product Ops')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Getting Started')).toBeInTheDocument()
  })

  it('submits the workspace and starter project names', () => {
    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Product Ops'), {
      target: {value: 'Product Ops'},
    })
    fireEvent.change(screen.getByDisplayValue('Getting Started'), {
      target: {value: 'Team Home'},
    })
    fireEvent.click(screen.getByRole('button', {name: 'Create workspace'}))

    expect(mutateSpy).toHaveBeenCalledWith(
      {
        projectName: 'Team Home',
        workspaceName: 'Product Ops',
      },
      expect.any(Object),
    )
  })
})
