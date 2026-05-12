/** @vitest-environment jsdom */
//
// Phase 4 PR 4-C — Mobile FAB tests for MyAiKanbanTab.
//
// The FAB is the only +New task affordance below the `sm` breakpoint
// (640px). It mirrors the desktop pill button in success cases but
// surfaces a guidance toast on the disabled path because there's no
// inline help text floating above the canvas.

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {AssignablePersona} from '../agent.types'

const oneOffMutateMock = vi.fn()
const recurringMutateMock = vi.fn()
const toastMock = vi.fn()
const refetchPersonasMock = vi.fn()

const {state} = vi.hoisted(() => ({
  state: {
    personas: [] as AssignablePersona[],
    personasError: null as unknown,
    personasIsError: false,
    personasIsPending: false,
    workspaceProjectId: 'project-personal-1' as string | null,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
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
  useWorkspaceSummariesQuery: () => ({data: [], isPending: false}),
}))

vi.mock('../ai.queries', () => ({
  useAgentRunsForUserQuery: () => ({data: [], isPending: false}),
  useAssignablePersonasQuery: () => ({
    data: state.personas,
    error: state.personasError,
    isError: state.personasIsError,
    isPending: state.personasIsPending,
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
  usePersonalAiWorkspaceQuery: () => ({data: state.workspaceProjectId, isPending: false}),
}))

vi.mock('../agent.realtime', () => ({
  useAgentRunsRealtime: () => undefined,
}))

vi.mock('../agent-schedule.queries', () => ({
  useAgentSchedulesQuery: () => ({data: [], isPending: false}),
  useUpdateAgentScheduleMutation: () => ({isPending: false, mutate: vi.fn()}),
}))

import {MyAiKanbanTab} from './MyAiKanbanTab'

afterEach(() => {
  cleanup()
  oneOffMutateMock.mockReset()
  recurringMutateMock.mockReset()
  toastMock.mockReset()
  refetchPersonasMock.mockReset()
  state.personas = []
  state.personasError = null
  state.personasIsError = false
  state.personasIsPending = false
  state.workspaceProjectId = 'project-personal-1'
})

function renderTab() {
  return render(
    <MyAiKanbanTab onNavigateToProfiles={vi.fn()} onNavigateToTemplates={vi.fn()}/>,
  )
}

describe('MyAiKanbanTab mobile FAB', () => {
  it('renders the FAB with the sm:hidden + fixed bottom-right classes', () => {
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

    const fab = screen.getByTestId('mobile-fab-new-task')
    expect(fab).toBeInTheDocument()
    expect(fab).toHaveClass('sm:hidden')
    expect(fab).toHaveClass('fixed')
    expect(fab).toHaveClass('bottom-6')
    expect(fab).toHaveClass('right-6')
    expect(fab).toHaveAttribute('aria-label', 'Create new task')
  })

  it('hides the desktop "New task" button container below sm', () => {
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

    const desktopButton = screen.getByRole('button', {name: 'New task'})
    expect(desktopButton.parentElement).toHaveClass('hidden')
    expect(desktopButton.parentElement).toHaveClass('sm:flex')
  })

  it('FAB tap opens the New Task dialog when agents are available', async () => {
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

    await user.click(screen.getByTestId('mobile-fab-new-task'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('FAB tap fires the no-agents toast when no agents are configured', async () => {
    state.personas = []
    const user = userEvent.setup()

    renderTab()

    await user.click(screen.getByTestId('mobile-fab-new-task'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No AI agents available',
        variant: 'info',
      }),
    )
  })

  it('FAB tap fires the no-agents toast when the personas query is in error', async () => {
    state.personas = []
    state.personasIsError = true
    state.personasError = new Error('boom')
    const user = userEvent.setup()

    renderTab()

    // The personas-load error toast also fires on mount; clear it so
    // we can isolate the FAB-tap toast assertion below.
    toastMock.mockClear()

    await user.click(screen.getByTestId('mobile-fab-new-task'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'No AI agents available',
      }),
    )
  })
})
