import {describe, expect, it} from 'vitest'

import {parseNotificationLink} from './parse-notification-link'

describe('parseNotificationLink', () => {
  it('parses card:<uuid> into a card target', () => {
    const cardId = '12345678-1234-1234-1234-123456789abc'
    expect(parseNotificationLink(`card:${cardId}`)).toEqual({
      type: 'card',
      cardId,
    })
  })

  it('rejects card:<not-a-uuid>', () => {
    expect(parseNotificationLink('card:not-a-uuid')).toBeNull()
    expect(parseNotificationLink('card:1')).toBeNull()
    expect(parseNotificationLink('card:')).toBeNull()
  })

  it('parses allowlisted internal paths', () => {
    expect(parseNotificationLink('/ai-agents')).toEqual({
      type: 'internal-path',
      path: '/ai-agents',
    })
    expect(parseNotificationLink('/my-notes')).toEqual({
      type: 'internal-path',
      path: '/my-notes',
    })
    expect(parseNotificationLink('/wiki')).toEqual({
      type: 'internal-path',
      path: '/wiki',
    })
    expect(parseNotificationLink('/inbox')).toEqual({
      type: 'internal-path',
      path: '/inbox',
    })
  })

  it('parses subpaths under allowlisted prefixes', () => {
    expect(parseNotificationLink('/ai-agents/abc')).toEqual({
      type: 'internal-path',
      path: '/ai-agents/abc',
    })
    expect(parseNotificationLink('/wiki/some/deep/page')).toEqual({
      type: 'internal-path',
      path: '/wiki/some/deep/page',
    })
  })

  it('rejects internal paths not on the allowlist', () => {
    expect(parseNotificationLink('/admin')).toBeNull()
    expect(parseNotificationLink('/super-admin')).toBeNull()
    expect(parseNotificationLink('/auth/callback')).toBeNull()
  })

  it('rejects external URLs and unknown schemes', () => {
    expect(parseNotificationLink('https://example.com')).toBeNull()
    expect(parseNotificationLink('http://example.com')).toBeNull()
    expect(parseNotificationLink('javascript:alert(1)')).toBeNull()
    expect(parseNotificationLink('mailto:hi@example.com')).toBeNull()
    expect(parseNotificationLink('//evil.com')).toBeNull()
  })

  it('handles null and empty input', () => {
    expect(parseNotificationLink(null)).toBeNull()
    expect(parseNotificationLink(undefined)).toBeNull()
    expect(parseNotificationLink('')).toBeNull()
  })

  it('does not match prefix-substring of an allowlisted path', () => {
    expect(parseNotificationLink('/ai-agentsXYZ')).toBeNull()
    expect(parseNotificationLink('/wikipedia')).toBeNull()
  })
})
