/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiKeysPage } from './ApiKeysPage'

const navigateMock = vi.fn()
const organizationQueryState: {
  data: { id: string; name: string; slug: string } | null | undefined
  isPending: boolean
} = {
  data: undefined,
  isPending: false,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ orgSlug: 'rocketboard' }),
}))

vi.mock('../org-settings/org-route.queries', () => ({
  useOrganizationRouteContextQuery: () => organizationQueryState,
}))

vi.mock('./components/ApiKeySettings', () => ({
  ApiKeySettings: ({ organizationId }: { organizationId: string }) => (
    <div data-testid='api-key-settings'>{organizationId}</div>
  ),
}))

afterEach(() => {
  cleanup()
  navigateMock.mockReset()
  organizationQueryState.data = undefined
  organizationQueryState.isPending = false
})

describe('ApiKeysPage', () => {
  it('renders a loading state while the organization lookup is pending', () => {
    organizationQueryState.isPending = true

    render(<ApiKeysPage />)

    expect(screen.getByText('Loading API keys...')).toBeInTheDocument()
  })

  it('shows a not-found state and returns home when the organization is missing', async () => {
    const user = userEvent.setup()
    organizationQueryState.data = null

    render(<ApiKeysPage />)

    await user.click(screen.getByRole('button', { name: 'Go back' }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
  })

  it('renders the dedicated API keys page and navigates back to settings', async () => {
    const user = userEvent.setup()
    organizationQueryState.data = {
      id: 'org-1',
      name: 'Rocketboard',
      slug: 'rocketboard',
    }

    render(<ApiKeysPage />)

    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeInTheDocument()
    expect(screen.getByText(/Rocketboard uses for your AI agents in Rocketboard/)).toBeInTheDocument()
    expect(screen.getByTestId('api-key-settings')).toHaveTextContent('org-1')

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(navigateMock).toHaveBeenCalledWith({ href: '/org/rocketboard/settings' })
  })
})
