/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {AI_PERSONA_PHASE1_DEFAULTS, type AiPersona} from '../ai.types'
import {PersonaCard} from './PersonaCard'

function makePersona(overrides: Partial<AiPersona> = {}): AiPersona {
  return {
    ...AI_PERSONA_PHASE1_DEFAULTS,
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
    maxRunsPerHour: 60,
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

describe('PersonaCard', () => {
  it('hides the edit action when no edit callback is provided', async () => {
    const user = userEvent.setup()

    render(<PersonaCard onToggle={vi.fn()} persona={makePersona()} />)

    await user.click(screen.getByRole('button', {name: 'Persona actions'}))

    expect(screen.queryByRole('menuitem', {name: 'Edit persona'})).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', {name: 'Disable'})).toBeInTheDocument()
  })

  it('shows the edit action when an edit callback is provided', async () => {
    const user = userEvent.setup()

    render(<PersonaCard onEdit={vi.fn()} onToggle={vi.fn()} persona={makePersona()} />)

    await user.click(screen.getByRole('button', {name: 'Persona actions'}))

    expect(screen.getByRole('menuitem', {name: 'Edit persona'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem', {name: 'Disable'})).toBeInTheDocument()
  })

  it('calls onEdit when the card is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(<PersonaCard onEdit={onEdit} onToggle={vi.fn()} persona={makePersona()} />)

    await user.click(screen.getByRole('button', {name: /Synthesis/}))

    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onEdit when Enter is pressed on the card', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(<PersonaCard onEdit={onEdit} onToggle={vi.fn()} persona={makePersona()} />)

    const card = screen.getByRole('button', {name: /Synthesis/})
    card.focus()
    await user.keyboard('{Enter}')

    expect(onEdit).toHaveBeenCalledOnce()
  })
})
