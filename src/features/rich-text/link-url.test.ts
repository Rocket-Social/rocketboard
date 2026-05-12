import {describe, expect, it} from 'vitest'

import {isAllowedRichTextLinkUrl, normalizeRichTextLinkUrl} from './link-url'

describe('rich text link URL helpers', () => {
  it('normalizes safe URLs after trimming surrounding whitespace', () => {
    expect(normalizeRichTextLinkUrl(' https://example.com/path ')).toBe('https://example.com/path')
    expect(normalizeRichTextLinkUrl(' HTTP://example.com/path ')).toBe('http://example.com/path')
    expect(normalizeRichTextLinkUrl('example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeRichTextLinkUrl('//example.com/path')).toBe('https://example.com/path')
  })

  it('allows explicit mailto and tel links', () => {
    expect(normalizeRichTextLinkUrl('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(normalizeRichTextLinkUrl('MAILTO:test@example.com')).toBe('mailto:test@example.com')
    expect(normalizeRichTextLinkUrl('tel:+14155551212')).toBe('tel:+14155551212')
  })

  it('rejects unsupported or malformed link values', () => {
    expect(normalizeRichTextLinkUrl('javascript://x%0Aalert(1)')).toBe('')
    expect(normalizeRichTextLinkUrl('/relative/path')).toBe('')
    expect(normalizeRichTextLinkUrl(' https:// https://example.com')).toBe('')
  })

  it('reports whether a link value is allowed', () => {
    expect(isAllowedRichTextLinkUrl('https://example.com')).toBe(true)
    expect(isAllowedRichTextLinkUrl('javascript:alert(1)')).toBe(false)
  })
})
