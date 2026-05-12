// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import {render, screen, waitFor, within} from '@testing-library/react'
import {useEffect, useRef} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {NotesView} from './NotesView'
import type {GranolaConnectionRecord} from './granola-import.shared'
import type {NoteFolderRecord, NoteListItem, NoteRecord} from './note.types'

const useNoteQueryMock = vi.fn()
type NoteListItemFixture = NoteListItem & Partial<Pick<NoteRecord, 'contentJson' | 'contentMd'>>

const createNoteMutateMock = vi.fn()
const deleteNoteMutateMock = vi.fn()
const createFolderMutateMock = vi.fn()
const updateFolderMutateMock = vi.fn()
const deleteFolderMutateMock = vi.fn()
const reorderNotesMutateMock = vi.fn()
const reorderFoldersMutateMock = vi.fn()
const updateNoteMutateMock = vi.fn()

vi.mock('../../components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    confirmDialogProps: null,
  }),
}))

vi.mock('../shell/CreateDialogsContext', () => ({
  useCreateDialogs: () => ({
    openCommandPalette: vi.fn(),
  }),
}))

function RichTextEditorMock({focusRequestKey}: {focusRequestKey?: number}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRequestKeyRef = useRef(focusRequestKey)

  useEffect(() => {
    if (focusRequestKey == null || previousFocusRequestKeyRef.current === focusRequestKey) {
      return
    }

    previousFocusRequestKeyRef.current = focusRequestKey
    editorRef.current?.focus()
  }, [focusRequestKey])

  return <div data-testid='rich-text-editor' ref={editorRef} tabIndex={-1}/>
}

vi.mock('../rich-text/RichTextEditor', () => ({
  RichTextEditor: RichTextEditorMock,
}))

vi.mock('./note.queries', () => ({
  useCreateNoteMutation: () => ({mutate: createNoteMutateMock}),
  useDeleteNoteMutation: () => ({mutate: deleteNoteMutateMock}),
  useCreateFolderMutation: () => ({mutate: createFolderMutateMock}),
  useUpdateFolderMutation: () => ({mutate: updateFolderMutateMock}),
  useDeleteFolderMutation: () => ({mutate: deleteFolderMutateMock}),
  useReorderNotesMutation: () => ({mutate: reorderNotesMutateMock}),
  useReorderFoldersMutation: () => ({mutate: reorderFoldersMutateMock}),
  useUpdateNoteMutation: () => ({mutate: updateNoteMutateMock}),
  useNoteQuery: (...args: unknown[]) => useNoteQueryMock(...args),
}))

function makeFolder(overrides: Partial<NoteFolderRecord>): NoteFolderRecord {
  return {
    createdAt: '2026-04-08T00:00:00Z',
    id: 'folder-1',
    name: 'Folder',
    parentId: null,
    position: 0,
    updatedAt: '2026-04-08T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

function makeNote(overrides: Partial<NoteListItemFixture> = {}): NoteListItemFixture {
  const title = overrides.title ?? 'Roadmap review'

  return {
    createdAt: '2026-04-08T00:00:00Z',
    deletedAt: null,
    displayTitle: overrides.displayTitle ?? title,
    folderId: 'folder-1',
    id: 'note-1',
    position: 0,
    previewText: overrides.previewText ?? 'Meeting notes body',
    sourceConnectionId: 'conn-1',
    sourceCreatedAt: '2026-04-08T00:00:00Z',
    sourceDetached: false,
    sourceId: 'source-1',
    sourceMetadata: {},
    sourceProvider: 'granola',
    sourceUpdatedAt: '2026-04-08T00:00:00Z',
    title,
    updatedAt: '2026-04-08T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

function makeEditableNote(overrides: Partial<NoteListItemFixture> = {}): NoteListItemFixture {
  return makeNote({
    folderId: null,
    sourceConnectionId: null,
    sourceCreatedAt: null,
    sourceDetached: false,
    sourceId: null,
    sourceMetadata: {},
    sourceProvider: null,
    sourceUpdatedAt: null,
    ...overrides,
  })
}

function makeNoteRecord(note: NoteListItemFixture): NoteRecord {
  return {
    ...note,
    contentMd: note.contentMd ?? 'Meeting notes body',
    contentJson: note.contentJson ?? {type: 'doc', content: []},
  }
}

function makeConnection(overrides: Partial<GranolaConnectionRecord> = {}): GranolaConnectionRecord {
  return {
    authMethod: 'api_key',
    backfillCursor: null,
    createdAt: '2026-04-08T00:00:00Z',
    id: 'conn-1',
    initialImportCompletedAt: '2026-04-08T00:10:00Z',
    lastSourceUpdatedAt: '2026-04-08T00:10:00Z',
    lastSyncError: null,
    lastSyncFinishedAt: '2026-04-08T00:10:00Z',
    lastSyncStartedAt: '2026-04-08T00:00:00Z',
    mode: 'mirror',
    provider: 'granola',
    rootFolderId: 'granola-root',
    status: 'connected',
    updatedAt: '2026-04-08T00:10:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

describe('NotesView', () => {
  beforeEach(() => {
    localStorage.clear()
    useNoteQueryMock.mockReset()
    createNoteMutateMock.mockReset()
    deleteNoteMutateMock.mockReset()
    createFolderMutateMock.mockReset()
    updateFolderMutateMock.mockReset()
    deleteFolderMutateMock.mockReset()
    reorderNotesMutateMock.mockReset()
    reorderFoldersMutateMock.mockReset()
    updateNoteMutateMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nested Granola folders and their imported notes', async () => {
    const importedNote = makeNote({folderId: 'gamemakers'})
    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(importedNote),
      refetch: vi.fn(),
      isPending: false,
    })

    render(
      <NotesView
        folders={[
          makeFolder({id: 'notes-root', name: 'Notes', position: 0}),
          makeFolder({id: 'granola-root', name: 'Granola', position: 1}),
          makeFolder({id: 'gamemakers', name: 'GameMakers', parentId: 'granola-root', position: 0}),
        ]}
        granolaConnection={makeConnection()}
        isLoading={false}
        notes={[importedNote]}
        userId='user-1'
      />,
    )

    expect(await screen.findByLabelText('Reorder folder Notes')).toBeInTheDocument()
    expect(await screen.findByLabelText('Reorder folder Granola')).toBeInTheDocument()
    const nestedFolderLabel = await screen.findByText('GameMakers')
    expect(nestedFolderLabel).toBeInTheDocument()
    expect(await screen.findByText('Roadmap review')).toBeInTheDocument()

    const notesRow = screen.getByLabelText('Reorder folder Notes').closest('[data-folder-depth="0"]') as HTMLElement
    const granolaRow = screen.getByText('Granola').closest('[data-folder-depth="0"]') as HTMLElement
    expect(notesRow).toBeInTheDocument()
    expect(granolaRow).toBeInTheDocument()
    expect(notesRow).toHaveClass('gap-0')
    expect(granolaRow).toHaveClass('gap-0')
    expect(notesRow.firstElementChild).toHaveStyle({height: '20px', width: '20px'})
    expect(granolaRow.firstElementChild).toHaveStyle({height: '20px', width: '20px'})
    expect(within(notesRow).getByLabelText('Reorder folder Notes')).toBeInTheDocument()
    expect(within(granolaRow).getByLabelText('Reorder folder Granola')).toBeInTheDocument()
    const nestedFolderWrapper = nestedFolderLabel.closest('[data-folder-depth="1"]') as HTMLElement
    const nestedFolderHandle = within(nestedFolderWrapper).getByLabelText('Reorder folder GameMakers')
    const nestedFolderButton = nestedFolderLabel.closest('button') as HTMLElement
    const indentSpacer = nestedFolderButton.firstElementChild as HTMLElement

    expect(nestedFolderWrapper).not.toHaveStyle({paddingLeft: '36px'})
    expect(nestedFolderHandle).toHaveStyle({height: '20px', width: '20px'})
    expect(indentSpacer).toHaveAttribute('data-folder-indent-spacer', '1')
    expect(indentSpacer).toHaveStyle({width: '22px'})
    expect(screen.getAllByTitle(/^Synced$/)).toHaveLength(2)
    expect(screen.queryByText(/^Synced$/)).not.toBeInTheDocument()
  })

  it('keeps managed imports collapsed on cold load when another note is active', async () => {
    const personalNote = makeNote({
      displayTitle: 'Personal note',
      folderId: 'notes-root',
      id: 'note-1',
      previewText: 'Personal note',
      sourceConnectionId: null,
      sourceCreatedAt: null,
      sourceDetached: false,
      sourceId: null,
      sourceMetadata: {},
      sourceProvider: null,
      sourceUpdatedAt: null,
      title: 'Personal note',
    })
    const importedNote = makeNote({
      displayTitle: 'Imported roadmap review',
      folderId: 'granola-root',
      id: 'note-2',
    })

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(personalNote),
      error: null,
      refetch: vi.fn(),
      isPending: false,
    })

    render(
      <NotesView
        activeNoteIdFromRoute='note-1'
        folders={[
          makeFolder({id: 'notes-root', name: 'Notes', position: 0}),
          makeFolder({id: 'granola-root', name: 'Granola', position: 1}),
        ]}
        granolaConnection={makeConnection()}
        isLoading={false}
        notes={[personalNote, importedNote]}
        userId='user-1'
      />,
    )

    expect(screen.getByText('Granola')).toBeInTheDocument()
    expect(screen.queryByText('Imported roadmap review')).not.toBeInTheDocument()
  })

  it('auto-expands all ancestors needed to reveal the active imported note', async () => {
    const importedNote = makeNote({
      displayTitle: 'Deep import',
      folderId: 'grandchild',
      id: 'note-2',
      title: 'Deep import',
    })

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(importedNote),
      error: null,
      refetch: vi.fn(),
      isPending: false,
    })

    render(
      <NotesView
        activeNoteIdFromRoute='note-2'
        folders={[
          makeFolder({id: 'notes-root', name: 'Notes', position: 0}),
          makeFolder({id: 'granola-root', name: 'Granola', position: 1}),
          makeFolder({id: 'parent', name: 'Parent', parentId: 'granola-root', position: 0}),
          makeFolder({id: 'grandchild', name: 'Grandchild', parentId: 'parent', position: 0}),
        ]}
        granolaConnection={makeConnection()}
        isLoading={false}
        notes={[importedNote]}
        userId='user-1'
      />,
    )

    expect(await screen.findByText('Grandchild')).toBeInTheDocument()
    expect(await screen.findByText('Deep import')).toBeInTheDocument()
  })

  it('renders an icon-only syncing indicator with hover copy for managed folders', () => {
    useNoteQueryMock.mockReturnValue({
      data: null,
      refetch: vi.fn(),
      isPending: false,
    })

    render(
      <NotesView
        folders={[makeFolder({id: 'granola-root', name: 'Granola'})]}
        granolaConnection={makeConnection()}
        granolaSyncMessage='Imported 3 Granola notes so far.'
        isGranolaSyncing={true}
        isLoading={false}
        notes={[]}
        userId='user-1'
      />,
    )

    expect(screen.getByTitle('Sync in progress. Imported 3 Granola notes so far.')).toBeInTheDocument()
    expect(screen.queryByText(/^Synced$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Syncing$/)).not.toBeInTheDocument()
  })

  it('keeps all top-level note rows on the same layout contract', () => {
    const currentNote = makeNote({
      folderId: null,
      sourceConnectionId: null,
      sourceCreatedAt: null,
      sourceDetached: false,
      sourceId: null,
      sourceMetadata: {},
      sourceProvider: null,
      sourceUpdatedAt: null,
      title: 'Inbox note',
    })

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(currentNote),
      refetch: vi.fn(),
      isPending: false,
    })

    render(
      <NotesView
        folders={[
          makeFolder({id: 'notes-root', name: 'Notes', position: 0}),
          makeFolder({id: 'granola-root', name: 'Granola', position: 1}),
        ]}
        granolaConnection={makeConnection()}
        isLoading={false}
        notes={[currentNote]}
        userId='user-1'
      />,
    )

    const notesRow = screen.getByLabelText('Reorder folder Notes').closest('[data-folder-depth="0"]') as HTMLElement
    const granolaRow = screen.getByText('Granola').closest('[data-folder-depth="0"]') as HTMLElement
    const unfiledRow = screen.getByText('Unfiled').closest('[data-folder-depth="0"]') as HTMLElement

    expect(within(unfiledRow).getByLabelText('Reorder folder Unfiled')).toBeInTheDocument()

    for (const row of [notesRow, granolaRow, unfiledRow]) {
      expect(row).toBeInTheDocument()
      expect(row).toHaveClass('gap-0')
      expect(row).toHaveStyle({paddingLeft: '1px', paddingRight: '8px'})
      expect(row.firstElementChild).toHaveStyle({height: '20px', width: '20px'})
    }
  })

  it('restores the saved top-level position for the unfiled row', () => {
    const currentNote = makeNote({
      folderId: null,
      sourceConnectionId: null,
      sourceCreatedAt: null,
      sourceDetached: false,
      sourceId: null,
      sourceMetadata: {},
      sourceProvider: null,
      sourceUpdatedAt: null,
      title: 'Inbox note',
    })

    localStorage.setItem('rocketboard:notesState:user-1', JSON.stringify({
      activeNoteId: null,
      expandedFolderIds: ['notes-root', 'granola-root', '__unfiled__'],
      sortBy: 'updatedAt',
      unfiledTopLevelPosition: 0,
    }))

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(currentNote),
      refetch: vi.fn(),
      isPending: false,
    })

    const {container} = render(
      <NotesView
        folders={[
          makeFolder({id: 'notes-root', name: 'Notes', position: 0}),
          makeFolder({id: 'granola-root', name: 'Granola', position: 1}),
        ]}
        granolaConnection={makeConnection()}
        isLoading={false}
        notes={[currentNote]}
        userId='user-1'
      />,
    )

    const topLevelRows = Array.from(container.querySelectorAll('[data-folder-depth="0"]')) as HTMLElement[]
    expect(topLevelRows).toHaveLength(3)
    expect(topLevelRows[0]).toHaveTextContent('Unfiled')
    expect(topLevelRows[1]).toHaveTextContent('Notes')
    expect(topLevelRows[2]).toHaveTextContent('Granola')
  })

  it('navigates to the clicked note instead of reverting to the route-selected note', async () => {
    const user = userEvent.setup()
    const handleActiveNoteIdChange = vi.fn()
    const currentNote = makeNote({
      folderId: null,
      id: 'note-1',
      sourceConnectionId: null,
      sourceCreatedAt: null,
      sourceDetached: false,
      sourceId: null,
      sourceMetadata: {},
      sourceProvider: null,
      sourceUpdatedAt: null,
      title: 'Links',
    })
    const importedNote = makeNote({
      folderId: 'granola-root',
      id: 'note-2',
      title: 'Zoom60 - Sarah Judge and Jane',
    })

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(currentNote),
      refetch: vi.fn(),
      isPending: false,
    })

    render(
      <NotesView
        activeNoteIdFromRoute='note-1'
        folders={[makeFolder({id: 'granola-root', name: 'Granola'})]}
        granolaConnection={makeConnection()}
        isLoading={false}
        notes={[currentNote, importedNote]}
        onActiveNoteIdChange={handleActiveNoteIdChange}
        userId='user-1'
      />,
    )

    await user.click(screen.getByText('Granola').closest('button') as HTMLElement)
    await user.click(screen.getByRole('button', {name: /Zoom60 - Sarah Judge and Jane/i}))

    expect(handleActiveNoteIdChange).toHaveBeenCalledWith('note-2')
  })

  it('refetches the visible imported note when Granola sync finishes', () => {
    const refetch = vi.fn()
    const importedNote = makeNote({folderId: 'granola-root'})

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(importedNote),
      refetch,
      isPending: false,
    })

    const {rerender} = render(
      <NotesView
        activeNoteIdFromRoute='note-1'
        folders={[makeFolder({id: 'granola-root', name: 'Granola'})]}
        granolaConnection={makeConnection()}
        isGranolaSyncing={true}
        isLoading={false}
        notes={[importedNote]}
        userId='user-1'
      />,
    )

    rerender(
      <NotesView
        activeNoteIdFromRoute='note-1'
        folders={[makeFolder({id: 'granola-root', name: 'Granola'})]}
        granolaConnection={makeConnection()}
        isGranolaSyncing={false}
        isLoading={false}
        notes={[importedNote]}
        userId='user-1'
      />,
    )

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('downloads the active note as markdown from the note actions menu', async () => {
    const user = userEvent.setup()
    const editableNote = makeNote({
      contentMd: '## Updated draft',
      folderId: null,
      previewText: 'Updated draft',
      sourceConnectionId: null,
      sourceCreatedAt: null,
      sourceDetached: false,
      sourceId: null,
      sourceMetadata: {},
      sourceProvider: null,
      sourceUpdatedAt: null,
      title: 'Sprint / Notes',
    })

    useNoteQueryMock.mockReturnValue({
      data: makeNoteRecord(editableNote),
      refetch: vi.fn(),
      isPending: false,
    })

    class MockBlob {
      parts: BlobPart[]
      type: string

      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        this.parts = parts
        this.type = options?.type ?? ''
      }
    }

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalBlob = globalThis.Blob
    const createObjectURLMock = vi.fn((_blob: MockBlob) => 'blob:note-markdown')
    const revokeObjectURLMock = vi.fn((_url: string) => undefined)
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
      writable: true,
    })
    Object.defineProperty(globalThis, 'Blob', {
      configurable: true,
      value: MockBlob,
      writable: true,
    })

    try {
      render(
        <NotesView
          activeNoteIdFromRoute='note-1'
          folders={[]}
          isLoading={false}
          notes={[editableNote]}
          userId='user-1'
        />,
      )

      await user.click(screen.getByRole('button', {name: 'Note actions'}))
      await user.click(screen.getByRole('menuitem', {name: 'Download as .md'}))

      expect(createObjectURLMock).toHaveBeenCalledTimes(1)
      const createObjectUrlCall = createObjectURLMock.mock.calls[0]
      if (!createObjectUrlCall) throw new Error('Expected createObjectURL to be called')
      const exportBlob = createObjectUrlCall[0]
      expect(exportBlob).toBeInstanceOf(MockBlob)
      expect(exportBlob.type).toBe('text/markdown')
      expect(exportBlob.parts).toEqual(['## Updated draft'])

      expect(clickSpy).toHaveBeenCalledTimes(1)
      const downloadLink = clickSpy.mock.contexts[0] as HTMLAnchorElement | undefined
      if (!downloadLink) throw new Error('Expected anchor click context')
      expect(downloadLink.download).toBe('Sprint Notes.md')
      expect(downloadLink.href).toBe('blob:note-markdown')
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:note-markdown')
    } finally {
      clickSpy.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
        writable: true,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
        writable: true,
      })
      Object.defineProperty(globalThis, 'Blob', {
        configurable: true,
        value: originalBlob,
        writable: true,
      })
    }
  })

  it('creates a new note with an empty stored title, focuses the title input, and moves Enter into the body editor', async () => {
    const user = userEvent.setup()
    const createdNote = makeEditableNote({contentMd: '', folderId: 'folder-1', id: 'note-new', previewText: '', title: ''})

    createNoteMutateMock.mockImplementation((_input, options?: {onSuccess?: (note: NoteRecord) => void}) => {
      options?.onSuccess?.(makeNoteRecord(createdNote))
    })

    useNoteQueryMock.mockImplementation((noteId: string | null) => ({
      data: noteId === 'note-new' ? makeNoteRecord(createdNote) : null,
      refetch: vi.fn(),
      isPending: false,
    }))

    render(
      <NotesView
        folders={[makeFolder({id: 'folder-1', name: 'Notes', position: 0})]}
        isLoading={false}
        notes={[]}
        userId='user-1'
      />,
    )

    await user.click(screen.getAllByTitle('Add note or folder')[0] as HTMLElement)
    await user.click(await screen.findByRole('menuitem', {name: 'Add New Note'}))

    expect(createNoteMutateMock).toHaveBeenCalledWith(
      {folderId: 'folder-1', title: ''},
      expect.objectContaining({onSuccess: expect.any(Function)}),
    )

    const titleInput = await screen.findByPlaceholderText('New Note')
    await waitFor(() => expect(titleInput).toHaveFocus())

    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByTestId('rich-text-editor')).toHaveFocus())
    expect(updateNoteMutateMock).not.toHaveBeenCalled()
  })
})
