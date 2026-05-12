/** @vitest-environment jsdom */
//
// AssigneeHoverCard — agents-only View profile button.
//
// Hover the trigger → after a short delay, the card opens. For agents
// it shows a "View profile" button that calls onViewAgentProfile. For
// humans, no button is shown (we have no /users/<id> route yet).

import '@testing-library/jest-dom/vitest'

import {act, cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {AssignablePersona} from '../ai/agent.types'
import type {ProjectMember} from './access.types'
import {AssigneeHoverCard} from './AssigneeHoverCard'
import {
  _resetAssigneeInteractionState,
  notifyPickerClosed,
  notifyPickerOpened,
} from './assignee-interaction'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  _resetAssigneeInteractionState()
})

const personaSara: AssignablePersona = {
  accentColor: 'orange',
  agentUserId: 'agent-sara',
  avatarUrl: null,
  id: 'persona-sara',
  name: 'Sara',
  role: 'assistant',
  slug: 'sara',
}

const memberJoseph: ProjectMember = {
  email: 'jk@example.com',
  githubLogin: null,
  id: 'human-jk',
  name: 'Joseph',
}

describe('AssigneeHoverCard', () => {
  it('shows nothing when there is no assignee data', () => {
    render(
      <AssigneeHoverCard
        assignablePersonas={[]}
        projectMembers={[]}
        userId={null}
      >
        <span>chip</span>
      </AssigneeHoverCard>,
    )

    expect(screen.getByText('chip')).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'View profile'})).not.toBeInTheDocument()
  })

  it('opens after the hover delay and shows View profile for agents', async () => {
    const user = userEvent.setup()
    const onViewAgentProfile = vi.fn()
    render(
      <AssigneeHoverCard
        assignablePersonas={[personaSara]}
        onViewAgentProfile={onViewAgentProfile}
        projectMembers={[]}
        userId='agent-sara'
      >
        <span data-testid='chip'>Sara chip</span>
      </AssigneeHoverCard>,
    )

    await user.hover(screen.getByTestId('chip'))
    await waitFor(() => {
      expect(screen.getByText('Sara')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', {name: /view profile/i})).toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: /view profile/i}))

    expect(onViewAgentProfile).toHaveBeenCalledTimes(1)
  })

  it('does not show View profile for human assignees', async () => {
    const user = userEvent.setup()
    render(
      <AssigneeHoverCard
        assignablePersonas={[]}
        onViewAgentProfile={vi.fn()}
        projectMembers={[memberJoseph]}
        userId='human-jk'
      >
        <span data-testid='chip'>Joseph chip</span>
      </AssigneeHoverCard>,
    )

    await user.hover(screen.getByTestId('chip'))
    await waitFor(() => {
      expect(screen.getByText('Joseph')).toBeInTheDocument()
    })
    expect(screen.getByText('jk@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', {name: /view profile/i})).not.toBeInTheDocument()
  })

  it('force-closes when a picker opens, and skips hover-to-open while one is active', async () => {
    const user = userEvent.setup()
    render(
      <AssigneeHoverCard
        assignablePersonas={[personaSara]}
        projectMembers={[]}
        userId='agent-sara'
      >
        <span data-testid='chip'>Sara chip</span>
      </AssigneeHoverCard>,
    )

    // Open the hover card.
    await user.hover(screen.getByTestId('chip'))
    await waitFor(() => {
      expect(screen.getByText('Sara')).toBeInTheDocument()
    })

    // Simulate a sibling row's picker opening.
    act(() => {
      notifyPickerOpened()
    })

    // Hover card force-closes.
    await waitFor(() => {
      expect(screen.queryByText('Sara')).not.toBeInTheDocument()
    })

    // While the picker is active, hovering doesn't reopen the hover card.
    await user.unhover(screen.getByTestId('chip'))
    await user.hover(screen.getByTestId('chip'))
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(screen.queryByText('Sara')).not.toBeInTheDocument()

    // Once the picker closes, hover behaviour resumes.
    act(() => {
      notifyPickerClosed()
    })
    await user.unhover(screen.getByTestId('chip'))
    await user.hover(screen.getByTestId('chip'))
    await waitFor(() => {
      expect(screen.getByText('Sara')).toBeInTheDocument()
    })
  })
})
