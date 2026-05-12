/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {closeMobileSidebarMock, navigateMock, shellStateMock, toastMock} = vi.hoisted(() => ({
  closeMobileSidebarMock: vi.fn(),
  navigateMock: vi.fn(),
  shellStateMock: {
    closeMobileSidebar: vi.fn(),
  },
  toastMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

vi.mock('../SidebarShellStateContext', () => ({
  useSidebarShellState: () => shellStateMock,
}))

import {useProjectDialogState} from './useProjectDialogState'

describe('useProjectDialogState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shellStateMock.closeMobileSidebar = closeMobileSidebarMock
  })

  it('blocks workspace creation for non-admin organization members', async () => {
    const confirmDiscardNavigationChanges = vi.fn(async () => true)
    const {result} = renderHook(() =>
      useProjectDialogState({
        canCreateWorkspace: false,
        confirmDiscardNavigationChanges,
        orgSlug: 'rocketboard',
        projectSlug: 'roadmap',
        resolvedProject: null,
        workspaceOrganizationSlug: 'rocketboard',
        workspaceSlug: 'main',
      }),
    )

    await act(async () => {
      await expect(result.current.openWorkspaceComposer()).resolves.toBe(false)
    })

    expect(confirmDiscardNavigationChanges).not.toHaveBeenCalled()
    expect(result.current.createWorkspaceOpen).toBe(false)
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Only organization admins can create workspaces',
      description:
        'Ask an organization admin to create the workspace or upgrade your organization role.',
      variant: 'error',
    })
  })

  it('opens the workspace dialog for organization admins after confirming navigation changes', async () => {
    const confirmDiscardNavigationChanges = vi.fn(async () => true)
    const {result} = renderHook(() =>
      useProjectDialogState({
        canCreateWorkspace: true,
        confirmDiscardNavigationChanges,
        orgSlug: 'rocketboard',
        projectSlug: 'roadmap',
        resolvedProject: null,
        workspaceOrganizationSlug: 'rocketboard',
        workspaceSlug: 'main',
      }),
    )

    await act(async () => {
      await expect(result.current.openWorkspaceComposer()).resolves.toBe(true)
    })

    expect(confirmDiscardNavigationChanges).toHaveBeenCalledTimes(1)
    expect(closeMobileSidebarMock).toHaveBeenCalledTimes(2)
    expect(result.current.createWorkspaceOpen).toBe(true)
    expect(toastMock).not.toHaveBeenCalled()
  })
})
