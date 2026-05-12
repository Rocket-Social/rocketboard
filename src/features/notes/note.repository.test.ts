import {beforeEach, describe, expect, it, vi} from 'vitest'

const {
  callSingleMock,
  fromMock,
  getSupabaseBrowserClientMock,
} = vi.hoisted(() => ({
  callSingleMock: vi.fn(),
  fromMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    callSingle: callSingleMock,
  },
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

type QueryResult = {
  data: unknown
  error: {code?: string; details?: string | null; hint?: string | null; message: string} | null
}

function createNotesBuilder(
  result: QueryResult,
  options: {
    onInsert?: (payload: unknown) => void
    onUpdate?: (payload: unknown) => void
  } = {},
) {
  const builder: {
    eq: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    is: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  } = {
    eq: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      options.onInsert?.(payload)
      return builder
    }),
    is: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    update: vi.fn((payload: unknown) => {
      options.onUpdate?.(payload)
      return builder
    }),
  }

  return builder
}

function buildLegacyNoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    content: {type: 'doc', content: [{type: 'paragraph'}]},
    content_text: 'Legacy note body',
    created_at: '2026-04-08T00:00:00.000Z',
    deleted_at: null,
    folder_id: null,
    id: 'note-1',
    position: 0,
    title: 'Legacy note',
    updated_at: '2026-04-08T00:00:00.000Z',
    user_id: 'user-1',
    ...overrides,
  }
}

function buildBaseNoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    content_json: {type: 'doc', content: [{type: 'paragraph'}]},
    content_md: 'Base note body',
    created_at: '2026-04-08T00:00:00.000Z',
    deleted_at: null,
    folder_id: null,
    id: 'note-1',
    position: 0,
    title: 'Base note',
    updated_at: '2026-04-08T00:00:00.000Z',
    user_id: 'user-1',
    ...overrides,
  }
}

function buildFullNoteListRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    created_at: '2026-04-08T00:00:00.000Z',
    deleted_at: null,
    folder_id: null,
    id: 'note-1',
    position: 0,
    preview_text: 'Imported roadmap sync',
    source_connection_id: 'conn-1',
    source_created_at: '2026-04-08T00:00:00.000Z',
    source_id: 'source-1',
    source_metadata: {},
    source_provider: 'granola',
    source_updated_at: '2026-04-08T00:00:00.000Z',
    title: 'New Note',
    updated_at: '2026-04-08T00:00:00.000Z',
    user_id: 'user-1',
    ...overrides,
  }
}

async function loadRepository() {
  return import('./note.repository')
}

describe('noteRepository schema compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    callSingleMock.mockReset()
    fromMock.mockReset()
    getSupabaseBrowserClientMock.mockReset()
    getSupabaseBrowserClientMock.mockReturnValue({
      from: fromMock,
    })
  })

  it('selects summary columns on the full schema and derives display data without content_md', async () => {
    const fullSchemaBuilder = createNotesBuilder({
      data: [buildFullNoteListRow()],
      error: null,
    })

    fromMock.mockReturnValueOnce(fullSchemaBuilder)

    const {noteRepository} = await loadRepository()
    const notes = await noteRepository.listNotes('user-1')

    expect(fullSchemaBuilder.select).toHaveBeenCalledWith(expect.not.stringContaining('content_md'))
    expect(notes).toEqual([
      expect.objectContaining({
        displayTitle: 'Imported roadmap sync',
        id: 'note-1',
        previewText: 'Imported roadmap sync',
        title: 'New Note',
      }),
    ])
  })

  it('falls back to legacy note columns when content_md is missing', async () => {
    const fullSchemaBuilder = createNotesBuilder({
      data: null,
      error: {message: 'column notes.preview_text does not exist'},
    })
    const baseSchemaBuilder = createNotesBuilder({
      data: null,
      error: {message: 'column notes.content_md does not exist'},
    })
    const legacySchemaBuilder = createNotesBuilder({
      data: [buildLegacyNoteRow()],
      error: null,
    })

    fromMock
      .mockReturnValueOnce(fullSchemaBuilder)
      .mockReturnValueOnce(baseSchemaBuilder)
      .mockReturnValueOnce(legacySchemaBuilder)

    const {noteRepository} = await loadRepository()
    const notes = await noteRepository.listNotes('user-1')

    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      displayTitle: 'Legacy note',
      id: 'note-1',
      previewText: 'Legacy note body',
      title: 'Legacy note',
    })
    expect(fullSchemaBuilder.select).toHaveBeenCalledWith(expect.stringContaining('preview_text'))
    expect(baseSchemaBuilder.select).toHaveBeenCalledWith(expect.stringContaining('content_md'))
    expect(legacySchemaBuilder.select).toHaveBeenCalledWith(expect.stringContaining('content_text'))
  })

  it('falls back to base note columns when Granola metadata columns are missing', async () => {
    const fullSchemaBuilder = createNotesBuilder({
      data: null,
      error: {message: 'column notes.preview_text does not exist'},
    })
    const baseSchemaBuilder = createNotesBuilder({
      data: [buildBaseNoteRow()],
      error: null,
    })

    fromMock
      .mockReturnValueOnce(fullSchemaBuilder)
      .mockReturnValueOnce(baseSchemaBuilder)

    const {noteRepository} = await loadRepository()
    const notes = await noteRepository.listNotes('user-1')

    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      displayTitle: 'Base note',
      id: 'note-1',
      previewText: 'Base note body',
      sourceProvider: null,
      title: 'Base note',
    })
    expect(fullSchemaBuilder.select).toHaveBeenCalledWith(expect.stringContaining('preview_text'))
    expect(baseSchemaBuilder.select).toHaveBeenCalledWith(expect.not.stringContaining('preview_text'))
    expect(baseSchemaBuilder.select).toHaveBeenCalledWith(expect.stringContaining('content_md'))
  })

  it('reuses the detected legacy schema for content updates', async () => {
    const currentSchemaBuilder = createNotesBuilder({
      data: null,
      error: {message: 'column notes.content_md does not exist'},
    })
    const legacySchemaBuilder = createNotesBuilder({
      data: [buildLegacyNoteRow()],
      error: null,
    })

    let updatePayload: unknown
    const updatedRow = buildLegacyNoteRow({
      content: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Updated'}]}]},
      content_text: 'Updated from fallback',
    })
    const legacyUpdateBuilder = createNotesBuilder(
      {
        data: updatedRow,
        error: null,
      },
      {
        onUpdate: (payload) => {
          updatePayload = payload
        },
      },
    )

    fromMock
      .mockReturnValueOnce(currentSchemaBuilder)
      .mockReturnValueOnce(legacySchemaBuilder)
      .mockReturnValueOnce(legacyUpdateBuilder)

    const {noteRepository} = await loadRepository()
    await noteRepository.listNotes('user-1')
    const updated = await noteRepository.updateNote('note-1', {
      contentJson: {type: 'doc', content: []},
      contentMd: 'Updated from fallback',
    })

    expect(updatePayload).toEqual({
      content: {type: 'doc', content: []},
      content_text: 'Updated from fallback',
    })
    expect(updated.contentMd).toBe('Updated from fallback')
  })

  it('reuses the detected base schema for content updates', async () => {
    const fullSchemaBuilder = createNotesBuilder({
      data: null,
      error: {message: 'column notes.source_provider does not exist'},
    })
    const baseSchemaBuilder = createNotesBuilder({
      data: [buildBaseNoteRow()],
      error: null,
    })

    let updatePayload: unknown
    const updatedRow = buildBaseNoteRow({
      content_json: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Updated'}]}]},
      content_md: 'Updated from base fallback',
    })
    const baseUpdateBuilder = createNotesBuilder(
      {
        data: updatedRow,
        error: null,
      },
      {
        onUpdate: (payload) => {
          updatePayload = payload
        },
      },
    )

    fromMock
      .mockReturnValueOnce(fullSchemaBuilder)
      .mockReturnValueOnce(baseSchemaBuilder)
      .mockReturnValueOnce(baseUpdateBuilder)

    const {noteRepository} = await loadRepository()
    await noteRepository.listNotes('user-1')
    const updated = await noteRepository.updateNote('note-1', {
      contentJson: {type: 'doc', content: []},
      contentMd: 'Updated from base fallback',
    })

    expect(updatePayload).toEqual({
      content_json: {type: 'doc', content: []},
      content_md: 'Updated from base fallback',
    })
    expect(updated.contentMd).toBe('Updated from base fallback')
  })
})
