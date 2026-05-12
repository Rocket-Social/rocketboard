import {beforeEach, describe, expect, it, vi} from 'vitest'

import {INBOX_PAGE_SIZE} from './inbox.types'

const {fromMock, getSupabaseBrowserClientMock} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
}))

vi.mock('../../platform/supabase/client', () => ({
  getSupabaseBrowserClient: getSupabaseBrowserClientMock,
}))

import {inboxRepository} from './inbox.repository'

type QueryResult = {
  count?: number | null
  data?: unknown
  error: {code?: string; message: string} | null
}

type BuilderCalls = {
  eq: Array<[string, unknown]>
  is: Array<[string, unknown]>
  limit: number[]
  or: string[]
  order: Array<[string, {ascending: boolean}]>
  selects: Array<{columns: string; options?: {count?: string; head?: boolean}}>
  updates: unknown[]
}

function createBuilder(result: QueryResult) {
  const calls: BuilderCalls = {
    eq: [],
    is: [],
    limit: [],
    or: [],
    order: [],
    selects: [],
    updates: [],
  }

  // The query/builder is a "chainable thenable": every method returns `builder`
  // so calls compose, but it also resolves to the QueryResult when awaited.
  // For SELECTs the await happens after the last terminal builder call (we
  // attach `.then` so any await returns the result). For UPDATEs the chain
  // ends with `.eq(id, ...)` which we make awaitable too.
  const builder: any = {
    eq: vi.fn((column: string, value: unknown) => {
      calls.eq.push([column, value])
      return builder
    }),
    is: vi.fn((column: string, value: unknown) => {
      calls.is.push([column, value])
      return builder
    }),
    limit: vi.fn((n: number) => {
      calls.limit.push(n)
      return builder
    }),
    or: vi.fn((expr: string) => {
      calls.or.push(expr)
      return builder
    }),
    order: vi.fn((column: string, options: {ascending: boolean}) => {
      calls.order.push([column, options])
      return builder
    }),
    select: vi.fn((columns: string, options?: {count?: string; head?: boolean}) => {
      calls.selects.push({columns, options})
      return builder
    }),
    update: vi.fn((payload: unknown) => {
      calls.updates.push(payload)
      return builder
    }),
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  }

  return {builder, calls}
}

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    archived_at: null,
    body: null,
    card_id: null,
    created_at: '2026-05-08T10:00:00.000Z',
    id: 'notif-1',
    kind: 'mention',
    link: null,
    organization_id: 'org-1',
    origin_run_id: null,
    origin_user_id: null,
    project_id: null,
    read_at: null,
    title: 'Hello',
    user_id: 'user-1',
    ...overrides,
  }
}

beforeEach(() => {
  fromMock.mockReset()
  getSupabaseBrowserClientMock.mockReset()
  getSupabaseBrowserClientMock.mockReturnValue({from: fromMock})
})

describe('inboxRepository.list', () => {
  it('inbox tab filters read_at IS NULL and archived_at IS NULL', async () => {
    const {builder, calls} = createBuilder({data: [], error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.list({cursor: null, tab: 'inbox'})

    expect(fromMock).toHaveBeenCalledWith('notifications')
    expect(calls.is).toContainEqual(['archived_at', null])
    expect(calls.is).toContainEqual(['read_at', null])
    expect(calls.order).toEqual([
      ['created_at', {ascending: false}],
      ['id', {ascending: false}],
    ])
    expect(calls.limit).toEqual([INBOX_PAGE_SIZE])
    expect(calls.or).toEqual([]) // no cursor
  })

  it('all tab filters archived_at only (no read_at filter)', async () => {
    const {builder, calls} = createBuilder({data: [], error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.list({cursor: null, tab: 'all'})

    expect(calls.is).toContainEqual(['archived_at', null])
    expect(calls.is).not.toContainEqual(['read_at', null])
  })

  it('encodes the cursor into a tuple inequality via or()', async () => {
    const {builder, calls} = createBuilder({data: [], error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.list({
      cursor: {lastCreatedAt: '2026-05-08T10:00:00.000Z', lastId: 'notif-7'},
      tab: 'all',
    })

    expect(calls.or).toEqual([
      'created_at.lt.2026-05-08T10:00:00.000Z,and(created_at.eq.2026-05-08T10:00:00.000Z,id.lt.notif-7)',
    ])
  })

  it('returns nextCursor when the page is full and null when partial', async () => {
    // Full page → nextCursor encodes the last row.
    const fullPage = Array.from({length: INBOX_PAGE_SIZE}, (_, i) =>
      buildRow({id: `notif-${i}`, created_at: `2026-05-08T10:00:${i.toString().padStart(2, '0')}.000Z`}),
    )
    const fullBuilder = createBuilder({data: fullPage, error: null})
    fromMock.mockReturnValue(fullBuilder.builder)

    const fullResult = await inboxRepository.list({cursor: null, tab: 'inbox'})

    expect(fullResult.rows).toHaveLength(INBOX_PAGE_SIZE)
    expect(fullResult.nextCursor).toEqual({
      lastCreatedAt: fullPage[INBOX_PAGE_SIZE - 1].created_at,
      lastId: fullPage[INBOX_PAGE_SIZE - 1].id,
    })

    // Partial page → nextCursor null.
    const partialBuilder = createBuilder({
      data: [buildRow({id: 'notif-only'})],
      error: null,
    })
    fromMock.mockReturnValue(partialBuilder.builder)

    const partialResult = await inboxRepository.list({cursor: null, tab: 'inbox'})
    expect(partialResult.rows).toHaveLength(1)
    expect(partialResult.nextCursor).toBeNull()
  })

  it('maps DB row columns to camelCase NotificationRow shape', async () => {
    const {builder} = createBuilder({
      data: [
        buildRow({
          archived_at: '2026-05-08T11:00:00.000Z',
          card_id: 'card-1',
          link: 'card:card-1',
          read_at: '2026-05-08T10:30:00.000Z',
        }),
      ],
      error: null,
    })
    fromMock.mockReturnValue(builder)

    const result = await inboxRepository.list({cursor: null, tab: 'all'})

    expect(result.rows[0]).toEqual({
      archivedAt: '2026-05-08T11:00:00.000Z',
      body: null,
      cardId: 'card-1',
      createdAt: '2026-05-08T10:00:00.000Z',
      id: 'notif-1',
      kind: 'mention',
      link: 'card:card-1',
      organizationId: 'org-1',
      originRunId: null,
      originUserId: null,
      projectId: null,
      readAt: '2026-05-08T10:30:00.000Z',
      title: 'Hello',
      userId: 'user-1',
    })
  })

  it('throws when PostgREST returns an error', async () => {
    const {builder} = createBuilder({data: null, error: {message: 'boom'}})
    fromMock.mockReturnValue(builder)
    await expect(inboxRepository.list({cursor: null, tab: 'all'})).rejects.toThrow('boom')
  })
})

describe('inboxRepository.unreadCount', () => {
  it('sends a head-only count with user_id, read_at IS NULL, archived_at IS NULL filters', async () => {
    const {builder, calls} = createBuilder({count: 7, error: null})
    fromMock.mockReturnValue(builder)

    const count = await inboxRepository.unreadCount('user-1')

    expect(count).toBe(7)
    expect(calls.selects).toEqual([
      {columns: 'id', options: {count: 'exact', head: true}},
    ])
    expect(calls.eq).toEqual([['user_id', 'user-1']])
    expect(calls.is).toContainEqual(['read_at', null])
    expect(calls.is).toContainEqual(['archived_at', null])
  })

  it('returns 0 when count is null (PostgREST sometimes omits)', async () => {
    const {builder} = createBuilder({count: null, error: null})
    fromMock.mockReturnValue(builder)
    const count = await inboxRepository.unreadCount('user-1')
    expect(count).toBe(0)
  })
})

describe('inboxRepository.markRead / markUnread / archive', () => {
  it('markRead sets read_at to current time and filters by id', async () => {
    const {builder, calls} = createBuilder({data: null, error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.markRead('notif-7')

    expect(calls.updates).toHaveLength(1)
    expect(typeof (calls.updates[0] as {read_at?: string}).read_at).toBe('string')
    expect(calls.eq).toEqual([['id', 'notif-7']])
  })

  it('markUnread sets read_at to null', async () => {
    const {builder, calls} = createBuilder({data: null, error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.markUnread('notif-7')

    expect(calls.updates).toEqual([{read_at: null}])
  })

  it('archive sets archived_at to current time', async () => {
    const {builder, calls} = createBuilder({data: null, error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.archive('notif-7')

    expect((calls.updates[0] as {archived_at?: string}).archived_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    )
  })
})

describe('inboxRepository.markAllRead', () => {
  it('inbox tab updates read_at and filters user_id + read_at IS NULL + archived_at IS NULL', async () => {
    const {builder, calls} = createBuilder({data: null, error: null})
    fromMock.mockReturnValue(builder)

    await inboxRepository.markAllRead({tab: 'inbox', userId: 'user-1'})

    expect(typeof (calls.updates[0] as {read_at?: string}).read_at).toBe('string')
    expect(calls.eq).toEqual([['user_id', 'user-1']])
    expect(calls.is).toContainEqual(['read_at', null])
    expect(calls.is).toContainEqual(['archived_at', null])
  })

  it('all tab is a no-op (the bulk button isn\'t rendered there)', async () => {
    await inboxRepository.markAllRead({tab: 'all', userId: 'user-1'})
    expect(fromMock).not.toHaveBeenCalled()
  })
})
