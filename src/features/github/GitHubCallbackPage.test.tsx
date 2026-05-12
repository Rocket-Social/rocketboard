/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {completeGitHubAppInstallMock, navigateMock} = vi.hoisted(() => ({
  completeGitHubAppInstallMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('./github.connect', () => ({
  completeGitHubAppInstall: completeGitHubAppInstallMock,
}))

import {GitHubCallbackPage} from './GitHubCallbackPage'

describe('GitHubCallbackPage', () => {
  beforeEach(() => {
    completeGitHubAppInstallMock.mockReset()
    navigateMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/')
  })

  it('completes installs when GitHub redirects directly with installation params', async () => {
    completeGitHubAppInstallMock.mockResolvedValue({
      return_path: '/settings/organizations/org-1?tab=github',
      success: true,
    })

    window.history.replaceState(
      {},
      '',
      '/integrations/github/callback?installation_id=42&state=test-state',
    )

    render(<GitHubCallbackPage />)

    await waitFor(() => {
      expect(completeGitHubAppInstallMock).toHaveBeenCalledWith('test-state', 42)
    })

    expect(screen.getByText('GitHub Connected!')).toBeInTheDocument()
  })

  it('shows an error when callback params are missing', async () => {
    window.history.replaceState({}, '', '/integrations/github/callback')

    render(<GitHubCallbackPage />)

    expect(await screen.findByText('Connection Failed')).toBeInTheDocument()
    expect(screen.getByText('Invalid callback parameters')).toBeInTheDocument()
  })
})
