/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ProjectTaskModeControl} from './ProjectTaskModeControl'

const {mutateAsyncMock, toastMock, useProjectChromeMock, useProjectDataMock} = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  toastMock: vi.fn(),
  useProjectChromeMock: vi.fn(),
  useProjectDataMock: vi.fn(),
}))

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

vi.mock('./project/ProjectChromeContext', () => ({
  useProjectChrome: useProjectChromeMock,
}))

vi.mock('./project/ProjectDataContext', () => ({
  useProjectData: useProjectDataMock,
}))

vi.mock('../projects/project-task-mode.mutations', () => ({
  useSetProjectTaskModeMutation: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}))

function renderProjectTaskModeControl(overrides: Record<string, unknown> = {}) {
  const setProjectTaskModeOverride = overrides.setProjectTaskMode as
    | ((taskMode: string) => Promise<unknown>)
    | undefined
  const setProjectTaskMode =
    setProjectTaskModeOverride ?? vi.fn().mockResolvedValue(undefined)
  mutateAsyncMock.mockImplementation((taskMode) => setProjectTaskMode(taskMode))

  useProjectChromeMock.mockReturnValue({
    canEditProject: overrides.canEditProject ?? true,
    projectId: 'project-1',
  })
  useProjectDataMock.mockReturnValue({
    projectTaskMode: overrides.projectTaskMode ?? 'standard',
    projectTaskModeReady: overrides.projectTaskModeReady ?? true,
  })

  render(<ProjectTaskModeControl/>)

  return {setProjectTaskMode}
}

describe('ProjectTaskModeControl', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    toastMock.mockReset()
    useProjectChromeMock.mockReset()
    useProjectDataMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('disables the trigger while the project task mode is still loading', () => {
    renderProjectTaskModeControl({projectTaskModeReady: false})

    expect(screen.getByRole('button', {name: /loading/i})).toBeDisabled()
  })

  it('lets guests open the menu but blocks changes', async () => {
    const user = userEvent.setup()
    const {setProjectTaskMode} = renderProjectTaskModeControl({canEditProject: false})

    await user.click(screen.getByRole('button', {name: 'Guest users cannot set task mode.'}))

    expect(screen.getByText('Guest users cannot set task mode.')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', {name: 'Sprint'}))

    expect(setProjectTaskMode).not.toHaveBeenCalled()
  })

  it('shows a success toast after changing the shared task mode', async () => {
    const user = userEvent.setup()
    const {setProjectTaskMode} = renderProjectTaskModeControl()

    await user.click(screen.getByRole('button', {name: /standard/i}))
    await user.click(screen.getByRole('menuitem', {name: 'Sprint'}))

    await waitFor(() => expect(setProjectTaskMode).toHaveBeenCalledWith('sprint'))
    expect(toastMock).toHaveBeenCalledWith({
      description: 'Table, kanban, and gantt updated for everyone on this project.',
      title: 'Project task mode set to Sprint',
    })
  })

  it('shows an error toast when the shared task mode update fails', async () => {
    const user = userEvent.setup()
    const {setProjectTaskMode} = renderProjectTaskModeControl({
      setProjectTaskMode: vi.fn().mockRejectedValue({message: 'Permission denied'}),
    })

    await user.click(screen.getByRole('button', {name: /standard/i}))
    await user.click(screen.getByRole('menuitem', {name: 'Sprint'}))

    await waitFor(() => expect(setProjectTaskMode).toHaveBeenCalledWith('sprint'))
    expect(toastMock).toHaveBeenCalledWith({
      description: 'Permission denied',
      title: "Couldn't update project task mode",
      variant: 'error',
    })
  })
})
