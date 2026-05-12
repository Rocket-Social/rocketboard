/** @vitest-environment jsdom */
//
// AssigneePicker — Monday-style assignee picker tests.
//
// Behaviour contracts:
//   - No "Unassigned" row in the menu; clearing happens via the X chip
//     at the top.
//   - Search filters humans + agents by name (case-insensitive).
//   - AI agents only appear when they're already project_members
//     (no auto-populate of org-level personas).

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {AssignablePersona} from '../ai/agent.types'
import type {ProjectMember} from './access.types'
import {AssigneePicker} from './AssigneePicker'

const memberJoseph: ProjectMember = {
  email: 'jk@example.com',
  githubLogin: null,
  id: 'human-jk',
  name: 'Joseph',
}
const memberAlice: ProjectMember = {
  email: 'alice@example.com',
  githubLogin: null,
  id: 'human-alice',
  name: 'Alice',
}
const personaSara: AssignablePersona = {
  accentColor: 'orange',
  agentUserId: 'agent-sara',
  avatarUrl: null,
  id: 'persona-sara',
  name: 'Sara',
  role: 'assistant',
  slug: 'sara',
}
const personaAndy: AssignablePersona = {
  accentColor: 'violet',
  agentUserId: 'agent-andy',
  avatarUrl: null,
  id: 'persona-andy',
  name: 'Andy',
  role: 'assistant',
  slug: 'andy',
}

afterEach(() => {
  cleanup()
})

function setup(overrides: Partial<React.ComponentProps<typeof AssigneePicker>> = {}) {
  const onSelect = overrides.onSelect ?? vi.fn()
  return {
    onSelect,
    user: userEvent.setup(),
    ...render(
      <AssigneePicker
        assignablePersonas={[]}
        currentAssigneeUserId={null}
        onSelect={onSelect}
        projectMembers={[memberAlice, memberJoseph]}
        {...overrides}
      />,
    ),
  }
}

describe('AssigneePicker', () => {
  it('does not render an "Unassigned" row in the menu', async () => {
    const {user} = setup()

    await user.click(screen.getByLabelText(/change assignee/i))

    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument()
  })

  it('shows the current assignee chip with an X to clear, no menu row', async () => {
    const {user, onSelect} = setup({currentAssigneeUserId: 'human-jk'})

    await user.click(screen.getByLabelText(/change assignee/i))

    const removeButton = screen.getByLabelText('Remove assignee')
    await user.click(removeButton)

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('filters humans by the search query (case-insensitive)', async () => {
    const {user} = setup()

    await user.click(screen.getByLabelText(/change assignee/i))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Joseph')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Search names'), 'jos')

    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.getByText('Joseph')).toBeInTheDocument()
  })

  it('does not show an agent persona that is not a project member', async () => {
    const {user} = setup({
      assignablePersonas: [personaSara, personaAndy],
      projectMembers: [memberJoseph], // no agent membership
    })

    await user.click(screen.getByLabelText(/change assignee/i))

    expect(screen.getByText('Joseph')).toBeInTheDocument()
    expect(screen.queryByText('Sara')).not.toBeInTheDocument()
    expect(screen.queryByText('Andy')).not.toBeInTheDocument()
    expect(screen.queryByText('AI agents')).not.toBeInTheDocument()
  })

  it('shows an agent persona when they are already a project member', async () => {
    const saraAsMember: ProjectMember = {
      email: 'sara@bot.local',
      githubLogin: null,
      id: 'agent-sara',
      name: 'Sara',
    }
    const {user} = setup({
      assignablePersonas: [personaSara, personaAndy],
      projectMembers: [memberJoseph, saraAsMember], // Sara is a member, Andy is not
    })

    await user.click(screen.getByLabelText(/change assignee/i))

    expect(screen.getByText('AI agents')).toBeInTheDocument()
    expect(screen.getByText('Sara')).toBeInTheDocument()
    expect(screen.queryByText('Andy')).not.toBeInTheDocument()
  })

  it('selecting a row fires onSelect with the user id and closes the menu', async () => {
    const onSelect = vi.fn()
    const {user} = setup({onSelect})

    await user.click(screen.getByLabelText(/change assignee/i))
    await user.click(screen.getByText('Alice'))

    expect(onSelect).toHaveBeenCalledWith('human-alice')
    // Search input should not still be in the DOM (menu closed).
    expect(screen.queryByPlaceholderText('Search names')).not.toBeInTheDocument()
  })

  it('shows an empty state when search has no matches', async () => {
    const {user} = setup()

    await user.click(screen.getByLabelText(/change assignee/i))
    await user.type(screen.getByPlaceholderText('Search names'), 'xyz')

    expect(screen.getByText('No matches.')).toBeInTheDocument()
  })

  it('shows a different empty state when the project has no members', async () => {
    const {user} = setup({projectMembers: []})

    await user.click(screen.getByLabelText(/change assignee/i))

    expect(screen.getByText('No assignees in this project yet.')).toBeInTheDocument()
  })
})
