import {describe, expect, it} from 'vitest'

import {buildAgentEmailHtml, escapeHtml, type EmailSection} from './email-template.ts'

const APP = 'https://rocketboard.app'

describe('escapeHtml', () => {
  it('escapes the standard XSS vector chars', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
    expect(escapeHtml("o'reilly")).toBe('o&#x27;reilly')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
})

describe('buildAgentEmailHtml', () => {
  const sections: EmailSection[] = [
    {
      heading: 'Cards needing your attention',
      items: [
        {text: '#42 Onboarding flow — missing assignee', action_label: 'View card', action_url: '/p/web/c/42'},
        {text: '#51 Sprint goal — overdue 2d', action_label: 'View card', action_url: '/p/web/c/51'},
      ],
    },
    {heading: 'Sprint summary', items: [{text: 'Sprint Q2-W19 starts today. 12 cards in scope.'}]},
  ]

  it('renders subject + sections + actionable buttons', () => {
    const html = buildAgentEmailHtml({
      appOrigin: APP,
      fromPersonaName: 'Sara',
      sections,
      subject: 'Sprint Manager · Daily',
    })

    expect(html).toContain('Sprint Manager · Daily')
    expect(html).toContain('Cards needing your attention')
    expect(html).toContain('Sprint summary')
    expect(html).toContain('via Sara')
    // Action button → absolute href + safe label
    expect(html).toContain(`${APP}/p/web/c/42`)
    expect(html).toContain('View card')
  })

  it('escapes user-provided text in items + headings', () => {
    const html = buildAgentEmailHtml({
      appOrigin: APP,
      fromPersonaName: '<bad>',
      sections: [
        {
          heading: 'Cards <urgent>',
          items: [{text: '<img src=x onerror=alert(1)>'}],
        },
      ],
      subject: '"hi" <there>',
    })

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Cards &lt;urgent&gt;')
    expect(html).toContain('via &lt;bad&gt;')
  })

  it('rejects absolute / protocol-relative action URLs and falls back to plain text', () => {
    const html = buildAgentEmailHtml({
      appOrigin: APP,
      fromPersonaName: 'Sara',
      sections: [
        {
          heading: 'Suspicious links',
          items: [
            {text: 'External', action_label: 'Click', action_url: 'https://evil.example/x'},
            {text: 'Protocol-relative', action_label: 'Click', action_url: '//evil.example/x'},
          ],
        },
      ],
      subject: 'test',
    })

    // Both items should NOT render as actionable buttons (no anchor tag
    // pointing at the bad URL).
    expect(html).not.toContain('https://evil.example/x')
    expect(html).not.toContain('//evil.example/x')
    // The text still renders.
    expect(html).toContain('External')
    expect(html).toContain('Protocol-relative')
  })

  it('renders text-only items without action button when no action_label/action_url', () => {
    const html = buildAgentEmailHtml({
      appOrigin: APP,
      fromPersonaName: 'Sara',
      sections: [{heading: 'Notes', items: [{text: 'Just FYI'}]}],
      subject: 'FYI',
    })
    expect(html).toContain('Just FYI')
    // No anchor with that origin appears for the FYI item.
    const anchorMatches = html.match(/<a href="[^"]*p\/web\/c\/[^"]*"/g) ?? []
    expect(anchorMatches.length).toBe(0)
  })
})
