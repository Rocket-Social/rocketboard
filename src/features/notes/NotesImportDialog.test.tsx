// @vitest-environment jsdom

import {render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe, expect, it, vi} from 'vitest'

import {NotesImportDialog} from './NotesImportDialog'
import type {GranolaConnectionRecord} from './granola-import.shared'

function makeConnection(
  overrides: Partial<GranolaConnectionRecord> = {},
): GranolaConnectionRecord {
  return {
    authMethod: 'api_key',
    backfillCursor: null,
    createdAt: '2026-04-08T00:00:00Z',
    id: 'conn-1',
    initialImportCompletedAt: null,
    lastSourceUpdatedAt: null,
    lastSyncError: null,
    lastSyncFinishedAt: null,
    lastSyncStartedAt: null,
    mode: 'capture',
    provider: 'granola',
    rootFolderId: 'folder-1',
    status: 'connected',
    updatedAt: '2026-04-08T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  }
}

const defaultProps = {
  importedNoteCount: 0,
  isConnecting: false,
  isDesktop: true,
  isOpen: true,
  isSyncing: false,
  onClose: () => {},
  onConnect: vi.fn(),
  onDisconnect: () => {},
  onModeChange: vi.fn(),
  onReconnect: vi.fn(),
  onSync: () => {},
}

describe('NotesImportDialog', () => {
  it('shows source picker with both Granola and Obsidian', () => {
    render(
      <NotesImportDialog
        {...defaultProps}
        connection={null}
      />,
    )

    expect(screen.getByText('Granola')).toBeInTheDocument()
    expect(screen.getByText('Obsidian')).toBeInTheDocument()
  })

  it('navigates to auth method after selecting Granola when disconnected', async () => {
    const user = userEvent.setup()

    render(
      <NotesImportDialog
        {...defaultProps}
        connection={null}
      />,
    )

    await user.click(screen.getByText('Granola'))
    expect(screen.getByText('Choose how to connect')).toBeInTheDocument()
  })

  it('navigates to Granola status when connected and clicking Granola', async () => {
    const user = userEvent.setup()

    render(
      <NotesImportDialog
        {...defaultProps}
        connection={makeConnection({
          initialImportCompletedAt: '2026-04-08T00:10:00Z',
          lastSyncFinishedAt: new Date().toISOString(),
        })}
        importedNoteCount={3}
      />,
    )

    // Source picker always shows first
    await user.click(screen.getByText('Granola'))

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText(/3 notes? in My Notes/i)).toBeInTheDocument()
  })

  it('shows Obsidian upload step after selecting Obsidian', async () => {
    const user = userEvent.setup()

    render(
      <NotesImportDialog
        {...defaultProps}
        connection={null}
      />,
    )

    await user.click(screen.getByText('Obsidian'))
    expect(screen.getByText(/Drop your vault zip here/i)).toBeInTheDocument()
  })

  it('shows mode change UI for Granola connections', async () => {
    const user = userEvent.setup()

    render(
      <NotesImportDialog
        {...defaultProps}
        connection={makeConnection({mode: 'mirror'})}
      />,
    )

    await user.click(screen.getByText('Granola'))
    expect(screen.getByText(/Mirror \(read-only\)/)).toBeInTheDocument()

    await user.click(screen.getByText('Change'))
    expect(screen.getByText('Capture')).toBeInTheDocument()
    expect(screen.getByText('Mirror')).toBeInTheDocument()
  })
})
