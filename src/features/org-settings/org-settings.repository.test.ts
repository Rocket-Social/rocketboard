import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fetchMock, getAccessTokenMock, rpcCallMock, rpcCallSingleMock} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
  rpcCallMock: vi.fn(),
  rpcCallSingleMock: vi.fn(),
}))

vi.stubGlobal('fetch', fetchMock)

vi.mock('../../app/config', () => ({
  IS_SELF_HOSTED: false,
  appConfig: {
    supabase: {
      publishableKey: 'publishable-key',
      url: 'https://example.supabase.co',
    },
  },
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    call: rpcCallMock,
    callSingle: rpcCallSingleMock,
  },
}))

vi.mock('../../platform/auth/auth-adapter', () => ({
  authAdapter: {
    getAccessToken: getAccessTokenMock,
  },
}))

import {orgSettingsRepository} from './org-settings.repository'

describe('orgSettingsRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getAccessTokenMock.mockReset()
    rpcCallMock.mockReset()
    rpcCallSingleMock.mockReset()
  })

  it('creates the org invite and sends the email through the edge function', async () => {
    rpcCallSingleMock.mockResolvedValue({
      acceptToken: 'token-1',
      createdAt: '2026-04-05T00:00:00.000Z',
      email: 'teammate@example.com',
      id: 'invite-1',
      role: 'member',
    })
    getAccessTokenMock.mockResolvedValue('fresh-token')
    fetchMock.mockResolvedValue({
      json: vi.fn().mockResolvedValue({success: true}),
      ok: true,
    })

    const invite = await orgSettingsRepository.createOrganizationInvite({
      email: 'teammate@example.com',
      inviterName: 'Test User',
      orgId: 'org-1',
      organizationName: 'Test Org',
      role: 'member',
    })

    expect(rpcCallSingleMock).toHaveBeenCalledWith('create_organization_invite', {
      target_email: 'teammate@example.com',
      target_message: null,
      target_org_id: 'org-1',
      target_role: 'member',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/functions\/v1\/send-invite-email$/)
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      body: JSON.stringify({
        acceptToken: 'token-1',
        email: 'teammate@example.com',
        inviterName: 'Test User',
        message: undefined,
        resourceId: 'org-1',
        resourceName: 'Test Org',
        role: 'member',
        type: 'organization',
      }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer fresh-token',
      }),
      method: 'POST',
    })
    expect(invite).toEqual({
      acceptToken: 'token-1',
      createdAt: '2026-04-05T00:00:00.000Z',
      email: 'teammate@example.com',
      id: 'invite-1',
      role: 'member',
    })
  })

  it('throws when the invite email edge function fails', async () => {
    rpcCallSingleMock.mockResolvedValue({
      acceptToken: 'token-1',
      createdAt: '2026-04-05T00:00:00.000Z',
      email: 'teammate@example.com',
      id: 'invite-1',
      role: 'member',
    })
    getAccessTokenMock.mockResolvedValue('fresh-token')
    fetchMock.mockResolvedValue({
      json: vi.fn().mockResolvedValue({error: 'Missing auth'}),
      ok: false,
    })

    await expect(orgSettingsRepository.createOrganizationInvite({
      email: 'teammate@example.com',
      inviterName: 'Test User',
      orgId: 'org-1',
      organizationName: 'Test Org',
      role: 'member',
    })).rejects.toThrow('Missing auth')
  })

  it('throws when there is no session for the edge function request', async () => {
    rpcCallSingleMock.mockResolvedValue({
      acceptToken: 'token-1',
      createdAt: '2026-04-05T00:00:00.000Z',
      email: 'teammate@example.com',
      id: 'invite-1',
      role: 'member',
    })
    getAccessTokenMock.mockResolvedValue(null)

    await expect(orgSettingsRepository.createOrganizationInvite({
      email: 'teammate@example.com',
      inviterName: 'Test User',
      orgId: 'org-1',
      organizationName: 'Test Org',
      role: 'member',
    })).rejects.toThrow('Rocketboard could not verify your session to send the invite email.')
  })
})
