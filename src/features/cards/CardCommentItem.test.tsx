/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {CardCommentItem} from './CardCommentItem'
import type {CardComment} from './card.types'
import type {SessionUser} from '../auth/data'
import type {ProjectMember} from '../access/access.types'

const SESSION: SessionUser = {
  avatarUrl: null,
  email: 'me@example.com',
  githubLogin: null,
  id: 'user-me',
  initials: 'ME',
  isInternalAdmin: false,
  name: 'Me',
  weekStartsOn: 'monday',
}

const PROJECT_MEMBERS: ProjectMember[] = []

function makeComment(overrides: Partial<CardComment> = {}): CardComment {
  return {
    id: 'c-1',
    authorName: 'Joe',
    authorUserId: 'user-other',
    bodyText: 'Hello there.',
    createdAt: '2026-05-05T12:00:00.000Z',
    isStreaming: false,
    agentRunContext: null,
    ...overrides,
  }
}

describe('CardCommentItem', () => {
  it('renders the human variant without an accent border or aria-live region', () => {
    render(
      <CardCommentItem
        comment={makeComment()}
        currentUser={SESSION}
        projectMembers={PROJECT_MEMBERS}
      />,
    )
    const wrapper = screen.getByTestId('card-comment-c-1')
    expect(wrapper).not.toHaveAttribute('role', 'status')
    expect(wrapper.textContent).toContain('Hello there.')
    // No streaming indicator on a finished comment.
    expect(screen.queryByLabelText(/streaming response/i)).toBeNull()
  })

  it('renders the agent-completed variant with persona accent + no animation', () => {
    render(
      <CardCommentItem
        comment={makeComment({
          authorName: 'Sara',
          authorUserId: 'agent-user',
          isStreaming: false,
          agentRunContext: {
            runId: 'run-1',
            personaId: 'persona-1',
            personaName: 'Sara',
            personaAccentColor: 'orange',
            status: 'succeeded',
            toolCalls: [],
          },
        })}
        currentUser={SESSION}
        projectMembers={PROJECT_MEMBERS}
      />,
    )
    const wrapper = screen.getByTestId('card-comment-c-1')
    // Agent-completed: persona left-border but no streaming role.
    expect(wrapper).not.toHaveAttribute('role', 'status')
    expect(wrapper.querySelector('.border-primary')).toBeTruthy()
    expect(screen.queryByLabelText(/streaming response/i)).toBeNull()
  })

  it('renders the agent-streaming variant with role=status + audio-wave indicator (D18)', () => {
    render(
      <CardCommentItem
        comment={makeComment({
          authorName: 'Sara',
          authorUserId: 'agent-user',
          bodyText: 'partial...',
          isStreaming: true,
          agentRunContext: {
            runId: 'run-1',
            personaId: 'persona-1',
            personaName: 'Sara',
            personaAccentColor: 'orange',
            status: 'running',
            toolCalls: [],
          },
        })}
        currentUser={SESSION}
        projectMembers={PROJECT_MEMBERS}
      />,
    )
    const wrapper = screen.getByTestId('card-comment-c-1')
    expect(wrapper).toHaveAttribute('role', 'status')
    expect(wrapper).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByLabelText(/streaming response/i)).toBeInTheDocument()
    // Streaming bubble should carry the primary-soft tint class.
    expect(wrapper.querySelector('.bg-primary-soft\\/50')).toBeTruthy()
  })
})
