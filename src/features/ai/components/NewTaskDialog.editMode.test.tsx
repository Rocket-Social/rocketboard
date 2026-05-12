/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ToastProvider} from '../../../components/ui/toast'
import type {AgentSchedule, AssignablePersona} from '../agent.types'
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

function buildSchedule(overrides: Partial<AgentSchedule> = {}): AgentSchedule {
  return {
    cardTemplate: {
      __source_template_slug: 'daily-crash-log-triage',
      bodyMd: 'Read the crash log',
      crash_log_source_url: 'https://crash.example.com/log.json',
      title: 'Daily Crash Log Triage — ${date}',
      top_n: 5,
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

type RenderOverrides = {
  editingSchedule?: AgentSchedule | null
  onUpdate?: ReturnType<typeof vi.fn>
}

function renderEditDialog(overrides: RenderOverrides = {}) {
  const onUpdate = overrides.onUpdate ?? vi.fn()
  const editingSchedule = overrides.editingSchedule ?? buildSchedule()

  render(
    <ToastProvider>
      <NewTaskDialog
        editingSchedule={editingSchedule}
        isOpen
        isSubmitting={false}
        onClose={vi.fn()}
        onNavigateToProfiles={vi.fn()}
        onRetryPersonas={vi.fn()}
        onSubmit={vi.fn()}
        onUpdate={onUpdate}
        personas={personas}
        personasIsError={false}
        personasLoading={false}
      />
    </ToastProvider>,
  )

  return {editingSchedule, onUpdate}
}

afterEach(() => {
  cleanup()
})

describe('NewTaskDialog — edit mode (D5-6, D5-18)', () => {
  it('header reads "Edit <template name>" and submit reads "Save changes"', () => {
    renderEditDialog()

    expect(screen.getByText(/Edit Daily Crash Log Triage/i)).toBeInTheDocument()
    expect(
      screen.getByText("Adjust this schedule's settings. Pick a different job to start over."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', {name: /save changes/i})).toBeInTheDocument()
  })

  it('falls back to "Edit schedule" when card_template has no __source_template_slug', () => {
    renderEditDialog({
      editingSchedule: buildSchedule({
        cardTemplate: {
          bodyMd: 'Some custom task',
          title: 'Custom schedule',
        },
      }),
    })

    expect(screen.getByText('Edit schedule')).toBeInTheDocument()
  })

  it('hydrates title, description, persona, and cron from editingSchedule', () => {
    renderEditDialog()

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toBe('Daily Crash Log Triage — ${date}')
    const bodyInput = screen.getByLabelText('Description') as HTMLTextAreaElement
    expect(bodyInput.value).toBe('Read the crash log')
    expect(screen.getByTestId('persona-picker-trigger')).toHaveTextContent('Sara')
    expect((screen.getByTestId('repeat-cron') as HTMLInputElement).checked).toBe(true)
  })

  it('hydrates template-config inputs from card_template values', () => {
    renderEditDialog()

    const urlInput = screen.getByTestId(
      'job-config-crash_log_source_url',
    ) as HTMLInputElement
    expect(urlInput.value).toBe('https://crash.example.com/log.json')
    const topNInput = screen.getByTestId('job-config-top_n') as HTMLInputElement
    expect(topNInput.value).toBe('5')
  })

  it('switching to a different template re-fills fields with the new defaults', async () => {
    const user = userEvent.setup()
    renderEditDialog()

    await user.click(screen.getByTestId('back-to-picker'))
    await user.click(screen.getByTestId('job-picker-customer-feedback-to-cards'))

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toContain('Customer Feedback Roundup')
    expect(
      screen.getByTestId('job-config-feedback_source_url'),
    ).toBeInTheDocument()
  })

  it('switching to Blank task in edit mode keeps typed values but drops template config (eng review T3)', async () => {
    const user = userEvent.setup()
    renderEditDialog()

    await user.click(screen.getByTestId('back-to-picker'))
    await user.click(screen.getByTestId('job-picker-blank'))

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toBe('Daily Crash Log Triage — ${date}')
    expect(
      screen.queryByTestId('job-config-crash_log_source_url'),
    ).not.toBeInTheDocument()
  })

  it('hides the One-off radio in edit mode (D5-6)', () => {
    renderEditDialog()

    expect(screen.queryByTestId('repeat-one_off')).not.toBeInTheDocument()
  })

  it('Save changes calls onUpdate with the schedule id and detected diffs', async () => {
    const user = userEvent.setup()
    const {onUpdate} = renderEditDialog()

    await user.click(screen.getByTestId('persona-picker-trigger'))
    await user.click(screen.getByTestId('persona-picker-option-andy'))
    await user.click(screen.getByRole('button', {name: /save changes/i}))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const payload = onUpdate.mock.calls[0]?.[0]
    expect(payload.scheduleId).toBe('schedule-1')
    expect(payload.newPersonaId).toBe('persona-andy')
    expect(payload.newCronExpression).toBeNull()
    expect(payload.cardTemplate.__source_template_slug).toBe('daily-crash-log-triage')
  })
})
