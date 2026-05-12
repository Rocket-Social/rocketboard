/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {AGENT_JOBS} from '../agent-recipes'
import {JobPicker} from './TemplatePicker'

describe('JobPicker', () => {
  it('renders Blank task plus one radio per job', () => {
    render(
      <JobPicker
        jobs={AGENT_JOBS}
        onSelect={vi.fn()}
        selectedSlug=''
      />,
    )

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(AGENT_JOBS.length + 1)
    expect(screen.getByTestId('job-picker-blank')).toBeInTheDocument()
    for (const job of AGENT_JOBS) {
      expect(screen.getByTestId(`job-picker-${job.slug}`)).toBeInTheDocument()
    }
  })

  it('selecting a job radio fires onSelect with the resolved object', () => {
    const onSelect = vi.fn()
    render(
      <JobPicker jobs={AGENT_JOBS} onSelect={onSelect} selectedSlug='' />,
    )

    fireEvent.click(screen.getByTestId('job-picker-daily-crash-log-triage'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]?.slug).toBe('daily-crash-log-triage')
  })

  it('selecting Blank task fires onSelect(null)', () => {
    const onSelect = vi.fn()
    render(
      <JobPicker
        jobs={AGENT_JOBS}
        onSelect={onSelect}
        selectedSlug='daily-crash-log-triage'
      />,
    )

    fireEvent.click(screen.getByTestId('job-picker-blank'))

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('disables every radio when disabled is true', () => {
    render(
      <JobPicker
        disabled
        jobs={AGENT_JOBS}
        onSelect={vi.fn()}
        selectedSlug=''
      />,
    )

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled()
    }
  })
})
