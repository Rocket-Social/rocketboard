/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ApiKeyStatus } from '../ai.types'
import { AnthropicProviderCard } from './AnthropicProviderCard'

function makeExistingKey(overrides: Partial<ApiKeyStatus> = {}): ApiKeyStatus {
  return {
    credentialKind: 'subscription',
    lastFour: null,
    provider: 'anthropic',
    setAt: '2026-04-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('AnthropicProviderCard', () => {
  it('shows only API key setup when the subscription feature is disabled', () => {
    render(
      <AnthropicProviderCard
        apiKeyEntry={null}
        isFeatureEnabled={false}
        isSaving={false}
        onClear={vi.fn()}
        onSave={vi.fn()}
        onStartConnect={vi.fn().mockResolvedValue(null)}
        onSubmitCode={vi.fn().mockResolvedValue(undefined)}
        savedCredentialKind={null}
        subscriptionEntry={null}
      />,
    )

    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
    expect(screen.queryByText('Claude subscription')).not.toBeInTheDocument()
    expect(screen.queryByText('Connect with Claude')).not.toBeInTheDocument()
  })

  it('saves a pasted setup token when the subscription feature is enabled', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <AnthropicProviderCard
        apiKeyEntry={null}
        isFeatureEnabled={true}
        isSaving={false}
        onClear={vi.fn()}
        onSave={onSave}
        onStartConnect={vi.fn().mockResolvedValue(null)}
        onSubmitCode={vi.fn().mockResolvedValue(undefined)}
        savedCredentialKind={null}
        subscriptionEntry={null}
      />,
    )

    await user.type(screen.getByPlaceholderText('Paste Claude setup token...'), '  setup-token  ')
    await user.click(screen.getByRole('button', { name: 'Save token' }))

    expect(onSave).toHaveBeenCalledWith('setup-token', 'subscription')
  })

  it('starts the Claude browser connect flow from subscription mode', async () => {
    const user = userEvent.setup()
    const onStartConnect = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://claude.ai/oauth/authorize?client_id=x',
      state: 'state-123',
    })

    render(
      <AnthropicProviderCard
        apiKeyEntry={null}
        isFeatureEnabled={true}
        isSaving={false}
        onClear={vi.fn()}
        onSave={vi.fn()}
        onStartConnect={onStartConnect}
        onSubmitCode={vi.fn().mockResolvedValue(undefined)}
        savedCredentialKind={null}
        subscriptionEntry={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Connect with Claude/i }))

    expect(onStartConnect).toHaveBeenCalledTimes(1)
  })

  it('submits the pasted authorization code and clears the waiting form on success', async () => {
    const user = userEvent.setup()
    const onStartConnect = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://claude.ai/oauth/authorize?client_id=x',
      state: 'state-abc',
    })
    const onSubmitCode = vi.fn().mockResolvedValue(undefined)
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    try {
      render(
        <AnthropicProviderCard
          apiKeyEntry={null}
          isFeatureEnabled={true}
          isSaving={false}
          onClear={vi.fn()}
          onSave={vi.fn()}
          onStartConnect={onStartConnect}
          onSubmitCode={onSubmitCode}
          savedCredentialKind={null}
          subscriptionEntry={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: /Connect with Claude/i }))

      const pasteInput = await screen.findByPlaceholderText(/Paste code#state from the Anthropic console/)
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://claude.ai/oauth/authorize?client_id=x',
        '_blank',
        'noopener,noreferrer',
      )

      await user.type(pasteInput, 'code-xyz')
      await user.click(screen.getByRole('button', { name: /^Connect$/ }))

      expect(onSubmitCode).toHaveBeenCalledWith({ code: 'code-xyz', state: 'state-abc' })

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Paste code#state/)).not.toBeInTheDocument()
      })
    } finally {
      windowOpenSpy.mockRestore()
    }
  })

  it('surfaces paste-code submission errors inline', async () => {
    const user = userEvent.setup()
    const onStartConnect = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://claude.ai/oauth/authorize?client_id=x',
      state: 'state-abc',
    })
    const onSubmitCode = vi.fn().mockRejectedValue(new Error('link has expired'))
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    try {
      render(
        <AnthropicProviderCard
          apiKeyEntry={null}
          isFeatureEnabled={true}
          isSaving={false}
          onClear={vi.fn()}
          onSave={vi.fn()}
          onStartConnect={onStartConnect}
          onSubmitCode={onSubmitCode}
          savedCredentialKind={null}
          subscriptionEntry={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: /Connect with Claude/i }))
      const pasteInput = await screen.findByPlaceholderText(/Paste code#state from the Anthropic console/)
      await user.type(pasteInput, 'stale-code')
      await user.click(screen.getByRole('button', { name: /^Connect$/ }))

      expect(await screen.findByText('link has expired')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Paste code#state/)).toBeInTheDocument()
    } finally {
      windowOpenSpy.mockRestore()
    }
  })

  it('shows disabled saved subscription credentials and only offers API-key replacement when the flag is off', async () => {
    const user = userEvent.setup()

    render(
      <AnthropicProviderCard
        apiKeyEntry={makeExistingKey({ credentialKind: 'api_key', lastFour: 'AwAA' })}
        isFeatureEnabled={false}
        isSaving={false}
        onClear={vi.fn()}
        onSave={vi.fn()}
        onStartConnect={vi.fn().mockResolvedValue(null)}
        onSubmitCode={vi.fn().mockResolvedValue(undefined)}
        savedCredentialKind={null}
        subscriptionEntry={makeExistingKey({ disabledReason: 'Anthropic subscription auth is currently disabled by Rocketboard.' })}
      />,
    )

    expect(screen.getByText('Saved, disabled')).toBeInTheDocument()
    expect(screen.getByText('Anthropic subscription auth is currently disabled by Rocketboard.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Replace with API key' }))

    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
    expect(screen.queryByText('Connect with Claude')).not.toBeInTheDocument()
  })
})
