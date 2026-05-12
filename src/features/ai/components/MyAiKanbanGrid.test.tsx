/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {AgentRunWithContext} from '../agent.types'
import {MyAiKanbanGrid} from './MyAiKanbanGrid'

function buildRun(overrides: Partial<AgentRunWithContext>): AgentRunWithContext {
  return {
    card: null,
    cardId: 'card-' + Math.random().toString(36).slice(2),
    conversationId: null,
    createdAt: '2026-05-05T00:00:00.000Z',
    createdByUserId: 'user-1',
    dispatchReason: 'manual',
    errorText: null,
    finishedAt: null,
    id: 'run-' + Math.random().toString(36).slice(2),
    organizationId: 'org-1',
    persona: {
      accentColor: 'blue',
      agentUserId: 'bot-1',
      avatarUrl: null,
      id: 'persona-1',
      name: 'Sara',
      role: 'assistant',
      slug: 'sara',
    },
    personaId: 'persona-1',
    previousRunId: null,
    project: {
      id: 'project-1',
      kind: 'standard',
      name: 'Live-Ops',
      slug: 'live-ops',
    },
    projectId: 'project-1',
    prompt: 'Default task prompt',
    resultCommentId: null,
    startedAt: null,
    status: 'queued',
    tokenCostUsd: null,
    toolCalls: [],
    updatedAt: '2026-05-05T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe('MyAiKanbanGrid', () => {
  it('renders all four status columns', () => {
    render(<MyAiKanbanGrid runs={[]}/>)

    expect(screen.getByLabelText('To Do')).toBeInTheDocument()
    expect(screen.getByLabelText('Working')).toBeInTheDocument()
    expect(screen.getByLabelText('Awaiting')).toBeInTheDocument()
    expect(screen.getByLabelText('Done')).toBeInTheDocument()
  })

  it('places runs into the right status bucket', () => {
    const runs: AgentRunWithContext[] = [
      buildRun({id: 'r1', status: 'queued', prompt: 'Triage bugs'}),
      buildRun({id: 'r2', status: 'running', prompt: 'Webhook research'}),
      buildRun({id: 'r3', status: 'awaiting_approval', prompt: 'Spec review'}),
      buildRun({id: 'r4', status: 'succeeded', prompt: 'Q2 KPIs'}),
      buildRun({id: 'r5', status: 'failed', prompt: 'Cancelled run'}),
    ]

    render(<MyAiKanbanGrid runs={runs}/>)

    const todo = screen.getByTestId('my-ai-kanban-column-to_do')
    const working = screen.getByTestId('my-ai-kanban-column-working')
    const awaiting = screen.getByTestId('my-ai-kanban-column-awaiting')
    const done = screen.getByTestId('my-ai-kanban-column-done')

    expect(todo).toHaveTextContent('Triage bugs')
    expect(working).toHaveTextContent('Webhook research')
    expect(awaiting).toHaveTextContent('Spec review')
    expect(done).toHaveTextContent('Q2 KPIs')
    expect(done).toHaveTextContent('Cancelled run')
  })

  it('hides project chip for personal AI workspace runs', () => {
    const runs = [
      buildRun({
        id: 'r-personal',
        prompt: 'Personal task',
        project: {
          id: 'workspace-project',
          kind: 'personal_ai_workspace',
          name: 'Joe AI Workspace',
          slug: 'joe-ai-workspace',
        },
      }),
    ]

    render(<MyAiKanbanGrid runs={runs}/>)

    expect(screen.queryByRole('button', {name: 'Joe AI Workspace'})).not.toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('invokes onProjectClick with the project id when chip clicked', async () => {
    const onProjectClick = vi.fn()
    const runs = [
      buildRun({id: 'r-standard', prompt: 'Project task'}),
    ]
    const user = userEvent.setup()

    render(<MyAiKanbanGrid onProjectClick={onProjectClick} runs={runs}/>)

    await user.click(screen.getByRole('button', {name: 'Live-Ops'}))

    expect(onProjectClick).toHaveBeenCalledWith('project-1')
  })

  // ---------------------------------------------------------------------------
  // Phase 3c — title source priority on the run card
  // ---------------------------------------------------------------------------

  it('uses card.title as the run-card title when available (wins over prompt)', () => {
    const runs = [
      buildRun({
        card: {id: 'card-1', title: 'Triage inbox'},
        id: 'r-card-title',
        prompt: 'A different prompt the user did not type',
      }),
    ]

    render(<MyAiKanbanGrid runs={runs}/>)

    expect(screen.getByText('Triage inbox')).toBeInTheDocument()
    expect(
      screen.queryByText('A different prompt the user did not type'),
    ).not.toBeInTheDocument()
  })

  it('falls back to prompt when card is null', () => {
    const runs = [
      buildRun({
        card: null,
        id: 'r-prompt-fallback',
        prompt: 'Webhook research',
      }),
    ]

    render(<MyAiKanbanGrid runs={runs}/>)

    expect(screen.getByText('Webhook research')).toBeInTheDocument()
  })

  it('falls back to "Task for {persona.name}" when both card and prompt are empty', () => {
    const runs = [
      buildRun({
        card: null,
        id: 'r-persona-fallback',
        persona: {
          accentColor: 'green',
          agentUserId: 'bot-sara',
          avatarUrl: null,
          id: 'persona-sara',
          name: 'Sara',
          role: 'assistant',
          slug: 'sara',
        },
        prompt: null,
      }),
    ]

    render(<MyAiKanbanGrid runs={runs}/>)

    expect(screen.getByText('Task for Sara')).toBeInTheDocument()
  })
})
