import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {
  linkIdentityMock,
  signInWithOAuthMock,
} = vi.hoisted(() => ({
  linkIdentityMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
}))

vi.mock('../../platform/auth/auth-adapter', () => ({
  authAdapter: {
    linkIdentity: linkIdentityMock,
    signInWithOAuth: signInWithOAuthMock,
  },
}))

vi.mock('../../platform/blob/blob-store', () => ({
  blobStore: {},
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {},
}))

import {mapSupabaseSession, sessionRepository} from './session.repository'

const GOOGLE_FLOW_STORAGE_KEY = 'rocketboard.auth.google-flow'

describe('mapSupabaseSession', () => {
  it('carries persisted week-start preferences into the authenticated session', () => {
    const session = mapSupabaseSession({
      access_token: 'token',
      expires_at: 0,
      expires_in: 0,
      refresh_token: 'refresh',
      token_type: 'bearer',
      user: {
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2026-04-05T00:00:00.000Z',
        email: 'jane@example.com',
        id: 'user-1',
        user_metadata: {full_name: 'Jane Doe'},
      },
    }, false, 'octocat', 'monday')

    expect(session).toEqual({
      status: 'authenticated',
      user: {
        avatarUrl: null,
        email: 'jane@example.com',
        githubLogin: 'octocat',
        id: 'user-1',
        initials: 'JD',
        isInternalAdmin: false,
        name: 'Jane Doe',
        weekStartsOn: 'monday',
      },
    })
  })
})

describe('sessionRepository Google OAuth start flows', () => {
  let assignMock: ReturnType<typeof vi.fn>
  let sessionStorageState: Map<string, string>

  beforeEach(() => {
    linkIdentityMock.mockReset()
    signInWithOAuthMock.mockReset()
    assignMock = vi.fn()
    sessionStorageState = new Map()

    vi.stubGlobal('window', {
      location: {
        assign: assignMock,
        origin: 'https://rocketboard.test',
      },
      sessionStorage: {
        clear: () => sessionStorageState.clear(),
        getItem: (key: string) => sessionStorageState.get(key) ?? null,
        removeItem: (key: string) => {
          sessionStorageState.delete(key)
        },
        setItem: (key: string, value: string) => {
          sessionStorageState.set(key, value)
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('manually redirects to the provider URL for Google sign-in', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: {
        provider: 'google',
        url: 'https://accounts.google.com/o/oauth2/v2/auth',
      },
      error: null,
    })

    await expect(sessionRepository.signInWithGoogle('/workspaces/acme')).resolves.toBeUndefined()

    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
        skipBrowserRedirect: true,
      },
      provider: 'google',
    })
    expect(assignMock).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth')
    expect(window.sessionStorage.getItem(GOOGLE_FLOW_STORAGE_KEY)).not.toBeNull()
  })

  it('keeps the user in-app when Google sign-in is disabled in Supabase', async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: {
        provider: 'google',
        url: null,
      },
      error: new Error('Unsupported provider: provider is not enabled'),
    })

    await expect(sessionRepository.signInWithGoogle('/workspaces/acme')).rejects.toThrow(
      'Google sign-in is not enabled for this Supabase project.',
    )

    expect(assignMock).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(GOOGLE_FLOW_STORAGE_KEY)).toBeNull()
  })

  it('keeps the user in-app when Google linking is disabled in Supabase', async () => {
    linkIdentityMock.mockResolvedValue({
      data: {
        provider: 'google',
        url: null,
      },
      error: new Error('Unsupported provider: provider is not enabled'),
    })

    await expect(
      sessionRepository.linkGoogleIdentity({
        flowId: 'flow-123',
        redirectNonce: 'nonce-123',
        returnTo: '/workspaces/acme',
      }),
    ).rejects.toThrow(
      'Google account linking is not enabled for this Supabase project.',
    )

    expect(linkIdentityMock).toHaveBeenCalledWith({
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
        skipBrowserRedirect: true,
      },
      provider: 'google',
    })
    expect(assignMock).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(GOOGLE_FLOW_STORAGE_KEY)).toBeNull()
  })
})
