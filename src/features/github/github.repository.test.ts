import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcCallMock, rpcCallSingleMock } = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
  rpcCallSingleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: rpcCallMock,
    callSingle: rpcCallSingleMock,
  },
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

import { githubRepository } from './github.repository'

describe('githubRepository', () => {
  beforeEach(() => {
    rpcCallMock.mockReset()
    rpcCallSingleMock.mockReset()
  })

  it('loads project pull requests through RPC and maps linked cards', async () => {
    rpcCallMock.mockResolvedValue([
      {
        additions: 12,
        approval_count: 1,
        author_avatar_url: 'https://example.com/avatar.png',
        author_login: 'alice',
        base_ref: 'main',
        body: 'Implements RB-42',
        changes_requested_count: 0,
        checks_status: 'success',
        closed_at: null,
        created_at: '2026-04-01T00:00:00Z',
        deletions: 4,
        draft: false,
        first_review_submitted_at: '2026-04-01T02:00:00Z',
        github_pr_id: 1234,
        head_ref: 'feature/rb-42',
        html_url: 'https://github.com/acme/repo/pull/1234',
        id: 'pr-1',
        last_review_submitted_at: '2026-04-01T02:00:00Z',
        linked_cards: [
          {
            id: 'card-1',
            link_type: 'manual',
            project_card_number: 42,
            title: 'Ship GitHub board',
          },
        ],
        merged_at: null,
        number: 87,
        repo_id: 'repo-1',
        review_count: 1,
        review_state: 'approved',
        reviewers: [
          { avatarUrl: null, login: 'reviewer-1', state: 'approved' },
        ],
        state: 'open',
        synced_at: '2026-04-01T03:00:00Z',
        title: 'Ship GitHub board',
        updated_at: '2026-04-01T03:00:00Z',
      },
    ])

    await expect(
      githubRepository.getPullRequestsForProject('project-1'),
    ).resolves.toEqual([
      {
        additions: 12,
        approvalCount: 1,
        authorAvatarUrl: 'https://example.com/avatar.png',
        authorLogin: 'alice',
        baseRef: 'main',
        body: 'Implements RB-42',
        changesRequestedCount: 0,
        checksStatus: 'success',
        closedAt: null,
        createdAt: '2026-04-01T00:00:00Z',
        deletions: 4,
        draft: false,
        firstReviewSubmittedAt: '2026-04-01T02:00:00Z',
        githubPrId: 1234,
        headRef: 'feature/rb-42',
        htmlUrl: 'https://github.com/acme/repo/pull/1234',
        id: 'pr-1',
        lastReviewSubmittedAt: '2026-04-01T02:00:00Z',
        linkedCards: [
          {
            id: 'card-1',
            linkType: 'manual',
            projectCardNumber: 42,
            title: 'Ship GitHub board',
          },
        ],
        mergedAt: null,
        number: 87,
        repoId: 'repo-1',
        reviewCount: 1,
        reviewState: 'approved',
        reviewers: [
          { avatarUrl: null, login: 'reviewer-1', state: 'approved' },
        ],
        state: 'open',
        syncedAt: '2026-04-01T03:00:00Z',
        title: 'Ship GitHub board',
        updatedAt: '2026-04-01T03:00:00Z',
      },
    ])

    expect(rpcCallMock).toHaveBeenCalledWith(
      'get_project_github_pull_requests',
      {
        target_project_id: 'project-1',
      },
    )
  })

  it('loads project cards through RPC and preserves nullable project card numbers', async () => {
    rpcCallMock.mockResolvedValue([
      { id: 'card-1', project_card_number: 42, title: 'Ship GitHub board' },
      {
        id: 'card-2',
        project_card_number: null,
        title: 'Legacy card without number',
      },
    ])

    await expect(
      githubRepository.getProjectCards('project-1'),
    ).resolves.toEqual([
      { id: 'card-1', projectCardNumber: 42, title: 'Ship GitHub board' },
      {
        id: 'card-2',
        projectCardNumber: null,
        title: 'Legacy card without number',
      },
    ])

    expect(rpcCallMock).toHaveBeenCalledWith('get_project_github_cards', {
      target_project_id: 'project-1',
    })
  })

  it('loads github board config through the shared config rpc', async () => {
    rpcCallSingleMock.mockResolvedValue({
      sharedConfig: {
        repoMode: 'selected',
        selectedRepoId: 'repo-2',
      },
    })

    await expect(
      githubRepository.getGitHubBoardConfig('view-1'),
    ).resolves.toEqual({
      repoMode: 'selected',
      selectedRepoId: 'repo-2',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith(
      'get_github_shared_config_by_view_id',
      {
        target_project_view_id: 'view-1',
      },
    )
  })

  it('saves github board config through the shared config rpc', async () => {
    rpcCallSingleMock.mockResolvedValue({
      sharedConfig: {
        repoMode: 'all',
        selectedRepoId: null,
      },
    })

    await expect(
      githubRepository.setGitHubBoardConfig('view-1', {
        repoMode: 'all',
        selectedRepoId: null,
      }),
    ).resolves.toEqual({
      repoMode: 'all',
      selectedRepoId: null,
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith(
      'set_github_shared_config_by_view_id',
      {
        target_config: {
          repoMode: 'all',
          selectedRepoId: null,
        },
        target_project_view_id: 'view-1',
      },
    )
  })
})
