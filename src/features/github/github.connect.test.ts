import {beforeEach, describe, expect, it, vi} from 'vitest'

const {
  fetchMock,
  getSupabaseBrowserClientMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
}))

vi.mock('../../app/config', () => ({
  appConfig: {
    supabase: {
      publishableKey: 'publishable-key',
      url: 'https://example.supabase.co',
    },
  },
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

import {listAvailableGitHubRepos} from './github.connect'

describe('listAvailableGitHubRepos', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getSupabaseBrowserClientMock.mockReset()

    vi.stubGlobal('fetch', fetchMock)

    getSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({data: {session: {access_token: 'session-token'}}})),
        refreshSession: vi.fn(async () => ({data: {session: {access_token: 'fresh-token'}}, error: null})),
      },
    })

    fetchMock.mockResolvedValue({
      json: async () => ({repos: []}),
      ok: true,
    })
  })

  it('includes project_id for project-scoped repo inventory requests', async () => {
    await listAvailableGitHubRepos({
      connectionSourceId: 'source-1',
      mode: 'project',
      projectId: 'project-1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/github-repos',
      expect.objectContaining({
        body: JSON.stringify({
          connection_source_id: 'source-1',
          mode: 'project',
          project_id: 'project-1',
        }),
      }),
    )
  })

  it('keeps manage requests project-agnostic', async () => {
    await listAvailableGitHubRepos({
      connectionSourceId: 'source-1',
      mode: 'manage',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/github-repos',
      expect.objectContaining({
        body: JSON.stringify({
          connection_source_id: 'source-1',
          mode: 'manage',
          project_id: null,
        }),
      }),
    )
  })
})
