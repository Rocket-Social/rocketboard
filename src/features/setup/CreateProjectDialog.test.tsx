/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, fireEvent, render, screen, within} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {CreateProjectDialog} from './CreateProjectDialog'

const {mutateSpy} = vi.hoisted(() => ({
  mutateSpy: vi.fn(),
}))

vi.mock('./setup.queries', () => ({
  useCreateProjectMutation: () => ({
    error: null,
    isPending: false,
    mutate: mutateSpy,
  }),
}))

describe('CreateProjectDialog', () => {
  afterEach(() => {
    cleanup()
    mutateSpy.mockReset()
  })

  function renderDialog() {
    const onClose = vi.fn()
    render(
      <CreateProjectDialog
        isOpen
        onClose={onClose}
        onCreated={vi.fn()}
        workspaceId='workspace-1'
      />,
    )

    return {onClose}
  }

  it('renders the updated project and board copy with canvas included', () => {
    renderDialog()

    expect(screen.getByText('Add a project to this workspace')).toBeInTheDocument()
    expect(
      screen.getByText('Projects are collections of boards around a similar theme.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Board options')).toBeInTheDocument()
    expect(
      screen.getByText("Choose the boards you'd like to add with this project. Table, Kanban, and Gantt tasks are connected. You can add additional boards later."),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g., Sprint Planning')).toBeInTheDocument()
    expect(screen.getByText('Canvas')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getAllByText('1 per project')).toHaveLength(3)
    expect(screen.getAllByText('Up to 10 per project')).toHaveLength(3)
  })

  it('focuses the project name input immediately on open', () => {
    renderDialog()

    expect(screen.getByPlaceholderText('e.g., Sprint Planning')).toHaveFocus()
  })

  it('adds GitHub to the default landing board choices when selected', () => {
    renderDialog()

    fireEvent.click(screen.getByText('GitHub'))

    const defaultLandingBoard = screen.getByRole('combobox')
    expect(within(defaultLandingBoard).getByRole('option', {name: 'GitHub'})).toBeInTheDocument()
  })

  it('adds Canvas to the default landing board choices when selected', () => {
    renderDialog()

    fireEvent.click(screen.getByText('Canvas'))

    const defaultLandingBoard = screen.getByRole('combobox')
    expect(within(defaultLandingBoard).getByRole('option', {name: 'Canvas'})).toBeInTheDocument()
  })

  it('renders the Private checkbox unchecked by default', () => {
    renderDialog()

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByText('Only project members and workspace admins can see this')).toBeInTheDocument()
  })

  it('passes access private to the mutation when Private is checked', () => {
    renderDialog()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByPlaceholderText('e.g., Sprint Planning'), {target: {value: 'Secret Project'}})
    fireEvent.click(screen.getByRole('button', {name: 'Create project'}))

    expect(mutateSpy).toHaveBeenCalledTimes(1)
    expect(mutateSpy.mock.calls[0][0]).toMatchObject({access: 'private', projectName: 'Secret Project'})
  })

  it('close X button calls onClose', () => {
    const {onClose} = renderDialog()

    fireEvent.click(screen.getByRole('button', {name: 'Close'}))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
