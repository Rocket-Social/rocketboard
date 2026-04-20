/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiKeySettings } from './ApiKeySettings'

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>)
}

const refetchMock = vi.fn()

const statusQueryState: {
  data: {
    capabilities: { anthropicSubscriptionEnabled: boolean }
    orgKeys: any[]
    userKeys: Array<{
      credentialKind: 'api_key' | 'subscription'
      disabledReason?: string | null
      lastFour: string | null
      provider: 'openai' | 'anthropic' | 'google'
      setAt: string
    }>
  } | undefined
  error: Error | null
  isError: boolean
  isPending: boolean
  refetch: typeof refetchMock
} = {
  data: undefined,
  error: null,
  isError: false,
  isPending: false,
  refetch: refetchMock,
}

const setKeyMutationState = {
  isPending: false,
  mutate: vi.fn(),
}

const clearKeyMutationState = {
  mutate: vi.fn(),
}

vi.mock('../api-key.queries', () => ({
  useApiKeyStatusQuery: () => statusQueryState,
  useSetApiKeyMutation: () => setKeyMutationState,
  useClearApiKeyMutation: () => clearKeyMutationState,
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(),
    confirmDialogProps: null,
  }),
}))

vi.mock('./ApiKeyProviderCard', () => ({
  ApiKeyProviderCard: ({
    existingKey,
    provider,
  }: {
    existingKey: { lastFour: string } | null
    provider: 'openai' | 'anthropic' | 'google'
  }) => (
    <div data-testid={`provider-${provider}`}>
      {provider}:{existingKey?.lastFour ?? 'empty'}
    </div>
  ),
}))

vi.mock('./AnthropicProviderCard', () => ({
  AnthropicProviderCard: ({
    apiKeyEntry,
    subscriptionEntry,
  }: {
    apiKeyEntry: { lastFour: string | null } | null
    subscriptionEntry: { lastFour: string | null } | null
  }) => (
    <div data-testid='provider-anthropic'>
      anthropic:api={apiKeyEntry?.lastFour ?? 'empty'} subscription={subscriptionEntry?.lastFour ?? 'empty'}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  statusQueryState.data = undefined
  statusQueryState.error = null
  statusQueryState.isError = false
  statusQueryState.isPending = false
  refetchMock.mockReset()
  setKeyMutationState.isPending = false
  setKeyMutationState.mutate.mockReset()
  clearKeyMutationState.mutate.mockReset()
})

describe('ApiKeySettings', () => {
  it('renders loading skeletons while key status is pending', () => {
    statusQueryState.isPending = true

    const { container } = renderWithQueryClient(<ApiKeySettings organizationId='org-1' />)

    expect(screen.queryByTestId('provider-openai')).not.toBeInTheDocument()
    expect(container.getElementsByClassName('animate-pulse')).toHaveLength(3)
  })

  it('renders the empty-state banner when no keys are configured', () => {
    statusQueryState.data = {
      capabilities: { anthropicSubscriptionEnabled: false },
      orgKeys: [],
      userKeys: [],
    }

    renderWithQueryClient(<ApiKeySettings organizationId='org-1' />)

    expect(screen.getByText('No API keys configured yet')).toBeInTheDocument()
    expect(screen.getByText('Add a provider key below to enable AI agents in this organization.')).toBeInTheDocument()
  })

  it('renders the configured-provider banner and provider cards from query data', () => {
    statusQueryState.data = {
      capabilities: { anthropicSubscriptionEnabled: false },
      orgKeys: [],
      userKeys: [
        { credentialKind: 'api_key', lastFour: '1234', provider: 'openai', setAt: '2026-04-11T00:00:00.000Z' },
        { credentialKind: 'api_key', lastFour: '9876', provider: 'google', setAt: '2026-04-11T00:00:00.000Z' },
      ],
    }

    renderWithQueryClient(<ApiKeySettings organizationId='org-1' />)

    expect(screen.getByText('API keys configured')).toBeInTheDocument()
    expect(screen.getByText('OpenAI, Google are ready for AI agents.')).toBeInTheDocument()
    expect(screen.getByTestId('provider-anthropic')).toHaveTextContent('anthropic:api=empty subscription=empty')
    expect(screen.getByTestId('provider-openai')).toHaveTextContent('openai:1234')
    expect(screen.getByTestId('provider-google')).toHaveTextContent('google:9876')
  })

  it('passes separate Anthropic API-key and subscription entries to the Anthropic card', () => {
    statusQueryState.data = {
      capabilities: { anthropicSubscriptionEnabled: true },
      orgKeys: [],
      userKeys: [
        { credentialKind: 'api_key', lastFour: 'AwAA', provider: 'anthropic', setAt: '2026-04-11T00:00:00.000Z' },
        { credentialKind: 'subscription', lastFour: null, provider: 'anthropic', setAt: '2026-04-11T00:00:00.000Z' },
      ],
    }

    renderWithQueryClient(<ApiKeySettings organizationId='org-1' />)

    expect(screen.getByTestId('provider-anthropic')).toHaveTextContent('anthropic:api=AwAA subscription=empty')
    expect(screen.getByText('Anthropic is ready for AI agents.')).toBeInTheDocument()
  })

  it('renders an error card with retry when the status query errors', () => {
    statusQueryState.isError = true
    statusQueryState.error = new Error('Not authenticated')

    renderWithQueryClient(<ApiKeySettings organizationId='org-1' />)

    expect(screen.getByText("Couldn't load your API key status.")).toBeInTheDocument()
    expect(screen.getByText('Not authenticated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByTestId('provider-anthropic')).not.toBeInTheDocument()
    expect(screen.queryByTestId('provider-openai')).not.toBeInTheDocument()
    expect(screen.queryByTestId('provider-google')).not.toBeInTheDocument()
  })

  it('clicking Retry refetches the status query', async () => {
    statusQueryState.isError = true
    statusQueryState.error = new Error('Not authenticated')

    const user = userEvent.setup()
    renderWithQueryClient(<ApiKeySettings organizationId='org-1' />)

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(refetchMock).toHaveBeenCalledTimes(1)
  })
})
