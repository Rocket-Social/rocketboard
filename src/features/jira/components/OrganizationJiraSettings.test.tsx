// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import {QueryClientProvider} from '@tanstack/react-query'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../../test/queryClient'
import {OrganizationJiraSettings} from './OrganizationJiraSettings'

const {
  cancelJiraConnectionSelectionMock,
  completeJiraConnectionSelectionMock,
  disconnectJiraMock,
  getJiraConnectionStatusMock,
  getPendingJiraSitesMock,
  initiateJiraConnectionMock,
  toastMock,
} = vi.hoisted(() => ({
  cancelJiraConnectionSelectionMock: vi.fn(),
  completeJiraConnectionSelectionMock: vi.fn(),
  disconnectJiraMock: vi.fn(),
  getJiraConnectionStatusMock: vi.fn(),
  getPendingJiraSitesMock: vi.fn(),
  initiateJiraConnectionMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../jira.connect', () => ({
  cancelJiraConnectionSelection: cancelJiraConnectionSelectionMock,
  completeJiraConnectionSelection: completeJiraConnectionSelectionMock,
  disconnectJira: disconnectJiraMock,
  getJiraConnectionStatus: getJiraConnectionStatusMock,
  getPendingJiraSites: getPendingJiraSitesMock,
  initiateJiraConnection: initiateJiraConnectionMock,
}))

function renderSettings() {
  const queryClient = createTestQueryClient({
    defaultOptions: {
      mutations: {retry: false},
      queries: {retry: false},
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationJiraSettings canManage orgId="org-1" />
    </QueryClientProvider>,
  )
}

describe('OrganizationJiraSettings', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    cancelJiraConnectionSelectionMock.mockReset()
    completeJiraConnectionSelectionMock.mockReset()
    disconnectJiraMock.mockReset()
    getJiraConnectionStatusMock.mockReset()
    getPendingJiraSitesMock.mockReset()
    initiateJiraConnectionMock.mockReset()
    toastMock.mockReset()

    getJiraConnectionStatusMock.mockResolvedValue({
      canManage: true,
      config: {
        configured: true,
        missingSecrets: [],
        redirectUri: 'https://example.supabase.co/functions/v1/jira-oauth',
        scopes: ['read:jira-work', 'read:jira-user', 'read:me', 'offline_access'],
      },
      sources: [],
    })
    getPendingJiraSitesMock.mockResolvedValue([
      {
        cloudId: 'cloud-1',
        siteName: 'Example Org',
        siteUrl: 'https://example.atlassian.net',
      },
      {
        cloudId: 'cloud-2',
        siteName: 'Rocketboard Internal',
        siteUrl: 'https://rocketboard.atlassian.net',
      },
    ])
    completeJiraConnectionSelectionMock.mockResolvedValue(undefined)
    cancelJiraConnectionSelectionMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
    window.sessionStorage.clear()
  })

  it('lets admins choose the intended Jira site after a multi-site OAuth callback', async () => {
    const state = '4e68891a-724e-4d16-a765-7180d4e0d87b'
    window.history.replaceState(
      null,
      '',
      `/org/lila-games/settings?tab=jira&jira_status=select_site&jira_state=${state}`,
    )

    renderSettings()

    expect(await screen.findByText('Choose Jira site')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('rocketboard:jira-pending-selection:org-1')).toBe(state)
    expect(getPendingJiraSitesMock).toHaveBeenCalledWith(state, 'org-1')
    expect(await screen.findByText('Rocketboard Internal')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', {name: /^Connect$/i})[1])

    await waitFor(() => {
      expect(completeJiraConnectionSelectionMock).toHaveBeenCalledWith(state, 'cloud-2', 'org-1')
    })
    expect(window.sessionStorage.getItem('rocketboard:jira-pending-selection:org-1')).toBeNull()
    expect(toastMock).toHaveBeenCalledWith({title: 'Connected Rocketboard Internal'})
  })

  it('resumes an unfinished Jira site selection after a refresh', async () => {
    const state = 'da642d42-2062-4aa3-a640-b977b2e9dcdf'
    window.history.replaceState(null, '', '/org/lila-games/settings?tab=jira')
    window.sessionStorage.setItem('rocketboard:jira-pending-selection:org-1', state)

    renderSettings()

    expect(await screen.findByText('Choose Jira site')).toBeInTheDocument()
    expect(getPendingJiraSitesMock).toHaveBeenCalledWith(state, 'org-1')
    expect(await screen.findByText('Example Org')).toBeInTheDocument()
  })
})
