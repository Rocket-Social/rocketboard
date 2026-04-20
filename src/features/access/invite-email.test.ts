import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchMock, getAccessTokenMock} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
}))

vi.stubGlobal('fetch', fetchMock)

vi.mock('../../platform/auth/auth-adapter', () => ({
  authAdapter: {
    getAccessToken: getAccessTokenMock,
  },
}))

async function loadSendInviteEmail() {
  vi.resetModules()
  return import('./invite-email')
}

const payload = {
  acceptToken: 'invite-token',
  email: 'teammate@example.com',
  inviterName: 'Test User',
  resourceId: 'org-1',
  resourceName: 'Acme Inc',
  role: 'member',
  type: 'organization',
} as const

describe('sendInviteEmail', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getAccessTokenMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_SELF_HOSTED', 'false')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key')
  })

  it('posts invite emails with the current access token and anon key', async () => {
    const {sendInviteEmail} = await loadSendInviteEmail()

    getAccessTokenMock.mockResolvedValue('fresh-token')
    fetchMock.mockResolvedValue({
      json: vi.fn().mockResolvedValue({success: true}),
      ok: true,
    })

    await expect(sendInviteEmail(payload)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/send-invite-email',
      expect.objectContaining({
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
          apikey: 'publishable-key',
        }),
        method: 'POST',
      }),
    )
  })

  it('surfaces gateway-style failures that return message instead of error', async () => {
    const {sendInviteEmail} = await loadSendInviteEmail()

    getAccessTokenMock.mockResolvedValue('fresh-token')
    fetchMock.mockResolvedValue({
      json: vi.fn().mockResolvedValue({code: 401, message: 'Invalid JWT'}),
      ok: false,
    })

    await expect(sendInviteEmail(payload)).rejects.toThrow('Invalid JWT')
  })
})
