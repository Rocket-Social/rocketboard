/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {describe, expect, it} from 'vitest'
import {render, screen} from '@testing-library/react'

import {AI_AGENTS_DOC_URL, HelpCallout} from './HelpCallout'

describe('<HelpCallout>', () => {
  it('renders the AI Agents guide link with the public docs URL', () => {
    render(<HelpCallout/>)
    const link = screen.getByRole('link', {name: /AI Agents guide/i})
    expect(link).toHaveAttribute('href', AI_AGENTS_DOC_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows the "Need help?" prompt copy', () => {
    render(<HelpCallout/>)
    expect(screen.getByText('Need help?')).toBeInTheDocument()
  })
})
