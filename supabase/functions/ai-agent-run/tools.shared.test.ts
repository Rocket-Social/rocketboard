import {describe, expect, it} from 'vitest'

import {
  buildAnthropicToolsParam,
  getToolByName,
  isToolEnabledForPersona,
  REFLECTIVE_DENYLIST,
  V1_TOOLS,
  validateToolArgs,
} from './tools.shared.ts'

const VALID_UUID = '11111111-2222-3333-4444-555555555555'

describe('V1_TOOLS catalogue', () => {
  it('contains the v1 tools with correct mutation classification', () => {
    const names = V1_TOOLS.map((t) => t.name).sort()
    expect(names).toEqual([
      'add_comment',
      'attach_subtask',
      'create_card_in_project',
      'fetch_url',
      'send_email',
      'send_inbox_message',
      'set_card_assignee',
      'set_card_priority',
      'set_card_status',
    ])

    expect(getToolByName('add_comment')?.mutates).toBe(false)
    expect(getToolByName('fetch_url')?.mutates).toBe(false)
    expect(getToolByName('set_card_status')?.mutates).toBe(true)
    expect(getToolByName('set_card_priority')?.mutates).toBe(true)
    expect(getToolByName('set_card_assignee')?.mutates).toBe(true)
    expect(getToolByName('attach_subtask')?.mutates).toBe(true)
    expect(getToolByName('create_card_in_project')?.mutates).toBe(true)
    expect(getToolByName('send_inbox_message')?.mutates).toBe(true)
    expect(getToolByName('send_email')?.mutates).toBe(true)
  })

  it('send_inbox_message validates required + length caps', () => {
    const okShort = validateToolArgs('send_inbox_message', {
      target_user_id: VALID_UUID,
      title: 'Cards needing your attention',
      body_md: 'You have 3 cards missing assignees.',
    })
    expect(okShort.ok).toBe(true)

    const missingBody = validateToolArgs('send_inbox_message', {
      target_user_id: VALID_UUID,
      title: 'Hi',
    })
    expect(missingBody.ok).toBe(false)
    if (!missingBody.ok) expect(missingBody.reason).toBe('missing_required:body_md')

    const tooLongTitle = validateToolArgs('send_inbox_message', {
      target_user_id: VALID_UUID,
      title: 'x'.repeat(201),
      body_md: 'ok',
    })
    expect(tooLongTitle.ok).toBe(false)
    if (!tooLongTitle.ok) expect(tooLongTitle.reason).toBe('too_long:title')
  })

  it('send_email validates required + sections-must-be-array', () => {
    const ok = validateToolArgs('send_email', {
      target_user_id: VALID_UUID,
      subject: 'Sprint summary',
      sections: [{heading: 'Cards in flight', items: [{text: 'Card A'}]}],
    })
    expect(ok.ok).toBe(true)

    const missingSubject = validateToolArgs('send_email', {
      target_user_id: VALID_UUID,
      sections: [],
    })
    expect(missingSubject.ok).toBe(false)
    if (!missingSubject.ok) expect(missingSubject.reason).toBe('missing_required:subject')

    const sectionsNotArray = validateToolArgs('send_email', {
      target_user_id: VALID_UUID,
      subject: 'Hi',
      sections: 'not-an-array',
    })
    expect(sectionsNotArray.ok).toBe(false)
    if (!sectionsNotArray.ok) expect(sectionsNotArray.reason).toBe('wrong_type:sections')
  })
})

describe('isToolEnabledForPersona', () => {
  it('returns true when the tool is in the persona capability whitelist', () => {
    expect(isToolEnabledForPersona('add_comment', ['add_comment', 'set_card_status'])).toBe(true)
  })

  it('returns false when the tool is not in the whitelist', () => {
    expect(isToolEnabledForPersona('fetch_url', ['add_comment'])).toBe(false)
  })

  it('returns false for empty / non-array capabilities', () => {
    expect(isToolEnabledForPersona('add_comment', [])).toBe(false)
    expect(isToolEnabledForPersona('add_comment', null as unknown as string[])).toBe(false)
  })
})

describe('validateToolArgs', () => {
  it('passes for a well-formed add_comment call', () => {
    const result = validateToolArgs('add_comment', {
      card_id: VALID_UUID,
      body_md: 'A friendly comment.',
    })
    expect(result.ok).toBe(true)
  })

  it('flags unknown tools', () => {
    const result = validateToolArgs('drop_table', {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unknown_tool')
  })

  it('flags missing required fields', () => {
    const result = validateToolArgs('add_comment', {card_id: VALID_UUID})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing_required:body_md')
  })

  it('flags wrong types', () => {
    const result = validateToolArgs('add_comment', {card_id: VALID_UUID, body_md: 123})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('wrong_type:body_md')
  })

  it('flags invalid uuids', () => {
    const result = validateToolArgs('add_comment', {card_id: 'not-a-uuid', body_md: 'hi'})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_uuid:card_id')
  })

  it('flags strings exceeding maxLength', () => {
    const tooBig = 'a'.repeat(5001)
    const result = validateToolArgs('add_comment', {card_id: VALID_UUID, body_md: tooBig})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_long:body_md')
  })

  it('accepts null for nullable optional fields', () => {
    const result = validateToolArgs('set_card_assignee', {card_id: VALID_UUID, assignee_user_id: null})
    expect(result.ok).toBe(true)
  })

  it('refuses values that try to set reflective-denylist fields', () => {
    const result = validateToolArgs('add_comment', {
      card_id: VALID_UUID,
      body_md: 'hi',
      description: 'attempt to override',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('reflective_denylist:description')
  })

  it('flags invalid URI scheme on fetch_url', () => {
    const result = validateToolArgs('fetch_url', {url: 'file:///etc/passwd'})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_uri:url')
  })

  it('flags fetch_url body cap out of range', () => {
    const result = validateToolArgs('fetch_url', {url: 'https://x.com', max_response_bytes: 2_000_000})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_large:max_response_bytes')
  })
})

describe('REFLECTIVE_DENYLIST', () => {
  it('contains the v1 protected fields', () => {
    expect(REFLECTIVE_DENYLIST.has('description')).toBe(true)
    expect(REFLECTIVE_DENYLIST.has('retro_what_went_well')).toBe(true)
  })
})

describe('buildAnthropicToolsParam', () => {
  it('returns only tools the persona is allowed to use', () => {
    const tools = buildAnthropicToolsParam(['add_comment', 'set_card_priority'])
    expect(tools).toHaveLength(2)
    const names = (tools as Array<{name: string}>).map((t) => t.name).sort()
    expect(names).toEqual(['add_comment', 'set_card_priority'])
  })

  it('returns no tools for an empty capability list', () => {
    expect(buildAnthropicToolsParam([])).toEqual([])
  })

  it('strips the mutates flag and only sends Anthropic-shaped fields', () => {
    const tools = buildAnthropicToolsParam(['add_comment'])
    expect(tools[0]).toHaveProperty('input_schema')
    expect(tools[0]).not.toHaveProperty('mutates')
  })
})
