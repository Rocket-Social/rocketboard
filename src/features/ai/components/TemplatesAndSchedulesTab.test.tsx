/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import type {AgentSchedule, AssignablePersona} from '../agent.types'

const navigateMock = vi.fn()
const toastMock = vi.fn()
const pauseMutateMock = vi.fn()
const resumeMutateMock = vi.fn()
const deleteMutateMock = vi.fn()
const updateMutateMock = vi.fn()
const refetchSchedulesMock = vi.fn()
const refetchPersonasMock = vi.fn()

const {state} = vi.hoisted(() => ({
  state: {
    isError: false,
    isPending: false,
    personas: [] as AssignablePersona[],
    schedules: [] as AgentSchedule[],
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
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
  ToastProvider: ({children}: {children: React.ReactNode}) => <>{children}</>,
  useToast: () => ({toast: toastMock}),
}))

vi.mock('../ai.queries', () => ({
  useAssignablePersonasQuery: () => ({
    data: state.personas,
    isError: false,
    isPending: false,
    refetch: refetchPersonasMock,
  }),
  useFetchUrlAllowlistQuery: () => ({data: [], isPending: false}),
}))

vi.mock('../../projects/project-shell.queries', () => ({
  useWorkspaceSummariesQuery: () => ({data: [], isPending: false}),
}))

vi.mock('../agent-schedule.queries', () => ({
  useAgentSchedulesQuery: () => ({
    data: state.schedules,
    isError: state.isError,
    isPending: state.isPending,
    refetch: refetchSchedulesMock,
  }),
  useDeleteAgentScheduleMutation: () => ({
    isPending: false,
    mutate: deleteMutateMock,
  }),
  usePauseAgentScheduleMutation: () => ({
    isPending: false,
    mutate: pauseMutateMock,
  }),
  useResumeAgentScheduleMutation: () => ({
    isPending: false,
    mutate: resumeMutateMock,
  }),
  useUpdateAgentScheduleMutation: () => ({
    isPending: false,
    mutate: updateMutateMock,
  }),
}))

import {JobsAndSchedulesTab} from './TemplatesAndSchedulesTab'

const persona: AssignablePersona = {
  accentColor: 'blue',
  agentUserId: 'bot-sara',
  avatarUrl: null,
  id: 'persona-sara',
  name: 'Sara',
  role: 'assistant',
  slug: 'sara',
}

function buildSchedule(overrides: Partial<AgentSchedule> = {}): AgentSchedule {
  return {
    cardTemplate: {
      __source_template_slug: 'daily-crash-log-triage',
      bodyMd: 'Read the crash log',
      title: 'Daily Crash Log Triage',
    },
    createdAt: '2026-05-01T00:00:00Z',
    createdByUserId: 'user-1',
    cronExpression: '0 10 * * 1-5',
    id: 'schedule-1',
    isPaused: false,
    lastRunAt: null,
    nextRunAt: '2026-05-07T10:00:00Z',
    organizationId: 'org-1',
    personaId: 'persona-sara',
    targetProjectId: 'project-1',
    timezone: 'UTC',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  navigateMock.mockReset()
  toastMock.mockReset()
  pauseMutateMock.mockReset()
  resumeMutateMock.mockReset()
  deleteMutateMock.mockReset()
  updateMutateMock.mockReset()
  refetchSchedulesMock.mockReset()
  refetchPersonasMock.mockReset()
  state.schedules = []
  state.personas = []
  state.isError = false
  state.isPending = false
})

describe('JobsAndSchedulesTab', () => {
  it('hides the Active schedules section when there are no schedules (D5-14)', () => {
    state.schedules = []
    render(<JobsAndSchedulesTab/>)
    expect(screen.queryByTestId('active-schedules-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('jobs-section')).toBeInTheDocument()
  })

  it('renders both sections when at least one schedule exists', () => {
    state.schedules = [buildSchedule()]
    state.personas = [persona]
    render(<JobsAndSchedulesTab/>)
    expect(screen.getByTestId('active-schedules-section')).toBeInTheDocument()
    expect(screen.getByTestId('jobs-section')).toBeInTheDocument()
  })

  it('renders the loading skeleton while schedules are pending', () => {
    state.isPending = true
    render(<JobsAndSchedulesTab/>)
    expect(screen.getByTestId('active-schedules-loading')).toBeInTheDocument()
  })

  it('renders the error panel + Retry on schedules query error', () => {
    state.isError = true
    render(<JobsAndSchedulesTab/>)
    expect(screen.getByTestId('active-schedules-error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetchSchedulesMock).toHaveBeenCalledTimes(1)
  })

  it('Use this job navigates to /ai-agents?tab=kanban&job=<slug>', () => {
    render(<JobsAndSchedulesTab/>)
    fireEvent.click(screen.getByTestId('job-card-daily-crash-log-triage-use'))
    expect(navigateMock).toHaveBeenCalled()
    const callArgs = navigateMock.mock.calls[0]?.[0]
    expect(callArgs.to).toBe('/ai-agents')
    expect(callArgs.search()).toEqual({job: 'daily-crash-log-triage', tab: 'kanban'})
  })

  it('Pause click calls the pause mutation', () => {
    state.schedules = [buildSchedule()]
    state.personas = [persona]
    render(<JobsAndSchedulesTab/>)
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-pause'))
    expect(pauseMutateMock).toHaveBeenCalledWith('schedule-1', expect.any(Object))
  })

  it('Resume click on a paused schedule calls the resume mutation', () => {
    state.schedules = [buildSchedule({isPaused: true})]
    state.personas = [persona]
    render(<JobsAndSchedulesTab/>)
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-resume'))
    expect(resumeMutateMock).toHaveBeenCalledWith('schedule-1', expect.any(Object))
  })

  it('Confirmed Delete fires the delete mutation', () => {
    state.schedules = [buildSchedule()]
    state.personas = [persona]
    render(<JobsAndSchedulesTab/>)
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-delete'))
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-confirm-delete'))
    expect(deleteMutateMock).toHaveBeenCalledWith('schedule-1', expect.any(Object))
  })

  it('Edit on a schedule opens the edit dialog', () => {
    state.schedules = [buildSchedule()]
    state.personas = [persona]
    render(<JobsAndSchedulesTab/>)
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-edit'))
    expect(screen.getByText(/Edit Daily Crash Log Triage/i)).toBeInTheDocument()
  })
})
