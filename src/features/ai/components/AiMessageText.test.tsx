/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AiMessageText } from './AiMessageText'

describe('AiMessageText', () => {
  it('renders common AI markdown as readable message blocks', () => {
    const content = [
      'Looking at this draft wiki page, here are my recommendations:',
      '',
      "### What's Working Well",
      '- Clear thesis about AI impact',
      '- Specific examples',
      '',
      '#### 1. **Role Definition & Scope**',
      'What exactly is a `Lila Builder`?',
      'How does this role differ from traditional PM roles?',
      '',
      '2. **Success Metrics**: How will you measure it?',
    ].join('\n')

    const { container } = render(<AiMessageText content={content} />)

    expect(screen.getByText('Looking at this draft wiki page, here are my recommendations:')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "What's Working Well" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Role Definition & Scope' })).toBeInTheDocument()
    expect(screen.queryByText(/###/)).not.toBeInTheDocument()

    const lists = screen.getAllByRole('list')
    expect(lists[0].tagName).toBe('UL')
    expect(lists[1].tagName).toBe('OL')
    expect(screen.getByText('Clear thesis about AI impact')).toBeInTheDocument()
    expect(screen.getByText('Success Metrics').tagName).toBe('STRONG')
    expect(screen.getByText('Lila Builder').tagName).toBe('CODE')
    expect(container.querySelector('br')).toBeInTheDocument()
  })

  it('preserves line feeds within plain paragraphs', () => {
    const { container } = render(<AiMessageText content={'First line\nSecond line'} />)

    expect(container.querySelector('br')).toBeInTheDocument()
    expect(container).toHaveTextContent('First lineSecond line')
  })
})
