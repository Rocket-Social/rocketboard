import {describe, expect, it} from 'vitest'

import {
  buildGranolaImportedNote,
  coerceGranolaConnectionStatus,
  GRANOLA_IMPORT_FORMAT_VERSION,
  getGranolaImportFormatVersion,
  isCurrentGranolaImportVersion,
  pickGranolaPrimaryFolderName,
  pickGranolaPreviewText,
  shouldRefreshGranolaImportedNote,
  stripGranolaMarkdown,
} from '../granola-import.shared'

function makeGranolaNote(overrides: Partial<Parameters<typeof buildGranolaImportedNote>[0]> = {}) {
  return {
    attendees: [
      {email: 'alex@example.com', name: 'Alex'},
      {email: 'sam@example.com', name: 'Sam'},
    ],
    calendar_event: {
      calendar_event_id: 'evt_123',
      event_title: 'Roadmap review',
      invitees: [{email: 'alex@example.com'}],
      organiser: 'organiser@example.com',
      scheduled_end_time: '2026-04-08T16:00:00Z',
      scheduled_start_time: '2026-04-08T15:00:00Z',
    },
    created_at: '2026-04-08T15:00:00Z',
    folder_membership: [{id: 'fol_1', name: 'Leadership', object: 'folder' as const}],
    id: 'not_1d3tmYTlCICgjy',
    object: 'note' as const,
    owner: {
      email: 'owner@example.com',
      name: 'Owner',
    },
    summary_markdown: '## Decisions\n\n- Ship import\n- Keep notes read-only',
    summary_text: 'Ship the Granola import and keep synced notes read-only.',
    title: 'Granola import',
    transcript: [
      {
        end_time: '2026-04-08T15:02:00Z',
        speaker: {source: 'microphone'},
        start_time: '2026-04-08T15:01:00Z',
        text: 'We should ship the importer this week.',
      },
      {
        end_time: '2026-04-08T15:03:00Z',
        speaker: {source: 'speaker'},
        start_time: '2026-04-08T15:02:30Z',
        text: 'Agreed, but keep imported notes read-only.',
      },
    ],
    updated_at: '2026-04-08T16:00:00Z',
    ...overrides,
  }
}

describe('stripGranolaMarkdown', () => {
  it('removes basic markdown formatting for previews', () => {
    expect(stripGranolaMarkdown('## Heading\n\n- **Bold** [link](https://example.com)')).toBe(
      'Heading Bold link',
    )
  })
})

describe('pickGranolaPreviewText', () => {
  it('prefers summary text when present', () => {
    expect(pickGranolaPreviewText(makeGranolaNote())).toBe(
      'Ship the Granola import and keep synced notes read-only.',
    )
  })

  it('falls back to transcript text when there is no summary', () => {
    expect(
      pickGranolaPreviewText(
        makeGranolaNote({
          summary_markdown: null,
          summary_text: '',
        }),
      ),
    ).toBe('We should ship the importer this week.')
  })
})

describe('pickGranolaPrimaryFolderName', () => {
  it('returns the first non-empty Granola folder name', () => {
    expect(pickGranolaPrimaryFolderName(
      makeGranolaNote({
        folder_membership: [
          {id: 'fol_blank', name: '   ', object: 'folder' as const},
          {id: 'fol_1', name: ' GameMakers ', object: 'folder' as const},
          {id: 'fol_2', name: 'Recruiting', object: 'folder' as const},
        ],
      }),
    )).toBe('GameMakers')
  })

  it('returns null when Granola does not provide folder membership', () => {
    expect(pickGranolaPrimaryFolderName(
      makeGranolaNote({folder_membership: []}),
    )).toBeNull()
  })
})

describe('buildGranolaImportedNote', () => {
  it('builds note content with meeting details, summary, and transcript', () => {
    const imported = buildGranolaImportedNote(makeGranolaNote())

    expect(imported.title).toBe('Granola import')
    expect(imported.previewText).toBe(
      'Ship the Granola import and keep synced notes read-only.',
    )
    expect(imported.contentMd).toContain('## Meeting details')
    expect(imported.contentMd).toContain('- Attendees: Alex (alex@example.com), Sam (sam@example.com)')
    expect(imported.contentMd).toContain('## Summary')
    expect(imported.contentMd).toContain('## Decisions')
    expect(imported.contentMd).toContain('## Transcript')
    expect(imported.contentMd).toContain('**You:** We should ship the importer this week.')
    expect(imported.sourceMetadata.importVersion).toBe(GRANOLA_IMPORT_FORMAT_VERSION)
    expect(imported.sourceMetadata.folderNames).toEqual(['Leadership'])
  })

  it('falls back cleanly when only transcript data is available', () => {
    const imported = buildGranolaImportedNote(
      makeGranolaNote({
        summary_markdown: null,
        summary_text: '',
      }),
    )

    expect(imported.previewText).toBe('We should ship the importer this week.')
    expect(imported.contentMd).toContain('No summary available.')
  })

  it('preserves multiple Granola folders in metadata and meeting details', () => {
    const imported = buildGranolaImportedNote(
      makeGranolaNote({
        folder_membership: [
          {id: 'fol_1', name: 'Leadership', object: 'folder' as const},
          {id: 'fol_2', name: 'Q2 Planning', object: 'folder' as const},
        ],
      }),
    )

    expect(imported.sourceMetadata.folderNames).toEqual(['Leadership', 'Q2 Planning'])
    expect(imported.contentMd).toContain('Granola folders: Leadership, Q2 Planning')
  })
})

describe('coerceGranolaConnectionStatus', () => {
  it('normalizes unexpected statuses to disconnected', () => {
    expect(coerceGranolaConnectionStatus('syncing')).toBe('disconnected')
    expect(coerceGranolaConnectionStatus(null)).toBe('disconnected')
  })
})

describe('Granola import format version helpers', () => {
  it('reads the current import format version from source metadata', () => {
    expect(getGranolaImportFormatVersion({importVersion: GRANOLA_IMPORT_FORMAT_VERSION})).toBe(
      GRANOLA_IMPORT_FORMAT_VERSION,
    )
    expect(isCurrentGranolaImportVersion({importVersion: GRANOLA_IMPORT_FORMAT_VERSION})).toBe(true)
  })

  it('treats missing or stale import metadata as needing a refresh', () => {
    expect(isCurrentGranolaImportVersion({})).toBe(false)
    expect(
      shouldRefreshGranolaImportedNote({
        localSourceUpdatedAt: '2026-04-08T16:00:00Z',
        remoteSourceUpdatedAt: '2026-04-08T16:00:00Z',
        sourceMetadata: {},
      }),
    ).toBe(true)
  })

  it('skips refresh when the import version is current and the source is unchanged', () => {
    expect(
      shouldRefreshGranolaImportedNote({
        localSourceUpdatedAt: '2026-04-08T16:00:00Z',
        remoteSourceUpdatedAt: '2026-04-08T16:00:00Z',
        sourceMetadata: {importVersion: GRANOLA_IMPORT_FORMAT_VERSION},
      }),
    ).toBe(false)
  })
})
