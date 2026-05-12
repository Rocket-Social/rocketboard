import {beforeEach, describe, expect, it, vi} from 'vitest'

const {rpcCallSingleMock} = vi.hoisted(() => ({
  rpcCallSingleMock: vi.fn(),
}))

vi.mock('../../platform/data/rpc-adapter', () => ({
  rpcAdapter: {
    callSingle: rpcCallSingleMock,
    call: vi.fn(),
    callAndTransform: vi.fn(),
  },
}))

import {cardRepository} from './card.repository'

const baseCard = {
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
  tags: [] as string[],
  statusPosition: 0,
  sprintId: null,
  initiativeId: null,
  createdAt: '2026-05-05T12:00:00.000Z',
  completedAt: null,
  customFieldValues: {},
  attachments: [] as unknown[],
} as const

describe('cardRepository.getCardDetail', () => {
  beforeEach(() => {
    rpcCallSingleMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('throws CARD_NOT_FOUND when the RPC returns null', async () => {
    rpcCallSingleMock.mockResolvedValue(null)

    await expect(cardRepository.getCardDetail('card-1')).rejects.toThrow('CARD_NOT_FOUND')
  })

  it('parses the new agent_run_context shape into camelCase tool-call entries (D7)', async () => {
    rpcCallSingleMock.mockResolvedValue({
      ...baseCard,
      comments: [
        {
          id: 'c-agent',
          authorName: 'Sara',
          authorUserId: 'agent-user-id',
          bodyText: 'agent body',
          createdAt: '2026-05-05T12:01:00.000Z',
          isStreaming: false,
          agentRunContext: {
            runId: 'run-1',
            personaId: 'persona-1',
            personaName: 'Sara',
            personaAccentColor: 'orange',
            status: 'awaiting_approval',
            toolCalls: [
              {
                name: 'set_card_priority',
                args: {priority: 'p1'},
                status: 'awaiting_approval',
                queuedAt: '2026-05-05T12:01:01.000Z',
                toolUseId: 'toolu_1',
              },
            ],
          },
        },
      ],
      agentRunSummary: {
        runId: 'run-1',
        personaId: 'persona-1',
        personaName: 'Sara',
        personaAccentColor: 'orange',
        status: 'awaiting_approval',
      },
    })

    const detail = await cardRepository.getCardDetail('card-1')

    expect(detail.agentRunSummary).toEqual({
      runId: 'run-1',
      personaId: 'persona-1',
      personaName: 'Sara',
      personaAccentColor: 'orange',
      status: 'awaiting_approval',
    })
    expect(detail.comments[0].isStreaming).toBe(false)
    expect(detail.comments[0].agentRunContext?.toolCalls).toEqual([
      {
        name: 'set_card_priority',
        args: {priority: 'p1'},
        status: 'awaiting_approval',
        queuedAt: '2026-05-05T12:01:01.000Z',
        toolUseId: 'toolu_1',
      },
    ])
  })

  it('drops malformed tool-call entries with a console.warn (D7)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcCallSingleMock.mockResolvedValue({
      ...baseCard,
      comments: [
        {
          id: 'c-agent',
          authorName: 'Sara',
          authorUserId: 'agent-user-id',
          bodyText: 'agent body',
          createdAt: '2026-05-05T12:01:00.000Z',
          isStreaming: true,
          agentRunContext: {
            runId: 'run-1',
            personaId: 'persona-1',
            personaName: 'Sara',
            personaAccentColor: null,
            status: 'awaiting_approval',
            toolCalls: [
              {
                name: 'set_card_priority',
                args: {priority: 'p1'},
                status: 'awaiting_approval',
                queuedAt: '2026-05-05T12:01:01.000Z',
                toolUseId: 'toolu_1',
              },
              // Malformed — missing required toolUseId.
              {
                name: 'invalid',
                args: {},
                status: 'awaiting_approval',
              },
            ],
          },
        },
      ],
      agentRunSummary: null,
    })

    const detail = await cardRepository.getCardDetail('card-1')

    expect(detail.comments[0].agentRunContext?.toolCalls).toHaveLength(1)
    expect(detail.comments[0].agentRunContext?.toolCalls[0].toolUseId).toBe('toolu_1')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dropping malformed tool_call audit entry'),
      expect.anything(),
    )
  })

  it('drops a malformed agent_run_context entirely with a console.warn (D7)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcCallSingleMock.mockResolvedValue({
      ...baseCard,
      comments: [
        {
          id: 'c-agent',
          authorName: 'Sara',
          authorUserId: 'agent-user-id',
          bodyText: 'agent body',
          createdAt: '2026-05-05T12:01:00.000Z',
          isStreaming: false,
          // Malformed — missing required runId.
          agentRunContext: {
            personaId: 'persona-1',
            personaName: 'Sara',
            status: 'awaiting_approval',
            toolCalls: [],
          },
        },
      ],
      agentRunSummary: null,
    })

    const detail = await cardRepository.getCardDetail('card-1')

    expect(detail.comments[0].agentRunContext).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('dropping malformed agent_run_context'),
      expect.anything(),
    )
  })

  it('forward-compat: pre-Phase-4 SQL shape (no new fields) renders cleanly with safe defaults (D13)', async () => {
    rpcCallSingleMock.mockResolvedValue({
      ...baseCard,
      comments: [
        {
          id: 'c-1',
          authorName: 'Joe',
          bodyText: 'plain text',
          createdAt: '2026-05-05T12:00:00.000Z',
        },
      ],
    })

    const detail = await cardRepository.getCardDetail('card-1')

    expect(detail.comments[0].isStreaming).toBe(false)
    expect(detail.comments[0].agentRunContext).toBeNull()
    expect(detail.comments[0].authorUserId).toBeNull()
    expect(detail.agentRunSummary).toBeNull()
  })

  it('backward-compat: post-Phase-4 SQL shape with the new keys populates fields (D13)', async () => {
    rpcCallSingleMock.mockResolvedValue({
      ...baseCard,
      comments: [
        {
          id: 'c-1',
          authorName: 'Joe',
          authorUserId: 'human-user-id',
          bodyText: 'plain text',
          createdAt: '2026-05-05T12:00:00.000Z',
          isStreaming: false,
          agentRunContext: null,
        },
      ],
      agentRunSummary: {
        runId: 'run-2',
        personaId: 'persona-1',
        personaName: 'Sara',
        personaAccentColor: 'orange',
        status: 'running',
      },
    })

    const detail = await cardRepository.getCardDetail('card-1')

    expect(detail.comments[0].authorUserId).toBe('human-user-id')
    expect(detail.comments[0].isStreaming).toBe(false)
    expect(detail.comments[0].agentRunContext).toBeNull()
    expect(detail.agentRunSummary?.status).toBe('running')
  })
})
