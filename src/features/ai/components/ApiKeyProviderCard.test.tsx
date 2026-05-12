/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ApiKeyStatus } from '../ai.types'
import { ApiKeyProviderCard } from './ApiKeyProviderCard'

function makeExistingKey(overrides: Partial<ApiKeyStatus> = {}): ApiKeyStatus {
  return {
    credentialKind: 'api_key',
    lastFour: '1234',
    provider: 'openai',
    setAt: '2026-04-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('ApiKeyProviderCard', () => {
  it('saves a new key with surrounding whitespace trimmed', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <ApiKeyProviderCard
        existingKey={null}
        isSaving={false}
        onClear={vi.fn()}
        onSave={onSave}
        provider='openai'
        savedProvider={null}
      />,
    )

    await user.type(screen.getByPlaceholderText('sk-...'), '  sk-test-key  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith('sk-test-key')
  })

  it('reveals replace controls for an existing key and allows cancelling', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(
      <ApiKeyProviderCard
        existingKey={makeExistingKey()}
        isSaving={false}
        onClear={onClear}
        onSave={vi.fn()}
        provider='openai'
        savedProvider={null}
      />,
    )

    expect(screen.getByText('Configured')).toBeInTheDocument()
    expect(screen.getByText(/Get a key from OpenAI Platform/)).toHaveAttribute('href', 'https://platform.openai.com/api-keys')
    expect(screen.queryByPlaceholderText('sk-...')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Replace' }))

    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByPlaceholderText('sk-...')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('closes the replace editor after the provider is marked saved', async () => {
    const user = userEvent.setup()

    const view = render(
      <ApiKeyProviderCard
        existingKey={makeExistingKey({ provider: 'openai' })}
        isSaving={false}
        onClear={vi.fn()}
        onSave={vi.fn()}
        provider='openai'
        savedProvider={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Replace' }))
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()

    view.rerender(
      <ApiKeyProviderCard
        existingKey={makeExistingKey({ provider: 'openai' })}
        isSaving={false}
        onClear={vi.fn()}
        onSave={vi.fn()}
        provider='openai'
        savedProvider='openai'
      />,
    )

    expect(screen.queryByPlaceholderText('sk-...')).not.toBeInTheDocument()
  })
})
