/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import type {AiPersona} from '../ai.types'
import {PersonaEditDialog} from './PersonaEditDialog'

function makePersona(overrides: Partial<AiPersona> = {}): AiPersona {
  return {
    accentColor: 'blue',
    avatarUrl: null,
    createdAt: '2026-04-10T00:00:00.000Z',
    createdBy: null,
    fallbackCredentialKind: null,
    fallbackModel: null,
    fallbackProvider: null,
    focusArea: 'Product Strategy',
    id: 'persona-1',
    isDefault: true,
    isEnabled: true,
    model: 'gpt-5.4',
    name: 'Synthesis',
    organizationId: 'org-1',
    primaryCredentialKind: 'api_key',
    provider: 'openai',
    slug: 'synthesis',
    systemPrompt: 'Help the team ship cleanly.',
    updatedAt: '2026-04-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('PersonaEditDialog', () => {
  it('renders nothing when closed', () => {
    const {container} = render(
      <PersonaEditDialog
        isOpen={false}
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        persona={makePersona()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders persona fields when open', () => {
    render(
      <PersonaEditDialog
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        persona={makePersona()}
      />,
    )

    expect(screen.getByRole('dialog', {name: 'Synthesis'})).toBeInTheDocument()
    expect(screen.getByDisplayValue('Synthesis')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Product Strategy')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Help the team ship cleanly.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', {name: 'Primary provider'})).toHaveValue('openai')
    expect(screen.getByRole('textbox', {name: 'Primary model'})).toHaveValue('gpt-5.4')
    expect(screen.getByRole('combobox', {name: 'Fallback provider'})).toHaveValue('')
  })

  it('disables save when nothing is changed', () => {
    render(
      <PersonaEditDialog
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        persona={makePersona()}
      />,
    )

    expect(screen.getByRole('button', {name: /save changes/i})).toBeDisabled()
  })

  it('enables save after editing a field and calls onSave with the normalized routing payload', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <PersonaEditDialog
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSave={onSave}
        persona={makePersona()}
      />,
    )

    const nameInput = screen.getByDisplayValue('Synthesis')
    await user.clear(nameInput)
    await user.type(nameInput, 'Archie')

    const saveButton = screen.getByRole('button', {name: /save changes/i})
    expect(saveButton).toBeEnabled()

    await user.click(saveButton)
    expect(onSave).toHaveBeenCalledWith({
      accentColor: 'blue',
      fallbackCredentialKind: null,
      fallbackModel: null,
      fallbackProvider: null,
      focusArea: 'Product Strategy',
      model: 'gpt-5.4',
      name: 'Archie',
      primaryCredentialKind: 'api_key',
      provider: 'openai',
      systemPrompt: 'Help the team ship cleanly.',
    })
  })

  it('lets users configure an Anthropic primary route and cross-provider fallback', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <PersonaEditDialog
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSave={onSave}
        persona={makePersona()}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', {name: 'Primary provider'}), 'anthropic')
    await user.selectOptions(screen.getByRole('combobox', {name: 'Primary credential kind'}), 'subscription')
    await user.selectOptions(screen.getByRole('combobox', {name: 'Fallback provider'}), 'google')

    expect(screen.getByRole('textbox', {name: 'Primary model'})).toHaveValue('claude-sonnet-4-20250514')
    expect(screen.getByRole('textbox', {name: 'Fallback model'})).toHaveValue('gemini-2.5-flash')

    await user.click(screen.getByRole('button', {name: /save changes/i}))

    expect(onSave).toHaveBeenCalledWith({
      accentColor: 'blue',
      fallbackCredentialKind: 'api_key',
      fallbackModel: 'gemini-2.5-flash',
      fallbackProvider: 'google',
      focusArea: 'Product Strategy',
      model: 'claude-sonnet-4-20250514',
      name: 'Synthesis',
      primaryCredentialKind: 'subscription',
      provider: 'anthropic',
      systemPrompt: 'Help the team ship cleanly.',
    })
  })

  it('calls onClose when the X button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <PersonaEditDialog
        isOpen
        isSaving={false}
        onClose={onClose}
        onSave={vi.fn()}
        persona={makePersona()}
      />,
    )

    await user.click(screen.getByRole('button', {name: 'Close'}))
    expect(onClose).toHaveBeenCalled()
  })
})
