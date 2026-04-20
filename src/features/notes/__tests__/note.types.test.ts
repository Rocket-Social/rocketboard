import {describe, expect, it} from 'vitest'

import {
  formatNoteDate,
  getNoteDisplayTitle,
  getNotePreview,
  isImportedNote,
  resolveActiveNoteId,
  sortNotes,
  type NoteListItem,
} from '../note.types'

// ============================================================
// getNoteDisplayTitle
// ============================================================

describe('getNoteDisplayTitle', () => {
  it('prefers a precomputed display title when present', () => {
    expect(getNoteDisplayTitle({
      contentMd: 'Body content',
      displayTitle: 'Pinned title',
      title: 'New Note',
    })).toBe('Pinned title')
  })

  it('returns trimmed title when present', () => {
    expect(getNoteDisplayTitle({title: '  My Title  ', contentMd: 'some content'})).toBe('My Title')
  })

  it('falls back to first line of content when title is "New Note"', () => {
    expect(getNoteDisplayTitle({title: 'New Note', contentMd: 'First line\nSecond line'})).toBe('First line')
  })

  it('falls back to first line of content when title is empty', () => {
    expect(getNoteDisplayTitle({title: '', contentMd: 'Content here'})).toBe('Content here')
  })

  it('truncates long first line to 50 chars', () => {
    const longContent = 'A'.repeat(60)
    const result = getNoteDisplayTitle({title: '', contentMd: longContent})
    expect(result).toBe('A'.repeat(50) + '...')
  })

  it('returns "New Note" when both title and content are empty', () => {
    expect(getNoteDisplayTitle({title: '', contentMd: ''})).toBe('New Note')
  })

  it('returns "New Note" when content is whitespace only', () => {
    expect(getNoteDisplayTitle({title: '', contentMd: '   \n  \n  '})).toBe('New Note')
  })
})

// ============================================================
// getNotePreview
// ============================================================

describe('getNotePreview', () => {
  it('returns first line of content', () => {
    expect(getNotePreview({contentMd: 'First line\nSecond line'})).toBe('First line')
  })

  it('returns empty string for empty content', () => {
    expect(getNotePreview({contentMd: ''})).toBe('')
  })

  it('truncates long lines to maxLength', () => {
    const longLine = 'B'.repeat(100)
    const result = getNotePreview({contentMd: longLine}, 80)
    expect(result).toBe('B'.repeat(80) + '...')
  })

  it('returns full line if under maxLength', () => {
    expect(getNotePreview({contentMd: 'Short line'}, 80)).toBe('Short line')
  })

  it('prefers previewText when present', () => {
    expect(getNotePreview({contentMd: 'Body line', previewText: 'Preview line'})).toBe('Preview line')
  })

  it('returns empty string for whitespace-only content', () => {
    expect(getNotePreview({contentMd: '   '})).toBe('')
  })
})

// ============================================================
// formatNoteDate
// ============================================================

describe('formatNoteDate', () => {
  it('returns "Just now" for recent timestamps', () => {
    const now = new Date().toISOString()
    expect(formatNoteDate(now)).toBe('Just now')
  })

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatNoteDate(fiveMinAgo)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatNoteDate(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatNoteDate(twoDaysAgo)).toBe('2d ago')
  })

  it('returns formatted date for > 7 days', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const result = formatNoteDate(twoWeeksAgo)
    // Should be a date string like "3/11/2026"
    expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
  })
})

// ============================================================
// sortNotes
// ============================================================

describe('sortNotes', () => {
  const makeNote = (overrides: Partial<NoteListItem>): NoteListItem => ({
    createdAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    displayTitle: '',
    folderId: null,
    id: crypto.randomUUID(),
    position: 0,
    previewText: '',
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    title: 'Untitled',
    updatedAt: '2026-01-01T00:00:00Z',
    userId: 'user1',
    ...overrides,
  })

  it('sorts by updatedAt descending', () => {
    const notes = [
      makeNote({title: 'Old', updatedAt: '2026-01-01T00:00:00Z'}),
      makeNote({title: 'New', updatedAt: '2026-03-01T00:00:00Z'}),
      makeNote({title: 'Mid', updatedAt: '2026-02-01T00:00:00Z'}),
    ]
    const sorted = sortNotes(notes, 'updatedAt')
    expect(sorted.map((n) => n.title)).toEqual(['New', 'Mid', 'Old'])
  })

  it('sorts by createdAt descending', () => {
    const notes = [
      makeNote({title: 'First', createdAt: '2026-01-01T00:00:00Z'}),
      makeNote({title: 'Last', createdAt: '2026-03-01T00:00:00Z'}),
    ]
    const sorted = sortNotes(notes, 'createdAt')
    expect(sorted.map((n) => n.title)).toEqual(['Last', 'First'])
  })

  it('sorts by title ascending', () => {
    const notes = [
      makeNote({title: 'Zebra'}),
      makeNote({title: 'Apple'}),
      makeNote({title: 'Mango'}),
    ]
    const sorted = sortNotes(notes, 'title')
    expect(sorted.map((n) => n.title)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('does not mutate the original array', () => {
    const notes = [
      makeNote({title: 'B', updatedAt: '2026-01-01T00:00:00Z'}),
      makeNote({title: 'A', updatedAt: '2026-02-01T00:00:00Z'}),
    ]
    const original = [...notes]
    sortNotes(notes, 'updatedAt')
    expect(notes.map((n) => n.title)).toEqual(original.map((n) => n.title))
  })

  it('sorts imported notes by sourceUpdatedAt when available', () => {
    const notes = [
      makeNote({title: 'Local', updatedAt: '2026-03-01T00:00:00Z'}),
      makeNote({
        title: 'Imported',
        sourceProvider: 'granola',
        sourceUpdatedAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ]

    expect(sortNotes(notes, 'updatedAt').map((note) => note.title)).toEqual([
      'Imported',
      'Local',
    ])
  })
})

// ============================================================
// resolveActiveNoteId
// ============================================================

describe('resolveActiveNoteId', () => {
  const makeNote = (id: string) => ({id})

  it('prefers the requested route note when it exists', () => {
    expect(
      resolveActiveNoteId([makeNote('note-1'), makeNote('note-2')], 'note-2', 'note-1'),
    ).toBe('note-1')
  })

  it('falls back to the first accessible note when the requested route note is missing', () => {
    expect(
      resolveActiveNoteId([makeNote('note-1'), makeNote('note-2')], 'note-2', 'missing-note'),
    ).toBe('note-1')
  })

  it('preserves the current active note when there is no requested route note', () => {
    expect(
      resolveActiveNoteId([makeNote('note-1'), makeNote('note-2')], 'note-2'),
    ).toBe('note-2')
  })

  it('falls back to the first note when the current active note is missing', () => {
    expect(
      resolveActiveNoteId([makeNote('note-1'), makeNote('note-2')], 'missing-note'),
    ).toBe('note-1')
  })

  it('returns null when there are no accessible notes', () => {
    expect(resolveActiveNoteId([], 'note-1', 'note-2')).toBeNull()
  })
})

describe('isImportedNote', () => {
  it('returns true for mirrored Granola notes', () => {
    expect(isImportedNote({sourceProvider: 'granola', sourceDetached: false})).toBe(true)
  })

  it('returns false for captured (detached) Granola notes', () => {
    expect(isImportedNote({sourceProvider: 'granola', sourceDetached: true})).toBe(false)
  })

  it('returns false for native notes', () => {
    expect(isImportedNote({sourceProvider: null})).toBe(false)
  })

  it('returns false when sourceDetached is undefined (backward compat)', () => {
    expect(isImportedNote({sourceProvider: null, sourceDetached: undefined})).toBe(false)
  })
})
