import {beforeEach, describe, expect, it, vi} from 'vitest'

const {fromMock, getSupabaseBrowserClientMock, rpcCallMock} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
  rpcCallMock: vi.fn(),
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {call: rpcCallMock},
}))

import {cardFollowersRepository} from './card-followers.repository'

beforeEach(() => {
  fromMock.mockReset()
  getSupabaseBrowserClientMock.mockReset()
  rpcCallMock.mockReset()
  getSupabaseBrowserClientMock.mockReturnValue({from: fromMock})
})

describe('cardFollowersRepository.follow / unfollow', () => {
  it('follow calls follow_card with the card id', async () => {
    rpcCallMock.mockResolvedValueOnce(undefined)
    await cardFollowersRepository.follow('card-1')
    expect(rpcCallMock).toHaveBeenCalledWith('follow_card', {target_card_id: 'card-1'})
  })

  it('unfollow calls unfollow_card with the card id', async () => {
    rpcCallMock.mockResolvedValueOnce(undefined)
    await cardFollowersRepository.unfollow('card-1')
    expect(rpcCallMock).toHaveBeenCalledWith('unfollow_card', {target_card_id: 'card-1'})
  })
})

describe('cardFollowersRepository.listFollowers', () => {
  it('calls list_card_followers and maps snake_case rows to camelCase', async () => {
    rpcCallMock.mockResolvedValueOnce([
      {
        user_id: 'user-1',
        display_name: 'Alex Doe',
        avatar_url: 'https://example.com/a.png',
        source: 'creator_auto',
        created_at: '2026-05-09T10:00:00.000Z',
      },
      {
        user_id: 'user-2',
        display_name: 'Bee Cee',
        avatar_url: null,
        source: 'manual',
        created_at: '2026-05-09T11:00:00.000Z',
      },
    ])

    const result = await cardFollowersRepository.listFollowers('card-1')

    expect(rpcCallMock).toHaveBeenCalledWith('list_card_followers', {
      target_card_id: 'card-1',
    })
    expect(result).toEqual([
      {
        avatarUrl: 'https://example.com/a.png',
        createdAt: '2026-05-09T10:00:00.000Z',
        displayName: 'Alex Doe',
        source: 'creator_auto',
        userId: 'user-1',
      },
      {
        avatarUrl: null,
        createdAt: '2026-05-09T11:00:00.000Z',
        displayName: 'Bee Cee',
        source: 'manual',
        userId: 'user-2',
      },
    ])
  })

  it('returns an empty array when the RPC returns null', async () => {
    rpcCallMock.mockResolvedValueOnce(null as unknown as never[])
    const result = await cardFollowersRepository.listFollowers('card-1')
    expect(result).toEqual([])
  })
})

describe('cardFollowersRepository.isFollowing', () => {
  function buildBuilder(result: {data: unknown; error: unknown}) {
    const calls: Array<[string, unknown]> = []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([column, value])
        return builder
      }),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
    }
    return {builder, calls}
  }

  it('returns true when the row exists', async () => {
    const {builder, calls} = buildBuilder({data: {user_id: 'user-1'}, error: null})
    fromMock.mockReturnValue(builder)

    const result = await cardFollowersRepository.isFollowing('card-1', 'user-1')

    expect(result).toBe(true)
    expect(fromMock).toHaveBeenCalledWith('card_followers')
    expect(calls).toEqual([
      ['card_id', 'card-1'],
      ['user_id', 'user-1'],
    ])
  })

  it('returns false when the row is missing', async () => {
    const {builder} = buildBuilder({data: null, error: null})
    fromMock.mockReturnValue(builder)

    const result = await cardFollowersRepository.isFollowing('card-1', 'user-1')

    expect(result).toBe(false)
  })

  it('throws when PostgREST returns an error', async () => {
    const {builder} = buildBuilder({data: null, error: {message: 'boom'}})
    fromMock.mockReturnValue(builder)

    await expect(
      cardFollowersRepository.isFollowing('card-1', 'user-1'),
    ).rejects.toEqual({message: 'boom'})
  })
})
