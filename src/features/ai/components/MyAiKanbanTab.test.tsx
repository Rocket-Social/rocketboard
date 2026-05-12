/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {AgentRunWithContext, AssignablePersona} from '../agent.types'

const personalAiWorkspaceQuerySpy = vi.fn()
const oneOffMutateMock = vi.fn()
const recurringMutateMock = vi.fn()
const realtimeSubscribeSpy = vi.fn()
const navigateMock = vi.fn()
const toastMock = vi.fn()
const refetchPersonasMock = vi.fn()

const {state} = vi.hoisted(() => ({
  state: {
    isPending: false,
    personas: [] as AssignablePersona[],
    personasError: null as unknown,
    personasIsError: false,
    runs: [] as AgentRunWithContext[],
    search: {} as Record<string, unknown>,
    workspaceProjectId: 'project-personal-1' as string | null,
    workspaceSummaries: [
      {
        organizationSlug: 'rocketboard-inc',
        slug: 'rocketboard',
        projects: [{id: 'project-1', slug: 'live-ops'}],
      },
    ] as Array<{
      organizationSlug: string
      slug: string
      projects: Array<{id: string; slug: string}>
    }>,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => state.search,
}))

vi.mock('../../shell/SignedInAppFrame', () => ({
  useSignedInAppFrame: () => ({
    currentUser: {id: 'user-1', name: 'Test User'},
    currentWorkspace: {
      id: 'workspace-1',
      name: 'Rocketboard',
      organizationId: 'org-1',
      organizationName: 'Rocketboard Inc.',
      organizationSlug: 'rocketboard-inc',
      slug: 'rocketboard',
    },
    workspaces: [],
  }),
}))

vi.mock('../../../components/ui/toast', () => ({
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../../projects/project-shell.queries', () => ({
  useWorkspaceSummariesQuery: () => ({data: state.workspaceSummaries, isPending: false}),
}))

vi.mock('../ai.queries', () => ({
  useAgentRunsForUserQuery: () => ({data: state.runs, isPending: state.isPending}),
  useAssignablePersonasQuery: () => ({
    data: state.personas,
    error: state.personasError,
    isError: state.personasIsError,
    isPending: false,
    refetch: refetchPersonasMock,
  }),
  useCreateOneOffPersonalTaskMutation: () => ({
    isPending: false,
    mutate: oneOffMutateMock,
  }),
  useCreateRecurringPersonalTaskMutation: () => ({
    isPending: false,
    mutate: recurringMutateMock,
  }),
  useFetchUrlAllowlistQuery: () => ({data: [], isPending: false}),
  usePersonalAiWorkspaceQuery: (input: unknown) => {
    personalAiWorkspaceQuerySpy(input)
    return {data: state.workspaceProjectId, isPending: false}
  },
}))

vi.mock('../agent.realtime', () => ({
  useAgentRunsRealtime: (input: unknown) => {
    realtimeSubscribeSpy(input)
  },
}))

vi.mock('../agent-schedule.queries', () => ({
  useAgentSchedulesQuery: () => ({data: [], isPending: false}),
  useUpdateAgentScheduleMutation: () => ({isPending: false, mutate: vi.fn()}),
}))

import {MyAiKanbanTab} from './MyAiKanbanTab'

afterEach(() => {
  cleanup()
  personalAiWorkspaceQuerySpy.mockReset()
  oneOffMutateMock.mockReset()
  recurringMutateMock.mockReset()
  realtimeSubscribeSpy.mockReset()
  navigateMock.mockReset()
  toastMock.mockReset()
  refetchPersonasMock.mockReset()
  state.runs = []
  state.personas = []
  state.personasError = null
  state.personasIsError = false
  state.workspaceProjectId = 'project-personal-1'
  state.isPending = false
  state.search = {}
})

function renderTab(overrides: Partial<{
  onNavigateToProfiles: () => void
  onNavigateToTemplates: () => void
}> = {}) {
  const onNavigateToProfiles = overrides.onNavigateToProfiles ?? vi.fn()
  const onNavigateToTemplates = overrides.onNavigateToTemplates ?? vi.fn()
  return {
    onNavigateToProfiles,
    onNavigateToTemplates,
    ...render(
      <MyAiKanbanTab
        onNavigateToProfiles={onNavigateToProfiles}
        onNavigateToTemplates={onNavigateToTemplates}
      />,
    ),
  }
}

describe('MyAiKanbanTab', () => {
  it('fires the personal AI workspace provisioning hook with the current user + org', () => {
    renderTab()

    expect(personalAiWorkspaceQuerySpy).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
    })
  })

  it('subscribes to realtime updates scoped to the (user, org) pair', () => {
    renderTab()

    expect(realtimeSubscribeSpy).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
    })
  })

  it('renders the empty welcome panel when there are no runs', () => {
    renderTab()

    expect(screen.getByRole('heading', {name: 'Nothing in flight'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Create your first task'})).toBeInTheDocument()
    expect(screen.queryByTestId('my-ai-kanban-grid')).not.toBeInTheDocument()
  })

  it('renders the status grid when runs are present', () => {
    state.runs = [
      {
        card: {id: 'card-1', title: 'Triage the inbox'},
        cardId: 'card-1',
        conversationId: null,
        createdAt: '2026-05-05T00:00:00.000Z',
        createdByUserId: 'user-1',
        dispatchReason: 'manual',
        errorText: null,
        finishedAt: null,
        id: 'run-1',
        organizationId: 'org-1',
        persona: {
          accentColor: 'blue',
          agentUserId: 'bot-1',
          avatarUrl: null,
          id: 'persona-sara',
          name: 'Sara',
          role: 'assistant',
          slug: 'sara',
        },
        personaId: 'persona-sara',
        previousRunId: null,
        project: {
          id: 'project-1',
          kind: 'standard',
          name: 'Live-Ops',
          slug: 'live-ops',
        },
        projectId: 'project-1',
        prompt: null,
        resultCommentId: null,
        startedAt: null,
        status: 'queued',
        tokenCostUsd: null,
        toolCalls: [],
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]

    renderTab()

    expect(screen.getByTestId('my-ai-kanban-grid')).toBeInTheDocument()
    expect(screen.getByText('Triage the inbox')).toBeInTheDocument()
  })

  it('opens the New Task dialog from the header button', async () => {
    state.personas = [
      {
        accentColor: 'blue',
        agentUserId: 'bot-1',
        avatarUrl: null,
        id: 'persona-sara',
        name: 'Sara',
        role: 'assistant',
        slug: 'sara',
      },
    ]
    const user = userEvent.setup()

    renderTab()

    await user.click(screen.getByRole('button', {name: 'New task'}))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Two-step flow: first step is the JobPicker. Form fields render
    // after a job (or Blank task) is picked.
    expect(screen.getByTestId('job-picker')).toBeInTheDocument()
    await user.click(screen.getByTestId('job-picker-blank'))
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })

  it('dispatches a one-off mutation when the form submits', async () => {
    state.personas = [
      {
        accentColor: 'blue',
        agentUserId: 'bot-sara',
        avatarUrl: null,
        id: 'persona-sara',
        name: 'Sara',
        role: 'assistant',
        slug: 'sara',
      },
    ]
    const user = userEvent.setup()

    renderTab()

    await user.click(screen.getByRole('button', {name: 'New task'}))
    await user.click(screen.getByTestId('job-picker-blank'))
    await user.type(screen.getByLabelText('Title'), 'Triage inbox')
    await user.click(screen.getByTestId('persona-picker-trigger'))
    await user.click(screen.getByTestId('persona-picker-option-sara'))
    await user.click(screen.getByRole('button', {name: /create & dispatch/i}))

    expect(oneOffMutateMock).toHaveBeenCalledWith(
      {
        agentUserId: 'bot-sara',
        bodyMd: '',
        cardTemplateExtras: {},
        title: 'Triage inbox',
        workspaceProjectId: 'project-personal-1',
      },
      expect.any(Object),
    )
    expect(recurringMutateMock).not.toHaveBeenCalled()
  })

  it('dispatches a recurring mutation when a preset is chosen', async () => {
    state.personas = [
      {
        accentColor: 'green',
        agentUserId: 'bot-andy',
        avatarUrl: null,
        id: 'persona-andy',
        name: 'Andy',
        role: 'monitor',
        slug: 'andy',
      },
    ]
    const user = userEvent.setup()

    renderTab()

    await user.click(screen.getByRole('button', {name: 'New task'}))
    await user.click(screen.getByTestId('job-picker-blank'))
    await user.type(screen.getByLabelText('Title'), 'Daily summary')
    await user.click(screen.getByTestId('persona-picker-trigger'))
    await user.click(screen.getByTestId('persona-picker-option-andy'))
    await user.click(screen.getByLabelText('Every day at 09:00'))
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(recurringMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentUserId: 'bot-andy',
        cronExpression: '0 9 * * *',
        fireOnce: true,
        organizationId: 'org-1',
        personaId: 'persona-andy',
        timezone: 'UTC',
        title: 'Daily summary',
        userId: 'user-1',
        workspaceProjectId: 'project-personal-1',
      }),
      expect.any(Object),
    )
    expect(oneOffMutateMock).not.toHaveBeenCalled()
  })

  it('navigates to the project board when a project chip is clicked', async () => {
    state.runs = [
      {
        card: null,
        cardId: 'card-1',
        conversationId: null,
        createdAt: '2026-05-05T00:00:00.000Z',
        createdByUserId: 'user-1',
        dispatchReason: 'manual',
        errorText: null,
        finishedAt: null,
        id: 'run-1',
        organizationId: 'org-1',
        persona: {
          accentColor: 'blue',
          agentUserId: 'bot-1',
          avatarUrl: null,
          id: 'persona-sara',
          name: 'Sara',
          role: 'assistant',
          slug: 'sara',
        },
        personaId: 'persona-sara',
        previousRunId: null,
        project: {
          id: 'project-1',
          kind: 'standard',
          name: 'Live-Ops',
          slug: 'live-ops',
        },
        projectId: 'project-1',
        prompt: 'Triage the inbox',
        resultCommentId: null,
        startedAt: null,
        status: 'queued',
        tokenCostUsd: null,
        toolCalls: [],
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]
    const user = userEvent.setup()

    renderTab()

    await user.click(screen.getByRole('button', {name: 'Live-Ops'}))

    expect(navigateMock).toHaveBeenCalledWith({
      href: '/org/rocketboard-inc/workspaces/rocketboard/projects/live-ops/board',
    })
  })

  it('invokes onNavigateToTemplates when the templates link is clicked', async () => {
    const user = userEvent.setup()
    const onNavigateToTemplates = vi.fn()

    renderTab({onNavigateToTemplates})

    await user.click(screen.getByRole('button', {name: /browse jobs/i}))

    expect(onNavigateToTemplates).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // Phase 3c — gate +New task + inline help-text + toast plumbing
  // ---------------------------------------------------------------------------

  it('disables both +New task buttons when there are no assignable personas', () => {
    state.personas = []

    renderTab()

    const headerButton = screen.getByRole('button', {name: 'New task'})
    const welcomeButton = screen.getByRole('button', {name: 'Create your first task'})
    expect(headerButton).toBeDisabled()
    expect(welcomeButton).toBeDisabled()
  })

  it('renders the inline AI Agent Profiles link below each gated button and routes the click', async () => {
    state.personas = []
    const onNavigateToProfiles = vi.fn()
    const user = userEvent.setup()

    renderTab({onNavigateToProfiles})

    const links = screen.getAllByRole('button', {name: 'AI Agent Profiles'})
    // One under the header button, one under the welcome-panel button.
    expect(links.length).toBe(2)

    await user.click(links[0]!)
    expect(onNavigateToProfiles).toHaveBeenCalledTimes(1)

    await user.click(links[1]!)
    expect(onNavigateToProfiles).toHaveBeenCalledTimes(2)
  })

  it('hides the help text when personas are populated', () => {
    state.personas = [
      {
        accentColor: 'blue',
        agentUserId: 'bot-1',
        avatarUrl: null,
        id: 'persona-sara',
        name: 'Sara',
        role: 'assistant',
        slug: 'sara',
      },
    ]

    renderTab()

    expect(
      screen.queryByRole('button', {name: 'AI Agent Profiles'}),
    ).not.toBeInTheDocument()
  })

  it('fires the personas-error toast exactly once on the false→true transition', () => {
    state.personasIsError = true
    state.personasError = new Error('rls denied')

    const {rerender, onNavigateToProfiles, onNavigateToTemplates} = renderTab()

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not load AI agents',
        variant: 'error',
      }),
    )

    // Re-render with the same error state — the useRef guard keeps the
    // toast from spam-firing across re-renders.
    rerender(
      <MyAiKanbanTab
        onNavigateToProfiles={onNavigateToProfiles}
        onNavigateToTemplates={onNavigateToTemplates}
      />,
    )
    expect(toastMock).toHaveBeenCalledTimes(1)

    // Flip back to success → resets the guard.
    state.personasIsError = false
    state.personasError = null
    rerender(
      <MyAiKanbanTab
        onNavigateToProfiles={onNavigateToProfiles}
        onNavigateToTemplates={onNavigateToTemplates}
      />,
    )
    expect(toastMock).toHaveBeenCalledTimes(1)

    // Flip to error again → fires once more.
    state.personasIsError = true
    state.personasError = new Error('flap')
    rerender(
      <MyAiKanbanTab
        onNavigateToProfiles={onNavigateToProfiles}
        onNavigateToTemplates={onNavigateToTemplates}
      />,
    )
    expect(toastMock).toHaveBeenCalledTimes(2)
  })

  // ---------------------------------------------------------------------------
  // Phase 5 — `?template=<slug>` deep-link (D5-5)
  // ---------------------------------------------------------------------------

  it('opens the dialog with template pre-selected when ?template=<known-slug>', async () => {
    state.personas = [
      {
        accentColor: 'blue',
        agentUserId: 'bot-sara',
        avatarUrl: null,
        id: 'persona-sara',
        name: 'Sara',
        role: 'assistant',
        slug: 'sara',
      },
    ]
    state.search = {job: 'daily-crash-log-triage'}
    const user = userEvent.setup()

    renderTab()

    // Two-step flow: deep-link jumps straight to step 'configure' with
    // the template's title/body pre-filled. The picker isn't visible
    // here — clicking Back surfaces it with the slug pre-checked.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toContain(
      'Daily Crash Log Triage',
    )
    await user.click(screen.getByTestId('back-to-picker'))
    expect(
      (screen.getByTestId('job-picker-daily-crash-log-triage') as HTMLInputElement).checked,
    ).toBe(true)
    // navigate replaceState fired to strip the param.
    expect(navigateMock).toHaveBeenCalled()
  })

  it('strips an unknown template slug without opening the dialog', () => {
    state.personas = [
      {
        accentColor: 'blue',
        agentUserId: 'bot-sara',
        avatarUrl: null,
        id: 'persona-sara',
        name: 'Sara',
        role: 'assistant',
        slug: 'sara',
      },
    ]
    state.search = {job: 'unknown-template'}

    renderTab()

    expect(screen.queryByTestId('job-picker-blank')).not.toBeInTheDocument()
    expect(navigateMock).toHaveBeenCalled()
  })
})
