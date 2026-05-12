// Wave 2 AI Kanban Phase 4 (PR 4-A) — realtime subscription for the
// CardSheet's comment thread + tool-call action bar.
//
// The hook subscribes to two tables filtered by `card_id=eq.<uuid>`:
//   1. `card_comments` — UPDATE events fire as the worker streams the
//      LLM response into the in-flight `is_streaming=true` row, and
//      again when the worker flips `is_streaming=false`. INSERT /
//      DELETE events fire when a comment is added / removed.
//   2. `ai_agent_runs` — UPDATE events fire when approve/reject
//      transitions a tool-call entry inside the JSONB array, or when
//      the run status flips queued → running → succeeded.
//
// D8 — patch on streaming, invalidate on everything else: streaming
// updates patch the cached `comments[*].body_text` + `is_streaming`
// directly so the bubble re-renders within a frame; INSERTs / DELETEs
// invalidate so the new row is fetched with its full agent_run_context
// shape from `get_card_detail`.
//
// D15 — the migration in this PR adds an idempotent realtime
// publication for both tables; without it this hook silently no-ops.

import {useEffect} from 'react'
import {useQueryClient, type QueryClient} from '@tanstack/react-query'

import {realtimeAdapter} from '../../platform/realtime/realtime-adapter'
import type {CardComment, CardDetail} from './card.types'
import {cardDetailQueryOptions} from './card.queries'

type RealtimePayload = {
  eventType?: 'DELETE' | 'INSERT' | 'UPDATE'
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}

type StreamableCommentPatch = {
  bodyText?: string
  isStreaming?: boolean
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function patchCommentInDetail(
  detail: CardDetail | undefined,
  commentId: string,
  patch: StreamableCommentPatch,
): CardDetail | undefined {
  if (!detail) return detail
  const next = detail.comments.map((comment): CardComment => {
    if (comment.id !== commentId) return comment
    return {
      ...comment,
      bodyText: patch.bodyText ?? comment.bodyText,
      isStreaming: patch.isStreaming ?? comment.isStreaming,
    }
  })
  // Reference-equality short-circuit: when the patch didn't actually
  // change any fields, return the existing detail so React-Query's
  // structural-sharing skips the re-render.
  if (next.every((comment, idx) => comment === detail.comments[idx])) {
    return detail
  }
  return {...detail, comments: next}
}

export function applyCardCommentRealtimePatch(
  queryClient: QueryClient,
  cardId: string,
  payload: RealtimePayload,
): {patched: boolean} {
  const newRow = payload.new ?? {}
  const oldRow = payload.old ?? {}

  const commentId = asString(newRow.id) ?? asString(oldRow.id)
  if (!commentId) return {patched: false}

  // INSERT / DELETE never patch — fall through to invalidate so the new
  // row's full shape (agent_run_context, author_name) lands in the cache.
  if (payload.eventType !== 'UPDATE') return {patched: false}

  const newBody = asString(newRow.body_text)
  const oldBody = asString(oldRow.body_text)
  const newStreaming = asBoolean(newRow.is_streaming)
  const oldStreaming = asBoolean(oldRow.is_streaming)

  const bodyChanged = newBody !== undefined && newBody !== oldBody
  const streamingChanged =
    newStreaming !== undefined && newStreaming !== oldStreaming

  if (!bodyChanged && !streamingChanged) return {patched: false}

  let patched = false
  queryClient.setQueryData<CardDetail | undefined>(
    cardDetailQueryOptions(cardId).queryKey,
    (current) => {
      const next = patchCommentInDetail(current, commentId, {
        bodyText: bodyChanged ? newBody : undefined,
        isStreaming: streamingChanged ? newStreaming : undefined,
      })
      patched = next !== current
      return next
    },
  )
  return {patched}
}

function patchAgentRunInDetail(
  detail: CardDetail | undefined,
  runId: string,
  patch: {status?: string; toolCalls?: unknown[]},
): CardDetail | undefined {
  if (!detail) return detail
  const next = detail.comments.map((comment): CardComment => {
    if (!comment.agentRunContext || comment.agentRunContext.runId !== runId) {
      return comment
    }
    return {
      ...comment,
      agentRunContext: {
        ...comment.agentRunContext,
        status: (patch.status as typeof comment.agentRunContext.status) ?? comment.agentRunContext.status,
        // The tool_calls JSONB is already validated by the repository
        // boundary — but a realtime row hasn't been re-parsed. We
        // intentionally fall through to invalidate when toolCalls
        // changes (handled in the caller below) so the schema parse
        // runs again.
        toolCalls: comment.agentRunContext.toolCalls,
      },
    }
  })
  if (next.every((comment, idx) => comment === detail.comments[idx])) {
    return detail
  }
  return {...detail, comments: next}
}

export function applyAgentRunRealtimePatch(
  queryClient: QueryClient,
  cardId: string,
  payload: RealtimePayload,
): {patched: boolean; needsInvalidate: boolean} {
  if (payload.eventType !== 'UPDATE') {
    return {patched: false, needsInvalidate: true}
  }
  const newRow = payload.new ?? {}
  const oldRow = payload.old ?? {}

  const runId = asString(newRow.id) ?? asString(oldRow.id)
  if (!runId) return {patched: false, needsInvalidate: false}

  const newStatus = asString(newRow.status)
  const oldStatus = asString(oldRow.status)
  const statusChanged = newStatus !== undefined && newStatus !== oldStatus

  // tool_calls changes always need an invalidate so the zod parser at
  // the repository boundary re-runs against the canonical shape.
  const toolCallsChanged = JSON.stringify(newRow.tool_calls) !== JSON.stringify(oldRow.tool_calls)

  if (toolCallsChanged) {
    return {patched: false, needsInvalidate: true}
  }

  if (!statusChanged) {
    return {patched: false, needsInvalidate: false}
  }

  let patched = false
  queryClient.setQueryData<CardDetail | undefined>(
    cardDetailQueryOptions(cardId).queryKey,
    (current) => {
      const next = patchAgentRunInDetail(current, runId, {status: newStatus})
      patched = next !== current
      return next
    },
  )
  return {patched, needsInvalidate: !patched}
}

export function useCardCommentsRealtime(input: {cardId: string | null}) {
  const queryClient = useQueryClient()
  const {cardId} = input

  useEffect(() => {
    if (!cardId) return

    const channel = realtimeAdapter.channel(`card-comments-${cardId}`)

    channel.on(
      'postgres_changes',
      {
        event: '*',
        filter: `card_id=eq.${cardId}`,
        schema: 'public',
        table: 'card_comments',
      },
      (payload) => {
        const {patched} = applyCardCommentRealtimePatch(
          queryClient,
          cardId,
          payload as RealtimePayload,
        )
        if (!patched) {
          void queryClient.invalidateQueries({
            queryKey: cardDetailQueryOptions(cardId).queryKey,
          })
        }
      },
    )

    channel.on(
      'postgres_changes',
      {
        event: '*',
        filter: `card_id=eq.${cardId}`,
        schema: 'public',
        table: 'ai_agent_runs',
      },
      (payload) => {
        const {needsInvalidate} = applyAgentRunRealtimePatch(
          queryClient,
          cardId,
          payload as RealtimePayload,
        )
        if (needsInvalidate) {
          void queryClient.invalidateQueries({
            queryKey: cardDetailQueryOptions(cardId).queryKey,
          })
        }
      },
    )

    void channel.subscribe()

    return () => {
      void realtimeAdapter.removeChannel(channel)
    }
  }, [cardId, queryClient])
}
