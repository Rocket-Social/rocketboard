import {generateKeyPairSync, webcrypto} from 'node:crypto'

import {beforeAll, describe, expect, it, vi} from 'vitest'

import {
  completeGitHubAppInstallAction,
  fetchInstallationDetailsFromGitHub,
  type GitHubConnectionInstallState,
} from './complete'

const PKCS1_KEY = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs1',
  },
}).privateKey

function createInstallState(overrides: Partial<GitHubConnectionInstallState> = {}): GitHubConnectionInstallState {
  return {
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    organization_id: 'org-1',
    requested_by: 'user-1',
    return_path: '/org/org-1/settings?tab=github',
    used_at: null,
    ...overrides,
  }
}

describe('github install completion', () => {
  beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto)
  })

  it('completes installs with a PKCS#1 GitHub App key and persists the source payload', async () => {
    const markInstallStateUsed = vi.fn(async () => 'marked' as const)
    const persistSource = vi.fn(async () => true)
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      account: {
        avatar_url: 'https://avatars.githubusercontent.com/u/1',
        login: 'rocketboard',
        type: 'Organization',
      },
      events: ['installation', 'push'],
      permissions: {
        contents: 'read',
      },
    }), {
      headers: {'Content-Type': 'application/json'},
      status: 200,
    }))

    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: (installationId) => fetchInstallationDetailsFromGitHub({
        appId: '12345',
        fetchFn: fetchSpy,
        installationId,
        privateKey: PKCS1_KEY,
      }),
      markInstallStateUsed,
      now: () => '2026-04-12T23:00:00.000Z',
      persistSource,
    })

    expect(result).toEqual({
      body: {
        return_path: '/org/org-1/settings?tab=github',
        success: true,
      },
      status: 200,
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(persistSource).toHaveBeenCalledWith(expect.objectContaining({
      account_avatar_url: 'https://avatars.githubusercontent.com/u/1',
      account_login: 'rocketboard',
      account_type: 'Organization',
      auth_type: 'github_app',
      installation_id: 42,
      installed_by: 'user-1',
      last_validated_at: '2026-04-12T23:00:00.000Z',
      organization_id: 'org-1',
      scope_type: 'organization',
      status: 'active',
      updated_at: '2026-04-12T23:00:00.000Z',
    }))
    expect(markInstallStateUsed).toHaveBeenCalledWith('state-1', '2026-04-12T23:00:00.000Z')
  })

  it('maps invalid GitHub App keys to a generic install error with a typed backend code', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: (installationId) => fetchInstallationDetailsFromGitHub({
        appId: '12345',
        installationId,
        privateKey: '-----BEGIN PRIVATE KEY-----not-valid-----END PRIVATE KEY-----',
      }),
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result).toEqual({
      body: {
        error: 'github_app_key_invalid',
        message: 'Could not fetch installation details from GitHub.',
      },
      status: 500,
    })
  })

  it('maps GitHub lookup failures to github_install_lookup_failed', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: (installationId) => fetchInstallationDetailsFromGitHub({
        appId: '12345',
        fetchFn: async () => new Response('nope', {status: 500}),
        installationId,
        privateKey: PKCS1_KEY,
      }),
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result).toEqual({
      body: {
        error: 'github_install_lookup_failed',
        message: 'Could not fetch installation details from GitHub.',
      },
      status: 500,
    })
  })

  it('returns an idempotent success when the state has already been finalized', async () => {
    // GitHub can retry install callbacks and users can refresh the browser
    // tab. A second hit against an already-used state must still render a
    // success redirect rather than a hard invalid_state failure.
    const markInstallStateUsed = vi.fn(async () => 'marked' as const)
    const persistSource = vi.fn(async () => true)
    const fetchInstallationDetails = vi.fn(async () => ({
      data: {account: {avatar_url: null, login: 'rocketboard', type: 'Organization'}},
      ok: true as const,
    }))

    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState({used_at: new Date().toISOString()}),
      fetchInstallationDetails,
      markInstallStateUsed,
      persistSource,
    })

    expect(result).toEqual({
      body: {
        return_path: '/org/org-1/settings?tab=github',
        success: true,
      },
      status: 200,
    })
    // Already-finalized path must short-circuit before touching GitHub or the DB.
    expect(fetchInstallationDetails).not.toHaveBeenCalled()
    expect(persistSource).not.toHaveBeenCalled()
    expect(markInstallStateUsed).not.toHaveBeenCalled()
  })

  it('forbids a different user from replaying an already-used state', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'other-user',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState({used_at: new Date().toISOString()}),
      fetchInstallationDetails: async () => {
        throw new Error('should not be called')
      },
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result.status).toBe(403)
    expect(result.body.error).toBe('Forbidden')
  })

  it('rejects unknown install state', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'missing-state',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => null,
      fetchInstallationDetails: async () => {
        throw new Error('should not be called')
      },
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('invalid_state')
  })

  it('rejects expired install state', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'expired-state',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      fetchInstallationDetails: async () => {
        throw new Error('should not be called')
      },
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('expired_state')
  })

  it('rejects a different initiating user', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-2',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: async () => {
        throw new Error('should not be called')
      },
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result.status).toBe(403)
    expect(result.body.message).toBe('Only the user who initiated the install can complete it.')
  })

  it('rejects non-admin installers', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => false,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: async () => {
        throw new Error('should not be called')
      },
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => true,
    })

    expect(result.status).toBe(403)
    expect(result.body.message).toBe('Only org admins can complete the GitHub App install.')
  })

  it('returns save_failed when source persistence fails', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: async () => ({
        data: {
          account: {
            avatar_url: null,
            login: 'rocketboard',
            type: 'Organization',
          },
        },
        ok: true,
      }),
      markInstallStateUsed: async () => 'marked' as const,
      persistSource: async () => false,
    })

    expect(result.status).toBe(500)
    expect(result.body.error).toBe('save_failed')
  })

  it('fails closed when marking the install state used hits a transient error', async () => {
    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: async () => ({
        data: {
          account: {
            avatar_url: null,
            login: 'rocketboard',
            type: 'Organization',
          },
        },
        ok: true,
      }),
      markInstallStateUsed: async () => 'error' as const,
      persistSource: async () => true,
    })

    expect(result).toEqual({
      body: {
        error: 'install_state_finalize_failed',
        message: 'GitHub install session could not be finalized. Please retry the install.',
      },
      status: 500,
    })
  })

  it('returns success when a concurrent callback already finalized the install state', async () => {
    // Race scenario: two callbacks pass fetchInstallState with used_at=null,
    // both upsert the source (idempotent on installation_id via partial unique
    // index), then one wins the atomic mark-used and the other observes
    // used_at already set. The loser should still report success because the
    // install is fully saved.
    const persistSource = vi.fn(async () => true)
    const markInstallStateUsed = vi.fn(async () => 'already_used' as const)

    const result = await completeGitHubAppInstallAction({
      installationId: 42,
      state: 'state-1',
      userId: 'user-1',
    }, {
      canManageOrganization: async () => true,
      fetchInstallState: async () => createInstallState(),
      fetchInstallationDetails: async () => ({
        data: {
          account: {
            avatar_url: null,
            login: 'rocketboard',
            type: 'Organization',
          },
        },
        ok: true,
      }),
      markInstallStateUsed,
      persistSource,
    })

    expect(result).toEqual({
      body: {
        return_path: '/org/org-1/settings?tab=github',
        success: true,
      },
      status: 200,
    })
    expect(persistSource).toHaveBeenCalledOnce()
    expect(markInstallStateUsed).toHaveBeenCalledOnce()
  })
})
