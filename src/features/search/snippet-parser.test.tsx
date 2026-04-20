/** @vitest-environment jsdom */
import {describe, expect, it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement, Fragment} from 'react'

import {parseSnippet} from './snippet-parser'

function renderSnippet(snippet: string): string {
  const parts = parseSnippet(snippet)
  return renderToStaticMarkup(createElement(Fragment, null, ...parts))
}

describe('parseSnippet', () => {
  it('highlights a single matched term', () => {
    const html = renderSnippet('the «auth» token')
    expect(html).toContain('<mark')
    expect(html).toContain('auth')
    expect(html).toContain('the ')
    expect(html).toContain(' token')
  })

  it('highlights multiple matched terms', () => {
    const html = renderSnippet('«auth» and «refresh»')
    expect(html).toMatch(/<mark[^>]*>auth<\/mark>/)
    expect(html).toMatch(/<mark[^>]*>refresh<\/mark>/)
    expect(html).toContain(' and ')
  })

  it('returns plain text when no markers present', () => {
    const parts = parseSnippet('plain text with no markers')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('plain text with no markers')
  })

  it('returns empty array for empty string', () => {
    expect(parseSnippet('')).toEqual([])
  })

  it('handles malformed start without end gracefully', () => {
    const parts = parseSnippet('the «auth token')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('the «auth token')
  })

  it('handles malformed end without start gracefully', () => {
    const parts = parseSnippet('the auth» token')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('the auth» token')
  })

  it('handles adjacent markers', () => {
    const html = renderSnippet('«a»«b»')
    expect(html).toMatch(/<mark[^>]*>a<\/mark>/)
    expect(html).toMatch(/<mark[^>]*>b<\/mark>/)
  })

  it('handles empty content between markers', () => {
    // Empty mark is skipped, renders as plain text
    const html = renderSnippet('before «» after')
    expect(html).toContain('before ')
    expect(html).toContain(' after')
  })

  it('preserves text containing square brackets (not markers)', () => {
    const parts = parseSnippet('Fix the [auth] module')
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('Fix the [auth] module')
  })

  it('applies the correct CSS classes to mark elements', () => {
    const html = renderSnippet('the «auth» token')
    expect(html).toContain('bg-primary-soft/60')
    expect(html).toContain('text-text-strong')
  })
})
