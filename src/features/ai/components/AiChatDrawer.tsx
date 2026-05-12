import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog'
import type { AiMessage, AiPersona, AiSurface, SurfaceContext } from '../ai.types'
import { sendChatMessage, type ChatStreamCallbacks } from '../ai-chat.repository'
import { aiKeys, useConversationsQuery, useMessagesQuery, usePersonasQuery } from '../ai.queries'
import { AiChatInput } from './AiChatInput'
import { AiMessageList } from './AiMessageList'
import { ConversationHistory } from './ConversationHistory'
import { PersonaSwitcher } from './PersonaSwitcher'
import { SuggestedPrompts } from './SuggestedPrompts'

type AbortRef = AbortController | null

type AiChatDrawerProps = {
  isOpen: boolean
  onClose: () => void
  organizationId: string
  suggestedPrompts?: string[]
  surface: AiSurface
  surfaceContext?: SurfaceContext
  userId: string
}

export function AiChatDrawer({
  isOpen,
  onClose,
  organizationId,
  suggestedPrompts,
  surface,
  surfaceContext,
  userId,
}: AiChatDrawerProps) {
  const queryClient = useQueryClient()
  const personasQuery = usePersonasQuery(isOpen ? organizationId : '')
  const personas = personasQuery.data ?? []
  const enabledPersonas = personas.filter((p) => p.isEnabled)
  const defaultPersona = enabledPersonas[0] ?? null

  const [activePersona, setActivePersona] = useState<AiPersona | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [localMessages, setLocalMessages] = useState<AiMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortRef>(null)
  const surfaceResourceId = surfaceContext?.resourceId

  const conversationsQuery = useConversationsQuery(
    isOpen ? userId : '',
    isOpen ? surface : undefined,
    isOpen ? surfaceResourceId : undefined,
  )
  const messagesQuery = useMessagesQuery(conversationId)

  // Set default persona once loaded
  useEffect(() => {
    if (!activePersona && defaultPersona) {
      setActivePersona(defaultPersona)
    }
  }, [activePersona, defaultPersona])

  useEffect(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setConversationId(null)
    setError(null)
    setInputValue('')
    setIsStreaming(false)
    setLocalMessages([])
    setStreamingText('')
  }, [surface, surfaceResourceId, userId])

  // Sync messages from server
  const serverMessages = messagesQuery.data ?? []
  const displayMessages = conversationId ? serverMessages : localMessages

  const handleSend = useCallback(
    async (message: string) => {
      if (!activePersona || isStreaming) return

      setError(null)
      setInputValue('')
      setIsStreaming(true)
      setStreamingText('')

      // Optimistically add user message to local state
      const optimisticUserMsg: AiMessage = {
        content: message,
        conversationId: conversationId ?? '',
        createdAt: new Date().toISOString(),
        id: `temp-${Date.now()}`,
        metadata: {},
        role: 'user',
        toolCalls: [],
      }

      if (conversationId) {
        // Optimistically update query cache
        queryClient.setQueryData<AiMessage[]>(
          aiKeys.messages(conversationId),
          (old) => [...(old ?? []), optimisticUserMsg],
        )
      } else {
        setLocalMessages((prev) => [...prev, optimisticUserMsg])
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      const callbacks: ChatStreamCallbacks = {
        onComplete: (_fullText, newConversationId) => {
          if (controller.signal.aborted) return

          setIsStreaming(false)
          setStreamingText('')

          // Set conversation ID if this was the first message
          if (!conversationId && newConversationId) {
            setConversationId(newConversationId)
            setLocalMessages([])
          }

          // Invalidate to get server-persisted messages
          if (newConversationId) {
            void queryClient.invalidateQueries({
              queryKey: aiKeys.messages(newConversationId),
            })
            void queryClient.invalidateQueries({
              queryKey: aiKeys.conversations(userId, surface, surfaceResourceId),
            })
          }
        },
        onError: (errorMsg) => {
          if (controller.signal.aborted) return

          setIsStreaming(false)
          setStreamingText('')
          setError(errorMsg)
        },
        onToken: (token) => {
          if (controller.signal.aborted) return

          setStreamingText((prev) => prev + token)
        },
      }

      await sendChatMessage(
        {
          conversationId,
          message,
          personaId: activePersona.id,
          signal: controller.signal,
          surface,
          surfaceContext,
        },
        callbacks,
      )
    },
    [
      activePersona,
      conversationId,
      isStreaming,
      queryClient,
      surface,
      surfaceContext,
      surfaceResourceId,
      userId,
    ],
  )

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
    setStreamingText('')
  }, [])

  const handlePersonaSwitch = useCallback(
    (persona: AiPersona) => {
      // Switching persona starts a new conversation
      setActivePersona(persona)
      setConversationId(null)
      setLocalMessages([])
      setStreamingText('')
      setError(null)
      setInputValue('')
    },
    [],
  )

  const handleSelectConversation = useCallback(
    (convId: string) => {
      setConversationId(convId)
      setLocalMessages([])
      setStreamingText('')
      setError(null)

      // Find the persona for this conversation
      const conv = (conversationsQuery.data ?? []).find((c) => c.id === convId)
      if (conv) {
        const persona = personas.find((p) => p.id === conv.personaId)
        if (persona) setActivePersona(persona)
      }
    },
    [conversationsQuery.data, personas],
  )

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      void handleSend(prompt)
    },
    [handleSend],
  )

  // Tool call approval placeholders (wired to backend in a future phase)
  const handleApproveToolCall = useCallback((toolCallId: string) => {
    console.log('[ai-chat] Approve tool call:', toolCallId)
  }, [])

  const handleApproveAllToolCalls = useCallback(() => {
    console.log('[ai-chat] Approve all tool calls')
  }, [])

  const handleSkipToolCall = useCallback((toolCallId: string) => {
    console.log('[ai-chat] Skip tool call:', toolCallId)
  }, [])

  if (!isOpen) return null

  const showSuggested = displayMessages.length === 0 && !isStreaming

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className="fixed left-auto right-0 top-0 flex h-full w-[min(400px,100vw)] translate-x-0 translate-y-0 flex-col rounded-none border-l bg-surface-base p-0"
        showCloseButton={false}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <DialogTitle className="sr-only">AI chat</DialogTitle>
          <DialogDescription className="sr-only">Chat with the AI assistant about the current surface.</DialogDescription>
          <div className="min-w-0 flex-1">
            {activePersona ? (
              <PersonaSwitcher
                currentPersona={activePersona}
                onSwitch={handlePersonaSwitch}
                personas={personas}
              />
            ) : (
              <p className="text-sm font-medium text-text-muted">Loading...</p>
            )}
          </div>
          <ConversationHistory
            conversations={conversationsQuery.data ?? []}
            currentConversationId={conversationId}
            onSelect={handleSelectConversation}
          />
          <button
            aria-label="Close AI chat"
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-canvas-accent hover:text-text-strong"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages or suggested prompts */}
        {showSuggested ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <SuggestedPrompts onSelect={handleSuggestedPrompt} prompts={suggestedPrompts} surface={surface} />
          </div>
        ) : (
          <AiMessageList
            isStreaming={isStreaming}
            messages={displayMessages}
            onApproveAllToolCalls={handleApproveAllToolCalls}
            onApproveToolCall={handleApproveToolCall}
            onSkipToolCall={handleSkipToolCall}
            persona={activePersona}
            streamingText={streamingText}
          />
        )}

        {/* Error */}
        {error ? (
          <div className="border-t border-error/20 bg-error/5 px-4 py-2">
            <p className="text-xs text-error">{error}</p>
          </div>
        ) : null}

        {/* Input */}
        <AiChatInput
          disabled={!activePersona}
          isStreaming={isStreaming}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={handleStop}
          value={inputValue}
        />
      </DialogContent>
    </Dialog>
  )
}
