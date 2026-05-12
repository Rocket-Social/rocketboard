/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

const {searchState, navigateMock} = vi.hoisted(() => ({
  searchState: {current: {} as {tab?: string}},
  navigateMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchState.current,
}))

vi.mock('../shell/SignedInAppFrame', () => ({
  useSignedInAppFrame: () => ({
    currentWorkspace: {organizationId: 'org-1', slug: 'ws', organizationSlug: 'lila'},
    workspaces: [{organizationId: 'org-1'}],
  }),
}))

vi.mock('./components/OrgBudgetMeter', () => ({
  OrgBudgetMeter: () => <div data-testid='org-budget-meter'/>,
}))

vi.mock('./components/OrgQuotaMeter', () => ({
  OrgQuotaMeter: () => <div data-testid='org-quota-meter'/>,
}))

vi.mock('./components/AgentProfilesTab', () => ({
  AgentProfilesTab: () => <div data-testid='agent-profiles-tab'/>,
}))

vi.mock('./components/MyAiKanbanTab', () => ({
  MyAiKanbanTab: ({
    onNavigateToProfiles,
    onNavigateToTemplates,
  }: {
    onNavigateToProfiles: () => void
    onNavigateToTemplates: () => void
  }) => (
    <div data-testid='my-ai-kanban-tab'>
      <button onClick={onNavigateToProfiles} type='button'>Open AI Agent Profiles →</button>
      <button onClick={onNavigateToTemplates} type='button'>Browse jobs →</button>
    </div>
  ),
}))

vi.mock('./components/TemplatesAndSchedulesTab', () => ({
  JobsAndSchedulesTab: () => <div data-testid='jobs-and-schedules-tab'/>,
}))

import {AiAgentsPage} from './AiAgentsPage'

afterEach(() => {
  cleanup()
  searchState.current = {}
  navigateMock.mockReset()
})

describe('AiAgentsPage', () => {
  it('renders the page header and all three tab triggers', () => {
    render(<AiAgentsPage/>)

    expect(screen.getByRole('heading', {name: 'AI Agents'})).toBeInTheDocument()
    expect(screen.getByRole('tab', {name: 'My AI Kanban'})).toBeInTheDocument()
    expect(screen.getByRole('tab', {name: 'AI Agent Profiles'})).toBeInTheDocument()
    expect(screen.getByRole('tab', {name: 'Jobs & Schedules'})).toBeInTheDocument()
  })

  it('defaults to the My AI Kanban tab', () => {
    render(<AiAgentsPage/>)

    expect(screen.getByTestId('my-ai-kanban-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-profiles-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('jobs-and-schedules-tab')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', {name: 'My AI Kanban'})).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('switches to the AI Agent Profiles tab when clicked', async () => {
    const user = userEvent.setup()

    render(<AiAgentsPage/>)

    await user.click(screen.getByRole('tab', {name: 'AI Agent Profiles'}))

    expect(screen.getByTestId('agent-profiles-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('my-ai-kanban-tab')).not.toBeInTheDocument()
  })

  it('switches to the Jobs & Schedules tab when clicked', async () => {
    const user = userEvent.setup()

    render(<AiAgentsPage/>)

    await user.click(screen.getByRole('tab', {name: 'Jobs & Schedules'}))

    expect(screen.getByTestId('jobs-and-schedules-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('my-ai-kanban-tab')).not.toBeInTheDocument()
  })

  it('Browse jobs link from My AI Kanban switches to the Jobs tab', async () => {
    const user = userEvent.setup()

    render(<AiAgentsPage/>)

    await user.click(screen.getByRole('button', {name: /browse jobs/i}))

    expect(screen.getByTestId('jobs-and-schedules-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('my-ai-kanban-tab')).not.toBeInTheDocument()
  })
})
