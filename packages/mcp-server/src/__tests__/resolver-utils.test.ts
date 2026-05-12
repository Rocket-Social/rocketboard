import {describe, expect, it} from 'vitest'

import {
  type CardRow,
  looksLikeUuid,
  matchesCardQuery,
  normalizeMatch,
  resolveUniqueCandidate,
  resolveUniqueMatch,
} from '../service.js'

// ---------------------------------------------------------------------------
// normalizeMatch
// ---------------------------------------------------------------------------

describe('normalizeMatch', () => {
  it('trims and lowercases a string', () => {
    expect(normalizeMatch('  Hello World  ')).toBe('hello world')
  })

  it('handles an already-normalized string', () => {
    expect(normalizeMatch('foo')).toBe('foo')
  })

  it('handles an empty string', () => {
    expect(normalizeMatch('')).toBe('')
  })

  it('lowercases mixed-case strings', () => {
    expect(normalizeMatch('FoO BaR')).toBe('foo bar')
  })
})

// ---------------------------------------------------------------------------
// looksLikeUuid
// ---------------------------------------------------------------------------

describe('looksLikeUuid', () => {
  it('accepts a valid v4 UUID (lowercase)', () => {
    expect(looksLikeUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('accepts a valid v4 UUID (uppercase)', () => {
    expect(looksLikeUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('accepts UUIDs with leading/trailing whitespace', () => {
    expect(looksLikeUuid('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true)
  })

  it('accepts a v1 UUID', () => {
    expect(looksLikeUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(looksLikeUuid('')).toBe(false)
  })

  it('rejects a non-UUID string', () => {
    expect(looksLikeUuid('not-a-uuid')).toBe(false)
  })

  it('rejects a UUID missing a segment', () => {
    expect(looksLikeUuid('550e8400-e29b-41d4-a716')).toBe(false)
  })

  it('rejects a UUID with invalid version digit (0)', () => {
    expect(looksLikeUuid('550e8400-e29b-01d4-a716-446655440000')).toBe(false)
  })

  it('rejects a UUID with invalid variant nibble', () => {
    // variant nibble must be 8, 9, a, or b; here it is 0
    expect(looksLikeUuid('550e8400-e29b-41d4-0716-446655440000')).toBe(false)
  })

  it('rejects a UUID with extra characters', () => {
    expect(looksLikeUuid('550e8400-e29b-41d4-a716-446655440000X')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveUniqueCandidate
// ---------------------------------------------------------------------------

describe('resolveUniqueCandidate', () => {
  const getLabel = (v: {name: string}) => v.name

  it('returns the single match', () => {
    const result = resolveUniqueCandidate([{name: 'Alpha'}], getLabel, 'project', 'alpha')
    expect(result).toEqual({name: 'Alpha'})
  })

  it('returns null for zero results', () => {
    const result = resolveUniqueCandidate([], getLabel, 'project', 'alpha')
    expect(result).toBeNull()
  })

  it('throws for ambiguous results (default writeMode=false)', () => {
    expect(() =>
      resolveUniqueCandidate([{name: 'A'}, {name: 'B'}], getLabel, 'project', 'query'),
    ).toThrow(/Match was ambiguous/)
  })

  it('throws with writeMode prefix when writeMode=true', () => {
    expect(() =>
      resolveUniqueCandidate([{name: 'A'}, {name: 'B'}], getLabel, 'project', 'query', true),
    ).toThrow(/Refusing to mutate/)
  })

  it('includes candidate labels in the error message', () => {
    expect(() =>
      resolveUniqueCandidate([{name: 'Foo'}, {name: 'Bar'}], getLabel, 'workspace', 'q'),
    ).toThrow(/Foo, Bar/)
  })
})

// ---------------------------------------------------------------------------
// resolveUniqueMatch
// ---------------------------------------------------------------------------

describe('resolveUniqueMatch', () => {
  type Item = {id: string; name: string; slug: string}

  const items: Item[] = [
    {id: '1', name: 'Backend API', slug: 'backend-api'},
    {id: '2', name: 'Frontend App', slug: 'frontend-app'},
    {id: '3', name: 'Backend Worker', slug: 'backend-worker'},
  ]
  const getCandidates = (item: Item) => [item.id, item.name, item.slug]
  const getLabel = (item: Item) => item.name

  it('returns an exact match by id', () => {
    const result = resolveUniqueMatch(items, '1', getCandidates, getLabel, 'project')
    expect(result).toEqual(items[0])
  })

  it('returns an exact match by name (case insensitive)', () => {
    const result = resolveUniqueMatch(items, 'frontend app', getCandidates, getLabel, 'project')
    expect(result).toEqual(items[1])
  })

  it('returns an exact match by slug', () => {
    const result = resolveUniqueMatch(items, 'backend-worker', getCandidates, getLabel, 'project')
    expect(result).toEqual(items[2])
  })

  it('returns a fuzzy substring match when no exact match exists', () => {
    // "frontend" is a substring of "Frontend App" and "frontend-app" but they
    // belong to the same item, so it should uniquely resolve
    const result = resolveUniqueMatch(items, 'frontend', getCandidates, getLabel, 'project')
    expect(result).toEqual(items[1])
  })

  it('throws when fuzzy matching is ambiguous', () => {
    // "backend" matches both "Backend API" and "Backend Worker"
    expect(() =>
      resolveUniqueMatch(items, 'backend', getCandidates, getLabel, 'project'),
    ).toThrow(/ambiguous/i)
  })

  it('throws when no match is found at all', () => {
    expect(() =>
      resolveUniqueMatch(items, 'nonexistent', getCandidates, getLabel, 'project'),
    ).toThrow(/was not found/)
  })
})

// ---------------------------------------------------------------------------
// matchesCardQuery
// ---------------------------------------------------------------------------

describe('matchesCardQuery', () => {
  function makeCard(overrides: Partial<CardRow> = {}): CardRow {
    return {
      assignee_name: 'Alice',
      assignee_user_id: null,
      body_json: null,
      body_text: null,
      card_id: 'c1',
      card_ref: 'RB-1',
      completed_at: null,
      created_at: '2025-01-01',
      custom_field_values: null,
      due_at: null,
      effort: null,
      group_id: null,
      group_position: 0,
      initiative_id: null,
      priority_option_id: null,
      project_card_number: 1,
      project_key: 'RB',
      sprint_id: null,
      start_at: null,
      status_option_id: null,
      status_position: 0,
      tags: null,
      title: 'Fix login bug',
      ...overrides,
    }
  }

  it('matches on title (case-insensitive)', () => {
    expect(matchesCardQuery(makeCard(), 'login')).toBe(true)
  })

  it('matches on cardRef', () => {
    expect(matchesCardQuery(makeCard({card_ref: 'PROJ-42'}), 'proj-42')).toBe(true)
  })

  it('matches on body_text', () => {
    expect(
      matchesCardQuery(makeCard({body_text: 'The authentication flow is broken'}), 'authentication'),
    ).toBe(true)
  })

  it('matches on tags', () => {
    expect(matchesCardQuery(makeCard({tags: ['urgent', 'p0']}), 'urgent')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesCardQuery(makeCard(), 'nonexistent-query')).toBe(false)
  })

  it('handles null body_text and null tags gracefully', () => {
    const card = makeCard({body_text: null, tags: null})
    expect(matchesCardQuery(card, 'login')).toBe(true) // still matches title
    expect(matchesCardQuery(card, 'missing')).toBe(false)
  })
})
