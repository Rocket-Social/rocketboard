/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HealthView } from './HealthView'

afterEach(() => {
  cleanup()
})

describe('HealthView', () => {
  it('shows actionable readiness guidance when health is still preparing', async () => {
    const user = userEvent.setup()
    const onOpenBoardSettings = vi.fn()
    const onSyncNow = vi.fn()

    render(
      <HealthView
        canEditProject
        isLoading={false}
        isSyncing={false}
        onOpenBoardSettings={onOpenBoardSettings}
        onSyncNow={onSyncNow}
        organizationId="org-1"
        repositories={[
          {
            colorIndex: 0,
            connectionSourceId: 'source-1',
            createdAt: '2026-04-02T00:00:00Z',
            defaultBranch: 'main',
            fullName: 'acme/repo-one',
            githubRepoId: 101,
            historyBackfilledAt: null,
            id: 'repo-1',
            isPrivate: true,
            lastSyncedAt: null,
            name: 'repo-one',
            projectId: 'project-1',
          },
        ]}
        snapshot={{
          earliestHistoryAt: null,
          isReady: false,
          metrics: [],
          readinessReason:
            'Backfill in progress for one or more attached repositories.',
          unmappedContributors: [],
        }}
      />,
    )

    expect(
      screen.getByText('Finishing PR history backfill'),
    ).toBeInTheDocument()
    expect(screen.getByText('acme/repo-one')).toBeInTheDocument()
    expect(screen.getByText('Never synced yet')).toBeInTheDocument()
    expect(screen.getByText('Backfill in progress')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(onSyncNow).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Board settings/i }))
    expect(onOpenBoardSettings).toHaveBeenCalled()
  })

  it('hides board settings for read-only users', () => {
    render(
      <HealthView
        canEditProject={false}
        isLoading={false}
        isSyncing={false}
        onOpenBoardSettings={vi.fn()}
        onSyncNow={vi.fn()}
        organizationId="org-1"
        repositories={[]}
        snapshot={{
          earliestHistoryAt: null,
          isReady: false,
          metrics: [],
          readinessReason: 'Backfill in progress for one or more attached repositories.',
          unmappedContributors: [],
        }}
      />,
    )

    expect(screen.queryByRole('button', {name: /Board settings/i})).not.toBeInTheDocument()
  })
})
