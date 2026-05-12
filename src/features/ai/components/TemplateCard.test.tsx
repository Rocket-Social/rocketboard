/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {AGENT_JOBS} from '../agent-recipes'
import {JobCard} from './TemplateCard'

const JOB = AGENT_JOBS[1]! // Daily Crash Log Triage

describe('JobCard', () => {
  it('renders the job name, description, and config summary', () => {
    render(<JobCard job={JOB} onUseJob={vi.fn()}/>)
    expect(screen.getByText('Daily Crash Log Triage')).toBeInTheDocument()
    expect(screen.getByText(/Sara reads the configured crash log/i)).toBeInTheDocument()
    expect(
      screen.getByText('Trigger: weekdays 10:00 · Persona: Sara · Apply: Suggest only'),
    ).toBeInTheDocument()
  })

  it('renders the Use this job button as a primary action', () => {
    render(<JobCard job={JOB} onUseJob={vi.fn()}/>)
    expect(screen.getByTestId('job-card-daily-crash-log-triage-use')).toBeInTheDocument()
  })

  it('clicking Use this job fires onUseJob with the slug', () => {
    const onUseJob = vi.fn()
    render(<JobCard job={JOB} onUseJob={onUseJob}/>)
    fireEvent.click(screen.getByTestId('job-card-daily-crash-log-triage-use'))
    expect(onUseJob).toHaveBeenCalledWith('daily-crash-log-triage')
  })

  it('renders for every v1 job', () => {
    for (const job of AGENT_JOBS) {
      const {unmount} = render(<JobCard job={job} onUseJob={vi.fn()}/>)
      expect(screen.getByTestId(`job-card-${job.slug}`)).toBeInTheDocument()
      unmount()
    }
  })
})
