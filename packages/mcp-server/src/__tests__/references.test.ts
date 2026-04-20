import {describe, expect, it} from 'vitest'

import {
  normalizeCardScope,
  normalizeDocumentScope,
  normalizeProjectScope,
  normalizeSprintScope,
  parseRocketboardReference,
} from '../references.js'

// ---------------------------------------------------------------------------
// parseRocketboardReference
// ---------------------------------------------------------------------------

describe('parseRocketboardReference', () => {
  describe('rocketboard:// protocol', () => {
    it('parses a project reference', () => {
      const result = parseRocketboardReference('rocketboard://project/my-ws/my-proj')
      expect(result).toEqual({
        kind: 'project',
        project: 'my-proj',
        workspace: 'my-ws',
      })
    })

    it('parses a card reference', () => {
      const result = parseRocketboardReference('rocketboard://card/ws/proj/card-123')
      expect(result).toEqual({
        card: 'card-123',
        kind: 'card',
        project: 'proj',
        workspace: 'ws',
      })
    })

    it('parses a document reference', () => {
      const result = parseRocketboardReference('rocketboard://document/ws/proj/doc-456')
      expect(result).toEqual({
        document: 'doc-456',
        kind: 'document',
        project: 'proj',
        workspace: 'ws',
      })
    })

    it('parses a sprint reference', () => {
      const result = parseRocketboardReference('rocketboard://sprint/ws/proj/sprint-7')
      expect(result).toEqual({
        kind: 'sprint',
        project: 'proj',
        sprint: 'sprint-7',
        workspace: 'ws',
      })
    })

    it('returns null for unknown hostname', () => {
      expect(parseRocketboardReference('rocketboard://unknown/ws/proj')).toBeNull()
    })

    it('returns null when required path segments are missing (card without card id)', () => {
      // rocketboard://card/ws/proj  — no card segment
      expect(parseRocketboardReference('rocketboard://card/ws/proj')).toBeNull()
    })

    it('returns null for project reference missing project segment', () => {
      expect(parseRocketboardReference('rocketboard://project/ws')).toBeNull()
    })

    it('decodes URI-encoded path segments', () => {
      const result = parseRocketboardReference('rocketboard://project/my%20ws/my%20proj')
      expect(result).toEqual({
        kind: 'project',
        project: 'my proj',
        workspace: 'my ws',
      })
    })
  })

  describe('https:// web URLs', () => {
    it('parses a web project URL with workspace/project/view', () => {
      const result = parseRocketboardReference(
        'https://app.rocketboard.io/org/acme-inc/workspaces/acme/projects/backend/board/view-123',
      )
      expect(result).toEqual({
        kind: 'project',
        project: 'backend',
        projectViewId: 'view-123',
        workspace: 'acme',
      })
    })

    it('returns null for web URLs that do not match the project route', () => {
      expect(parseRocketboardReference('https://app.rocketboard.io/settings')).toBeNull()
    })

    it('decodes URI-encoded web URL segments', () => {
      const result = parseRocketboardReference(
        'https://app.rocketboard.io/org/lila%20games/workspaces/acme%20corp/projects/my%20project/board/view%20123',
      )
      expect(result).toEqual({
        kind: 'project',
        project: 'my project',
        projectViewId: 'view 123',
        workspace: 'acme corp',
      })
    })
  })

  describe('invalid URLs', () => {
    it('returns null for ftp:// protocol', () => {
      expect(parseRocketboardReference('ftp://example.com/foo')).toBeNull()
    })

    it('returns null for malformed URL', () => {
      expect(parseRocketboardReference('not://[invalid')).toBeNull()
    })
  })

  describe('non-URL strings', () => {
    it('returns null for a plain string without protocol', () => {
      expect(parseRocketboardReference('my-project')).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(parseRocketboardReference('')).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(parseRocketboardReference('   ')).toBeNull()
    })

    it('trims whitespace before parsing', () => {
      const result = parseRocketboardReference('  rocketboard://project/ws/proj  ')
      expect(result).toEqual({
        kind: 'project',
        project: 'proj',
        workspace: 'ws',
      })
    })
  })
})

// ---------------------------------------------------------------------------
// normalizeProjectScope
// ---------------------------------------------------------------------------

describe('normalizeProjectScope', () => {
  it('passes through a raw string project identifier', () => {
    const result = normalizeProjectScope({project: 'my-project'})
    expect(result).toEqual({project: 'my-project'})
  })

  it('extracts project and workspace from a rocketboard:// URL', () => {
    const result = normalizeProjectScope({
      project: 'rocketboard://project/ws/proj',
    })
    expect(result).toEqual({project: 'proj', workspace: 'ws'})
  })

  it('prefers the explicit workspace over the URL workspace', () => {
    const result = normalizeProjectScope({
      project: 'rocketboard://project/url-ws/proj',
      workspace: 'explicit-ws',
    })
    expect(result).toEqual({project: 'proj', workspace: 'explicit-ws'})
  })

  it('falls back to URL workspace when explicit workspace is omitted', () => {
    const result = normalizeProjectScope({
      project: 'rocketboard://project/url-ws/proj',
    })
    expect(result).toEqual({project: 'proj', workspace: 'url-ws'})
  })

  it('returns input unchanged when the URL parses to a non-project kind', () => {
    const result = normalizeProjectScope({
      project: 'rocketboard://card/ws/proj/card-1',
    })
    // card kind does not match project, so raw input is returned
    expect(result).toEqual({project: 'rocketboard://card/ws/proj/card-1'})
  })
})

// ---------------------------------------------------------------------------
// normalizeCardScope
// ---------------------------------------------------------------------------

describe('normalizeCardScope', () => {
  it('passes through a raw string card identifier', () => {
    const result = normalizeCardScope({card: 'RB-42'})
    expect(result).toEqual({card: 'RB-42'})
  })

  it('extracts card, project, workspace from a rocketboard://card URL', () => {
    const result = normalizeCardScope({
      card: 'rocketboard://card/ws/proj/card-id',
    })
    expect(result).toEqual({card: 'card-id', project: 'proj', workspace: 'ws'})
  })

  it('prefers explicit project/workspace over URL values', () => {
    const result = normalizeCardScope({
      card: 'rocketboard://card/url-ws/url-proj/card-id',
      project: 'explicit-proj',
      workspace: 'explicit-ws',
    })
    expect(result).toEqual({
      card: 'card-id',
      project: 'explicit-proj',
      workspace: 'explicit-ws',
    })
  })

  it('falls back to URL project when explicit project is omitted', () => {
    const result = normalizeCardScope({
      card: 'rocketboard://card/ws/url-proj/card-id',
    })
    expect(result).toEqual({card: 'card-id', project: 'url-proj', workspace: 'ws'})
  })
})

// ---------------------------------------------------------------------------
// normalizeDocumentScope
// ---------------------------------------------------------------------------

describe('normalizeDocumentScope', () => {
  it('extracts document UUID from rocketboard://document URL', () => {
    const result = normalizeDocumentScope({
      document: 'rocketboard://document/ws/proj/doc-uuid',
    })
    expect(result).toEqual({
      document: 'doc-uuid',
      project: 'proj',
      title: undefined,
      workspace: 'ws',
    })
  })

  it('uses title as reference when document is undefined', () => {
    const result = normalizeDocumentScope({
      title: 'rocketboard://document/ws/proj/doc-from-title',
    })
    expect(result).toEqual({
      document: 'doc-from-title',
      project: 'proj',
      title: 'rocketboard://document/ws/proj/doc-from-title',
      workspace: 'ws',
    })
  })

  it('handles a web project URL with projectViewId', () => {
    const result = normalizeDocumentScope({
      document: 'https://app.rocketboard.io/org/acme-inc/workspaces/acme/projects/backend/table/view-123',
    })
    expect(result).toEqual({
      document: 'https://app.rocketboard.io/org/acme-inc/workspaces/acme/projects/backend/table/view-123',
      project: 'backend',
      projectViewId: 'view-123',
      title: undefined,
      workspace: 'acme',
    })
  })

  it('returns input unchanged when no document or title is provided', () => {
    const result = normalizeDocumentScope({project: 'proj'})
    expect(result).toEqual({project: 'proj'})
  })

  it('returns input unchanged for a plain string document', () => {
    const result = normalizeDocumentScope({document: 'plain-doc-id', project: 'proj'})
    expect(result).toEqual({document: 'plain-doc-id', project: 'proj'})
  })
})

// ---------------------------------------------------------------------------
// normalizeSprintScope
// ---------------------------------------------------------------------------

describe('normalizeSprintScope', () => {
  it('normalizes project and passes through sprint string', () => {
    const result = normalizeSprintScope({
      project: 'my-project',
      sprint: 'active',
    })
    expect(result).toEqual({project: 'my-project', sprint: 'active', workspace: undefined})
  })

  it('omits sprint when not provided', () => {
    const result = normalizeSprintScope({project: 'my-project'})
    expect(result).toEqual({project: 'my-project', workspace: undefined})
    expect(result).not.toHaveProperty('sprint')
  })

  it('extracts sprint from a rocketboard://sprint URL', () => {
    const result = normalizeSprintScope({
      project: 'my-project',
      sprint: 'rocketboard://sprint/ws/proj/sprint-id',
    })
    expect(result).toEqual({
      project: 'my-project',
      sprint: 'sprint-id',
      workspace: 'ws',
    })
  })

  it('normalizes project URL and sprint URL together', () => {
    const result = normalizeSprintScope({
      project: 'rocketboard://project/ws/proj',
      sprint: 'rocketboard://sprint/ws2/proj2/sprint-abc',
    })
    expect(result).toEqual({
      project: 'proj',
      sprint: 'sprint-abc',
      workspace: 'ws',
    })
  })

  it('uses workspace from project URL when sprint URL has none', () => {
    const result = normalizeSprintScope({
      project: 'rocketboard://project/main-ws/proj',
      sprint: 'sprint-plain',
    })
    expect(result).toEqual({
      project: 'proj',
      sprint: 'sprint-plain',
      workspace: 'main-ws',
    })
  })
})
