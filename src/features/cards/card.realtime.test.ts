import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createTestQueryClient} from '../../test/queryClient'
import {applyAgentRunRealtimePatch, applyCardCommentRealtimePatch} from './card.realtime'
import {cardDetailQueryOptions} from './card.queries'
import type {CardDetail} from './card.types'

function makeCardDetail(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    id: 'card-1',
    projectId: 'project-1',
    projectKey: 'P1',
    projectCardNumber: 1,
    cardRef: 'P1-1',
    title: 'Test card',
    bodyMd: '',
    bodyJson: {type: 'doc', content: []},
    statusOptionId: null,
    priorityOptionId: null,
    assigneeName: 'Unassigned',
    assigneeUserId: null,
    startAt: null,
    dueAt: null,
    effort: null,
    groupId: null,
    groupPosition: 0,
    tags: [],
    statusPosition: 0,
    sprintId: null,
    initiativeId: null,
    createdAt: '2026-05-05T12:00:00.000Z',
    completedAt: null,
    customFieldValues: {},
    attachments: [],
    agentRunSummary: null,
    comments: [],
    ...overrides,
  }
}

describe('applyCardCommentRealtimePatch (D8)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('patches body_text + is_streaming on UPDATE without an invalidate', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      cardDetailQueryOptions('card-1').queryKey,
      makeCardDetail({
        comments: [
          {
            id: 'c-1',
            authorName: 'Sara',
            authorUserId: 'agent-user',
            bodyText: 'partial...',
            createdAt: '2026-05-05T12:01:00.000Z',
            isStreaming: true,
            agentRunContext: null,
          },
        ],
      }),
    )

    const result = applyCardCommentRealtimePatch(queryClient, 'card-1', {
      eventType: 'UPDATE',
      new: {id: 'c-1', body_text: 'partial...complete', is_streaming: false},
      old: {id: 'c-1', body_text: 'partial...', is_streaming: true},
    })

    expect(result.patched).toBe(true)
    const detail = queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)
    expect(detail?.comments[0].bodyText).toBe('partial...complete')
    expect(detail?.comments[0].isStreaming).toBe(false)
  })

  it('reports no patch on INSERT (caller falls through to invalidate)', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(cardDetailQueryOptions('card-1').queryKey, makeCardDetail())

    const result = applyCardCommentRealtimePatch(queryClient, 'card-1', {
      eventType: 'INSERT',
      new: {id: 'c-new', body_text: 'fresh', is_streaming: true},
    })

    expect(result.patched).toBe(false)
  })

  it('reports no patch when neither body nor streaming changed', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      cardDetailQueryOptions('card-1').queryKey,
      makeCardDetail({
        comments: [
          {
            id: 'c-1',
            authorName: 'Sara',
            authorUserId: 'agent-user',
            bodyText: 'same',
            createdAt: '2026-05-05T12:01:00.000Z',
            isStreaming: true,
            agentRunContext: null,
          },
        ],
      }),
    )

    const result = applyCardCommentRealtimePatch(queryClient, 'card-1', {
      eventType: 'UPDATE',
      new: {id: 'c-1', body_text: 'same', is_streaming: true},
      old: {id: 'c-1', body_text: 'same', is_streaming: true},
    })

    expect(result.patched).toBe(false)
  })
})

describe('applyAgentRunRealtimePatch (D8)', () => {
  it('patches the agent_run_context status when only status changed', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      cardDetailQueryOptions('card-1').queryKey,
      makeCardDetail({
        comments: [
          {
            id: 'c-1',
            authorName: 'Sara',
            authorUserId: 'agent-user',
            bodyText: 'agent text',
            createdAt: '2026-05-05T12:01:00.000Z',
            isStreaming: false,
            agentRunContext: {
              runId: 'run-1',
              personaId: 'persona-1',
              personaName: 'Sara',
              personaAccentColor: 'orange',
              status: 'running',
              toolCalls: [],
            },
          },
        ],
      }),
    )

    const result = applyAgentRunRealtimePatch(queryClient, 'card-1', {
      eventType: 'UPDATE',
      new: {id: 'run-1', status: 'awaiting_approval', tool_calls: []},
      old: {id: 'run-1', status: 'running', tool_calls: []},
    })

    expect(result.patched).toBe(true)
    expect(result.needsInvalidate).toBe(false)
    const detail = queryClient.getQueryData<CardDetail>(cardDetailQueryOptions('card-1').queryKey)
    expect(detail?.comments[0].agentRunContext?.status).toBe('awaiting_approval')
  })

  it('signals invalidate when tool_calls JSONB changed', () => {
    const queryClient = createTestQueryClient()

    const result = applyAgentRunRealtimePatch(queryClient, 'card-1', {
      eventType: 'UPDATE',
      new: {id: 'run-1', status: 'awaiting_approval', tool_calls: [{toolu: 1}]},
      old: {id: 'run-1', status: 'awaiting_approval', tool_calls: []},
    })

    expect(result.patched).toBe(false)
    expect(result.needsInvalidate).toBe(true)
  })

  it('signals invalidate on INSERT', () => {
    const queryClient = createTestQueryClient()

    const result = applyAgentRunRealtimePatch(queryClient, 'card-1', {
      eventType: 'INSERT',
      new: {id: 'run-1', status: 'queued'},
    })

    expect(result.needsInvalidate).toBe(true)
  })
})
