/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import type {AgentSchedule, AssignablePersona} from '../agent.types'
import {ActiveScheduleRow} from './ActiveScheduleRow'

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
    timezone: 'America/Los_Angeles',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

function renderRow(overrides: Partial<{
  isDeleting: boolean
  isPausing: boolean
  isResuming: boolean
  persona: AssignablePersona | null
  schedule: AgentSchedule
}> = {}) {
  const onConfirmDelete = vi.fn()
  const onEdit = vi.fn()
  const onPause = vi.fn()
  const onResume = vi.fn()
  const result = render(
    <ActiveScheduleRow
      isDeleting={overrides.isDeleting ?? false}
      isPausing={overrides.isPausing ?? false}
      isResuming={overrides.isResuming ?? false}
      onConfirmDelete={onConfirmDelete}
      onEdit={onEdit}
      onPause={onPause}
      onResume={onResume}
      persona={overrides.persona === null ? null : (overrides.persona ?? persona)}
      schedule={overrides.schedule ?? buildSchedule()}
    />,
  )
  return {onConfirmDelete, onEdit, onPause, onResume, ...result}
}

describe('ActiveScheduleRow', () => {
  it('renders title, persona name, friendly cron, and last-run text', () => {
    renderRow()
    expect(screen.getByText('Daily Crash Log Triage')).toBeInTheDocument()
    expect(
      screen.getByText(/Sara · Every weekday at 10:00 PT · last run no runs yet · from Daily Crash Log Triage/i),
    ).toBeInTheDocument()
  })

  it('shows the Pause button when not paused; Resume button when paused', () => {
    const {unmount} = renderRow()
    expect(screen.getByTestId('active-schedule-row-schedule-1-pause')).toBeInTheDocument()
    unmount()

    renderRow({schedule: buildSchedule({isPaused: true})})
    expect(screen.getByTestId('active-schedule-row-schedule-1-resume')).toBeInTheDocument()
  })

  it('Edit click fires onEdit', () => {
    const {onEdit} = renderRow()
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-edit'))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('Delete click swaps in the inline confirm strip with aria-live', () => {
    renderRow()
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-delete'))
    const confirmStrip = screen.getByTestId('active-schedule-row-schedule-1-confirm')
    expect(confirmStrip).toHaveAttribute('aria-live', 'polite')
    expect(confirmStrip).toHaveTextContent(/Delete this schedule\? Future runs cancelled/)
  })

  it('Confirm Delete fires onConfirmDelete', () => {
    const {onConfirmDelete} = renderRow()
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-delete'))
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-confirm-delete'))
    expect(onConfirmDelete).toHaveBeenCalledTimes(1)
  })

  it('Cancel restores the original button cluster', () => {
    renderRow()
    fireEvent.click(screen.getByTestId('active-schedule-row-schedule-1-delete'))
    expect(
      screen.getByTestId('active-schedule-row-schedule-1-confirm'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(
      screen.queryByTestId('active-schedule-row-schedule-1-confirm'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('active-schedule-row-schedule-1-pause'),
    ).toBeInTheDocument()
  })

  it('falls back to "Unknown agent" when persona is null', () => {
    renderRow({persona: null})
    expect(screen.getByText(/Unknown agent/i)).toBeInTheDocument()
  })

  it('falls back to "Untitled schedule" when card_template has no title', () => {
    renderRow({
      schedule: buildSchedule({cardTemplate: {bodyMd: 'no title here'}}),
    })
    expect(screen.getByText('Untitled schedule')).toBeInTheDocument()
  })

  it('renders the literal placeholder when card_template title contains ${date}', () => {
    renderRow({
      schedule: buildSchedule({
        cardTemplate: {bodyMd: '', title: 'Daily Crash Log Triage — ${date}'},
      }),
    })
    expect(
      screen.getByText('Daily Crash Log Triage — ${date}'),
    ).toBeInTheDocument()
  })

  it('shows the paused visual state when is_paused is true', () => {
    renderRow({schedule: buildSchedule({isPaused: true})})
    const row = screen.getByTestId('active-schedule-row-schedule-1')
    expect(row.className).toContain('opacity-80')
  })
})
