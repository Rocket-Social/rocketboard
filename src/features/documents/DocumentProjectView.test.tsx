/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {SessionUser} from '../auth/data'
import type {ProjectDocumentSnapshot} from './document.types'
import {DocumentProjectView} from './DocumentProjectView'

const mocks = vi.hoisted(() => ({
  fetchQuery: vi.fn(),
  getDocumentVersionContent: vi.fn(),
  richTextState: {revision: 0},
  saveDocumentMutate: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')

  return {
    ...actual,
    useQueryClient: () => ({
      fetchQuery: mocks.fetchQuery,
    }),
  }
})

vi.mock('../rich-text/RichTextEditor', () => ({
  RichTextEditor: ({onChange}: {onChange?: (value: {content: Array<{content: Array<{text: string; type: string}>; type: string}>; type: string}) => void}) => (
    <div data-testid='rich-text-editor'>
      <button
        onClick={() => {
          mocks.richTextState.revision += 1
          onChange?.({
            content: [{
              content: [{text: `Edited ${mocks.richTextState.revision}`, type: 'text'}],
              type: 'paragraph',
            }],
            type: 'doc',
          })
        }}
        type='button'
      >
        Edit body
      </button>
      <button type='button'>Normal</button>
      <div aria-label='Document body editor' contentEditable role='textbox'/>
    </div>
  ),
}))

vi.mock('./document.repository', () => ({
  DOCUMENT_CONFLICT: 'DOCUMENT_CONFLICT',
  documentRepository: {
    getDocumentVersionContent: mocks.getDocumentVersionContent,
  },
  getDocumentErrorCode: (error: unknown) =>
    error && typeof error === 'object' && typeof (error as {message?: unknown}).message === 'string'
      ? (error as {message: string}).message
      : 'Unknown document error.',
  toDocumentErrorMessage: (error: unknown) => {
    const message =
      error && typeof error === 'object' && typeof (error as {message?: unknown}).message === 'string'
        ? (error as {message: string}).message
        : 'Unknown document error.'

    if (message === 'DOCUMENT_CONFLICT') {
      return 'This document was updated somewhere else. Reload the latest version before saving again.'
    }

    if (message === 'DOCUMENT_NOT_FOUND') {
      return 'This document project could not be loaded.'
    }

    return message
  },
}))

vi.mock('./document.queries', () => ({
  projectDocumentQueryOptions: vi.fn(() => ({queryKey: ['project-document', 'project-view-1']})),
  useAddDocumentCommentMutation: vi.fn(() => ({error: null, isPending: false, mutate: vi.fn()})),
  useDeleteDocumentVersionMutation: vi.fn(() => ({error: null, mutate: vi.fn()})),
  useDocumentPresenceHeartbeatMutation: vi.fn(() => ({mutate: vi.fn()})),
  useDocumentPresenceQuery: vi.fn(() => ({data: [], error: null})),
  useProjectDocumentQuery: vi.fn((_projectViewId: string, initialSnapshot: ProjectDocumentSnapshot) => ({
    data: initialSnapshot,
    error: null,
  })),
  useRestoreDocumentVersionMutation: vi.fn(() => ({error: null, isPending: false, mutate: vi.fn()})),
  useSaveDocumentMutation: vi.fn(() => ({error: null, isPending: false, mutate: mocks.saveDocumentMutate})),
  useToggleCommentReactionMutation: vi.fn(() => ({mutate: vi.fn()})),
  useUploadAttachmentMutation: vi.fn(() => ({error: null, isPending: false, mutateAsync: vi.fn()})),
}))

describe('DocumentProjectView', () => {
  beforeEach(() => {
    mocks.fetchQuery.mockReset()
    mocks.getDocumentVersionContent.mockReset()
    mocks.richTextState.revision = 0
    mocks.saveDocumentMutate.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  function createInitialSnapshot(): ProjectDocumentSnapshot {
    return {
      attachments: [],
      comments: [],
      document: {
        contentJson: {content: [{type: 'paragraph'}], type: 'doc'},
        contentMd: '',
        id: 'document-1',
        projectId: 'project-1',
        title: 'Lower Back Pain',
        updatedAt: '2026-04-02T20:15:00.000Z',
        updatedByName: 'Test User',
        version: 1,
      },
      versions: [],
    }
  }

  function createCurrentUser(): SessionUser {
    return {
      email: 'user@example.com',
      githubLogin: null,
      id: 'user-1',
      initials: 'TU',
      isInternalAdmin: false,
      name: 'Test User',
      weekStartsOn: 'sunday',
    }
  }

  it('does not wrap the rich text editor inside a label', () => {
    render(
      <DocumentProjectView
        canEditProject
        currentUser={createCurrentUser()}
        initialSnapshot={createInitialSnapshot()}
        projectId='project-1'
        projectName='Rocketboard'
        projectViewId='project-view-1'
      />,
    )

    expect(screen.getByText('Body').closest('label')).toBeNull()
    expect(screen.getByRole('button', {name: 'Normal'}).closest('label')).toBeNull()
  })

  it('does not retry the same failing autosave payload until the draft changes', async () => {
    vi.useFakeTimers()
    mocks.saveDocumentMutate.mockImplementation((_input, options?: {onError?: (error: unknown) => void}) => {
      options?.onError?.({message: 'DOCUMENT_NOT_FOUND'})
    })

    render(
      <DocumentProjectView
        canEditProject
        currentUser={createCurrentUser()}
        initialSnapshot={createInitialSnapshot()}
        projectId='project-1'
        projectName='Rocketboard'
        projectViewId='project-view-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', {name: 'Edit body'}))

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.saveDocumentMutate).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.saveDocumentMutate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', {name: 'Edit body'}))

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(mocks.saveDocumentMutate).toHaveBeenCalledTimes(2)
  })
})
