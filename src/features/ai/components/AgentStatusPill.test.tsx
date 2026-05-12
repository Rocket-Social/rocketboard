/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {AgentStatusPill} from './AgentStatusPill'
import type {AgentCardRunSummary} from '../../cards/card.types'

const SAMPLE_SUMMARY: AgentCardRunSummary = {
  personaAccentColor: 'orange',
  personaId: 'persona-1',
  personaName: 'Sara',
  runId: 'run-1',
  status: 'running',
}

describe('AgentStatusPill (D16)', () => {
  it('renders nothing when summary is null', () => {
    const {container} = render(<AgentStatusPill summary={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the running label + persona avatar circle', () => {
    render(<AgentStatusPill summary={SAMPLE_SUMMARY} />)
    const pill = screen.getByTestId('agent-status-pill')
    expect(pill).toBeInTheDocument()
    expect(pill.textContent).toContain('Working')
    // Avatar initial is rendered (aria-hidden, so use textContent).
    expect(pill.textContent).toContain('S')
  })

  it('uses the canonical status label for awaiting_approval', () => {
    render(<AgentStatusPill summary={{...SAMPLE_SUMMARY, status: 'awaiting_approval'}} />)
    expect(screen.getByTestId('agent-status-pill').textContent).toContain('Awaiting')
  })
})
