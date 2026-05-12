/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ToastProvider} from '../../../components/ui/toast'
import type {AssignablePersona} from '../agent.types'
import type {WorkspaceSummary} from '../../projects/project-shell.types'
import {NewTaskDialog} from './NewTaskDialog'

const personas: AssignablePersona[] = [
  {
    accentColor: 'blue',
    agentUserId: 'bot-sara',
    avatarUrl: null,
    id: 'persona-sara',
    name: 'Sara',
    role: 'assistant',
    slug: 'sara',
  },
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

type RenderOverrides = Partial<{
  isSubmitting: boolean
  onClose: ReturnType<typeof vi.fn>
  onNavigateToProfiles: ReturnType<typeof vi.fn>
  onRetryPersonas: ReturnType<typeof vi.fn>
  onSubmit: ReturnType<typeof vi.fn>
  personas: AssignablePersona[]
  personasIsError: boolean
  personasLoading: boolean
  workspaceSummaries: WorkspaceSummary[]
}>

function renderDialog(overrides: RenderOverrides = {}) {
  const props = {
    isSubmitting: false,
    onClose: overrides.onClose ?? vi.fn(),
    onNavigateToProfiles: overrides.onNavigateToProfiles ?? vi.fn(),
    onRetryPersonas: overrides.onRetryPersonas ?? vi.fn(),
    onSubmit: overrides.onSubmit ?? vi.fn(),
    personas: overrides.personas ?? personas,
    personasIsError: overrides.personasIsError ?? false,
    personasLoading: overrides.personasLoading ?? false,
    workspaceSummaries: overrides.workspaceSummaries,
    ...overrides,
  }
  render(
    <ToastProvider>
      <NewTaskDialog isOpen {...props}/>
    </ToastProvider>,
  )
  return props
}

afterEach(() => {
  cleanup()
})

describe('NewTaskDialog', () => {
  it('blocks submit when title is missing', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-blank'))
    await user.click(screen.getByRole('button', {name: /create & dispatch/i}))

    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks submit when no persona is selected', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-blank'))
    await user.type(screen.getByLabelText('Title'), 'Find feature flags to clean up')
    await user.click(screen.getByRole('button', {name: /create & dispatch/i}))

    expect(screen.getByText('Choose an agent to assign the task to.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a one-off task by default', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-blank'))
    await user.type(screen.getByLabelText('Title'), 'Triage the inbox')
    await user.type(screen.getByLabelText('Description'), 'Look at the latest 20 customer emails.')
    await user.click(screen.getByTestId('persona-picker-trigger'))
    await user.click(screen.getByTestId('persona-picker-option-sara'))
    await user.click(screen.getByRole('button', {name: /create & dispatch/i}))

    expect(onSubmit).toHaveBeenCalledWith({
      assignToPersonaId: 'persona-sara',
      bodyMd: 'Look at the latest 20 customer emails.',
      cardTemplateExtras: {},
      repeat: {kind: 'one_off'},
      timezone: 'UTC',
      title: 'Triage the inbox',
    })
  })

  it('submits a daily recurring task with the daily preset', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-blank'))
    await user.type(screen.getByLabelText('Title'), 'Daily ops summary')
    await user.click(screen.getByTestId('persona-picker-trigger'))
    await user.click(screen.getByTestId('persona-picker-option-andy'))
    await user.click(screen.getByLabelText('Every day at 09:00'))
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        assignToPersonaId: 'persona-andy',
        repeat: {kind: 'daily'},
        title: 'Daily ops summary',
      }),
    )
  })

  it('blocks submit when advanced cron is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-blank'))
    await user.type(screen.getByLabelText('Title'), 'Custom cron task')
    await user.click(screen.getByTestId('persona-picker-trigger'))
    await user.click(screen.getByTestId('persona-picker-option-sara'))
    await user.click(screen.getByLabelText('Advanced cron'))
    const cronInput = screen.getByLabelText('Cron expression')
    await user.clear(cronInput)
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(screen.getByText('Enter a cron expression (5 fields).')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Phase 3c — empty-state panel + a11y plumbing
  // ---------------------------------------------------------------------------

  it('renders the empty-state panel when personas list is empty and not loading', () => {
    renderDialog({personas: [], personasLoading: false})

    expect(screen.getByTestId('new-task-empty-state')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {name: 'No agents are dispatchable yet'}),
    ).toBeInTheDocument()
    expect(screen.getByText(/Open AI Agent Profiles to set up your AI team/i)).toBeInTheDocument()
  })

  it('hides the empty-state panel while personas are loading', () => {
    renderDialog({personas: [], personasLoading: true})

    expect(screen.queryByTestId('new-task-empty-state')).not.toBeInTheDocument()
  })

  it('renders the empty-state panel + Retry when personas query is errored', () => {
    renderDialog({personas: [], personasIsError: true, personasLoading: false})

    expect(screen.getByTestId('new-task-empty-state')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Retry'})).toBeInTheDocument()
  })

  it('hides the empty-state panel when personas are populated', () => {
    renderDialog({personas, personasLoading: false})

    expect(screen.queryByTestId('new-task-empty-state')).not.toBeInTheDocument()
  })

  it('Open AI Agent Profiles → calls onNavigateToProfiles and onClose', async () => {
    const onNavigateToProfiles = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderDialog({onClose, onNavigateToProfiles, personas: [], personasLoading: false})

    await user.click(screen.getByRole('button', {name: /Open AI Agent Profiles/i}))

    expect(onNavigateToProfiles).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Retry calls onRetryPersonas without closing the dialog', async () => {
    const onRetryPersonas = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    renderDialog({
      onClose,
      onRetryPersonas,
      personas: [],
      personasIsError: true,
      personasLoading: false,
    })

    await user.click(screen.getByRole('button', {name: 'Retry'}))

    expect(onRetryPersonas).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hides submit when picker is empty (empty-state replaces step 1)', () => {
    renderDialog({personas: [], personasLoading: false})

    expect(
      screen.queryByRole('button', {name: /create & dispatch/i}),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('job-picker')).not.toBeInTheDocument()
    expect(screen.getByTestId('new-task-empty-state')).toBeInTheDocument()
  })

  it('hides submit when picker is in error state (empty-state replaces step 1)', () => {
    renderDialog({personas: [], personasIsError: true, personasLoading: false})

    expect(
      screen.queryByRole('button', {name: /create & dispatch/i}),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('new-task-empty-state')).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Phase 5 — template picker integration (D5-1, D5-3, D5-19)
  // ---------------------------------------------------------------------------

  it('selecting Daily Crash Log Triage auto-fills title, description, persona, repeat', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByTestId('job-picker-daily-crash-log-triage'))

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toContain('Daily Crash Log Triage')
    const bodyInput = screen.getByLabelText('Description') as HTMLTextAreaElement
    expect(bodyInput.value).toContain('crash_log_source_url')
    // PersonaPicker trigger displays the selected persona's name.
    expect(screen.getByTestId('persona-picker-trigger')).toHaveTextContent('Sara')
    expect((screen.getByTestId('repeat-cron') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('job-config-crash_log_source_url')).toBeInTheDocument()
    expect(screen.getByTestId('job-config-top_n')).toBeInTheDocument()
  })

  it('switching templates re-fills fields with the new template defaults', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByTestId('job-picker-daily-crash-log-triage'))
    await user.click(screen.getByTestId('back-to-picker'))
    await user.click(screen.getByTestId('job-picker-customer-feedback-to-cards'))

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toContain('Customer Feedback Roundup')
    expect(screen.getByTestId('persona-picker-trigger')).toHaveTextContent('Andy')
    expect(
      screen.getByTestId('job-config-feedback_source_url'),
    ).toBeInTheDocument()
    // Crash-log template input should no longer render after switch.
    expect(
      screen.queryByTestId('job-config-crash_log_source_url'),
    ).not.toBeInTheDocument()
  })

  it('switching back to Blank task does not clear typed title/description (D5-3)', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByTestId('job-picker-daily-crash-log-triage'))
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toContain('Daily Crash Log Triage')

    await user.click(screen.getByTestId('back-to-picker'))
    await user.click(screen.getByTestId('job-picker-blank'))

    // Typed title persists; only template config inputs disappear.
    expect(titleInput.value).toContain('Daily Crash Log Triage')
    expect(
      screen.queryByTestId('job-config-crash_log_source_url'),
    ).not.toBeInTheDocument()
  })

  it('submits template-derived data with __source_template_slug and resolved placeholders', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-daily-crash-log-triage'))
    await user.type(
      screen.getByTestId('job-config-crash_log_source_url'),
      'https://crash.example.com/yesterday.json',
    )
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]?.[0]
    expect(payload.cardTemplateExtras.__source_template_slug).toBe('daily-crash-log-triage')
    expect(payload.cardTemplateExtras.crash_log_source_url).toBe(
      'https://crash.example.com/yesterday.json',
    )
    expect(payload.cardTemplateExtras.top_n).toBe(3)
    // Title placeholder was resolved (no literal ${...} left except for date which
    // is server-resolved at clone time).
    expect(payload.title).not.toContain('${crash_log_source_url}')
  })

  it('Triage New Bugs disables the recurring radios with the v1 tooltip copy', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByTestId('job-picker-triage-new-bugs'))

    const dailyRadio = screen.getByTestId('repeat-daily') as HTMLInputElement
    const weeklyRadio = screen.getByTestId('repeat-weekly') as HTMLInputElement
    const cronRadio = screen.getByTestId('repeat-cron') as HTMLInputElement
    expect(dailyRadio).toBeDisabled()
    expect(weeklyRadio).toBeDisabled()
    expect(cronRadio).toBeDisabled()
    // Submit shows "Create & dispatch" — one-off radio still active.
    expect(
      screen.getByRole('button', {name: /create & dispatch/i}),
    ).toBeInTheDocument()
  })

  it('Triage New Bugs submits as a one-off pre-fill', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-triage-new-bugs'))
    await user.click(screen.getByRole('button', {name: /create & dispatch/i}))

    const payload = onSubmit.mock.calls[0]?.[0]
    expect(payload.repeat).toEqual({kind: 'one_off'})
    expect(payload.cardTemplateExtras.__source_template_slug).toBe('triage-new-bugs')
    expect(payload.cardTemplateExtras.tags).toEqual(['bug-triage'])
  })

  it('blocks template submit when required URL field is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderDialog({onSubmit})

    await user.click(screen.getByTestId('job-picker-customer-feedback-to-cards'))
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(
      screen.getByText('Fill in feedback source url before submitting.'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Wave 3 v0.5 — Sprint Health Watcher monitor-Job branch
  // ---------------------------------------------------------------------------

  const monitorWorkspaces: WorkspaceSummary[] = [
    {
      canManageWorkspace: true,
      colorToken: 'sky',
      defaultProjectSlug: 'web',
      icon: '🚀',
      id: 'ws-1',
      name: 'Engineering',
      organizationId: 'org-1',
      organizationName: 'Lila',
      organizationSlug: 'lila',
      projects: [
        {
          access: 'open',
          builtinFieldLabels: {} as never,
          builtinOptionLabels: {} as never,
          defaultProjectViewId: 'view-1',
          icon: '📋',
          id: 'project-web',
          lastUpdatedLabel: 'just now',
          memberCount: 4,
          name: 'Web App',
          priorityOptions: [],
          projectViews: [],
          slug: 'web',
          statusOptions: [],
          taskCount: 12,
        },
      ],
      slug: 'engineering',
      timezone: 'America/Los_Angeles',
    },
  ]

  it('Sprint Manager shows Assign-to (pre-selected to Sara) + project picker, hides Repeat', async () => {
    const user = userEvent.setup()
    renderDialog({workspaceSummaries: monitorWorkspaces})

    await user.click(screen.getByTestId('job-picker-sprint-health-watcher'))

    // Persona pick is no longer locked — Assign-to renders and defaults
    // to the job's preferred persona slug (Sara).
    expect(screen.getByTestId('persona-picker-trigger')).toHaveTextContent('Sara')
    // Repeat cadence is still locked by the recipe.
    expect(screen.queryByTestId('repeat-cron')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repeat-daily')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repeat-weekly')).not.toBeInTheDocument()
    const picker = screen.getByTestId('monitor-project-picker')
    expect(picker).toBeInTheDocument()
    expect(picker).toHaveTextContent('Project to watch')
    expect(picker).toHaveTextContent('Engineering / Web App')
  })

  it('Sprint Health Watcher blocks submit until a project is picked', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderDialog({onSubmit, workspaceSummaries: monitorWorkspaces})

    await user.click(screen.getByTestId('job-picker-sprint-health-watcher'))
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(
      screen.getByText('Pick a project to watch before submitting.'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Sprint Manager submits with targetProjectId + workspace timezone (NOT Personal AI Workspace, NOT UTC)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    renderDialog({onSubmit, workspaceSummaries: monitorWorkspaces})

    await user.click(screen.getByTestId('job-picker-sprint-health-watcher'))
    const picker = screen.getByTestId('monitor-project-picker')
    const select = picker.querySelector('select') as HTMLSelectElement
    await user.selectOptions(select, 'project-web')
    await user.click(screen.getByRole('button', {name: /create schedule/i}))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]?.[0]
    expect(payload.targetProjectId).toBe('project-web')
    expect(payload.assignToPersonaId).toBe('persona-sara')
    // Daily 09:00 normalizes to the 'daily' preset, not 'cron'.
    expect(payload.repeat).toEqual({kind: 'daily'})
    // Schedule timezone reads from the target project's workspace, not UTC.
    expect(payload.timezone).toBe('America/Los_Angeles')
    expect(payload.cardTemplateExtras.__source_template_slug).toBe('sprint-health-watcher')
    // Project id is on `targetProjectId`, not stamped onto card_template.
    expect(payload.cardTemplateExtras.project_id).toBeUndefined()
  })
})
