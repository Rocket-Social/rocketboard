import { useEffect, useRef } from 'react'
import { User } from 'lucide-react'

import { ACCENT_BG } from '../ai.constants'
import type { AiMessage, AiPersona, AiToolCall } from '../ai.types'
import { AiMessageText } from './AiMessageText'
import { AiToolCallConfirmation } from './AiToolCallConfirmation'

type AiMessageListProps = {
  isStreaming?: boolean
  messages: AiMessage[]
  onApproveToolCall?: (toolCallId: string) => void
  onApproveAllToolCalls?: () => void
  onSkipToolCall?: (toolCallId: string) => void
  persona: AiPersona | null
  streamingText?: string
}

export function AiMessageList({
  isStreaming = false,
  messages,
  onApproveToolCall,
  onApproveAllToolCalls,
  onSkipToolCall,
  persona,
  streamingText = '',
}: AiMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new content
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Only auto-scroll if user is near bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, streamingText])

  const avatarBg = ACCENT_BG[persona?.accentColor ?? 'blue'] ?? ACCENT_BG.blue
  const initial = persona?.name?.charAt(0).toUpperCase() ?? 'A'

  return (
    <div className="flex-1 overflow-y-auto" ref={containerRef}>
      <div className="flex flex-col gap-4 px-4 py-4">
        {messages.map((msg) => (
          <MessageBubble
            avatarBg={avatarBg}
            initial={initial}
            key={msg.id}
            message={msg}
            onApproveAllToolCalls={onApproveAllToolCalls}
            onApproveToolCall={onApproveToolCall}
            onSkipToolCall={onSkipToolCall}
            personaName={persona?.name ?? 'Assistant'}
          />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingText ? (
          <div className="flex gap-3">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${avatarBg}`}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium text-text-muted">
                {persona?.name ?? 'Assistant'}
              </p>
              <div className="rounded-2xl rounded-tl-md bg-canvas-accent px-3 py-2 text-sm text-text-strong">
                <AiMessageText content={streamingText} />
                <span
                  aria-hidden="true"
                  className="mt-1 inline-block h-4 w-1 animate-pulse bg-text-muted align-text-bottom"
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Streaming indicator when no text yet */}
        {isStreaming && !streamingText ? (
          <div className="flex gap-3">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${avatarBg}`}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium text-text-muted">
                {persona?.name ?? 'Assistant'}
              </p>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-canvas-accent px-3 py-2">
                <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function MessageBubble({
  avatarBg,
  initial,
  message,
  onApproveAllToolCalls,
  onApproveToolCall,
  onSkipToolCall,
  personaName,
}: {
  avatarBg: string
  initial: string
  message: AiMessage
  onApproveAllToolCalls?: () => void
  onApproveToolCall?: (toolCallId: string) => void
  onSkipToolCall?: (toolCallId: string) => void
  personaName: string
}) {
  const isUser = message.role === 'user'
  const pendingToolCalls = (message.toolCalls ?? []).filter(
    (tc: AiToolCall) => !(message.metadata as Record<string, unknown>)?.['resolved_' + tc.id],
  )

  if (isUser) {
    return (
      <div className="flex gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-canvas-accent text-text-muted">
          <User className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium text-text-muted">You</p>
          <div className="rounded-2xl rounded-tl-md bg-primary/10 px-3 py-2 text-sm text-text-strong">
            <AiMessageText content={message.content} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${avatarBg}`}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-text-muted">{personaName}</p>
        <div className="rounded-2xl rounded-tl-md bg-canvas-accent px-3 py-2 text-sm text-text-strong">
          <AiMessageText content={message.content} />
        </div>
        {pendingToolCalls.length > 0 && onApproveToolCall && onSkipToolCall ? (
          <div className="mt-2">
            <AiToolCallConfirmation
              onApprove={onApproveToolCall}
              onApproveAll={onApproveAllToolCalls ?? (() => {})}
              onSkip={onSkipToolCall}
              toolCalls={pendingToolCalls}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
