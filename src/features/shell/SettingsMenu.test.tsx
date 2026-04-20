/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {ComponentProps} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import {DropdownMenu, DropdownMenuTrigger} from '../../components/ui/dropdown-menu'
import {SettingsMenu} from './SettingsMenu'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

const toastMock = vi.fn()

vi.mock('../../components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

afterEach(() => {
  cleanup()
  toastMock.mockReset()
  navigateMock.mockReset()
})

const currentUser = {
  email: 'user@example.com',
  githubLogin: 'testuser',
  id: 'user-1',
  initials: 'TU',
  isInternalAdmin: true,
  name: 'Test User',
  weekStartsOn: 'sunday',
} satisfies ComponentProps<typeof SettingsMenu>['currentUser']

const currentWorkspace = {
  canManageWorkspace: true,
  colorToken: 'amber',
  defaultProjectSlug: 'alpha',
  icon: '🚀',
  id: 'workspace-1',
  name: 'Rocketboard',
  organizationId: 'org-1',
  organizationName: 'Acme Inc',
  organizationSlug: 'acme-inc',
  projects: [],
  slug: 'rocketboard',
  timezone: 'America/Los_Angeles',
} satisfies ComponentProps<typeof SettingsMenu>['currentWorkspace']

function renderSettingsMenu(
  overrides: Partial<ComponentProps<typeof SettingsMenu>> = {},
) {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      mutations: {retry: false},
      queries: {retry: false},
    },
  })

  const onSaveWeekStartsOn = overrides.onSaveWeekStartsOn ?? vi.fn().mockResolvedValue(undefined)

  render(
    <QueryClientProvider client={queryClient}>
      <DropdownMenu onOpenChange={() => undefined} open>
        <DropdownMenuTrigger asChild>
          <button type='button'>Open</button>
        </DropdownMenuTrigger>
        <SettingsMenu
          currentMode='light'
          currentUser={currentUser}
          currentWorkspace={currentWorkspace}
          isOpen
          onMenuOpenChange={() => undefined}
          onOpenAccountSettings={() => undefined}
          onOpenApiKeys={() => undefined}
          onSaveWeekStartsOn={onSaveWeekStartsOn}
          onSelectMode={() => undefined}
          onSignOut={() => undefined}
          onWorkspaceSelect={() => undefined}
          workspaces={[currentWorkspace]}
          {...overrides}
        />
      </DropdownMenu>
    </QueryClientProvider>,
  )

  return {onSaveWeekStartsOn}
}

describe('SettingsMenu', () => {
  it('opens API keys separately from profile', async () => {
    const user = userEvent.setup()
    const onOpenApiKeys = vi.fn().mockReturnValue(true)

    renderSettingsMenu({onOpenApiKeys})

    await user.click(screen.getByRole('button', {name: 'API Keys'}))

    expect(onOpenApiKeys).toHaveBeenCalledTimes(1)
  })

  it('auto-saves the week start preference on option click', async () => {
    const user = userEvent.setup()
    const {onSaveWeekStartsOn} = renderSettingsMenu()

    await user.click(screen.getByRole('button', {name: 'Date settings'}))

    expect(screen.queryByRole('button', {name: 'Save'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Monday'}))

    await waitFor(() => {
      expect(onSaveWeekStartsOn).toHaveBeenCalledWith('monday')
    })
  })
})
