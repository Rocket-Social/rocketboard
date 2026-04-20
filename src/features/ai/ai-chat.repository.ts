import { streamEdgeFunction } from '../../platform/edge/edge-client'
import type { AiSurface, SurfaceContext } from './ai.types'

export type ChatStreamCallbacks = {
  onComplete: (fullText: string, conversationId: string) => void
  onError: (error: string) => void
  onToken: (token: string) => void
}

function extractStreamToken(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const anthropicText = (parsed as {
    delta?: { text?: string }
    type?: string
  })
  if (anthropicText.type === 'content_block_delta' && anthropicText.delta?.text) {
    return anthropicText.delta.text
  }

  const openAiText = (parsed as {
    choices?: Array<{ delta?: { content?: string } }>
  }).choices?.[0]?.delta?.content
  if (openAiText) {
    return openAiText
  }

  const googleParts = (parsed as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }).candidates?.[0]?.content?.parts
  if (Array.isArray(googleParts)) {
    const googleText = googleParts
      .map((part) => part.text ?? '')
      .join('')
    return googleText || null
  }

  return null
}

export async function sendChatMessage(
  params: {
    conversationId?: string | null
    message: string
    personaId: string
    signal?: AbortSignal
    surface: AiSurface
    surfaceContext?: SurfaceContext
  },
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const signal = params.signal

  try {
    const response = await streamEdgeFunction('ai-chat', {
      body: {
        conversationId: params.conversationId,
        message: params.message,
        personaId: params.personaId,
        surface: params.surface,
        surfaceContext: params.surfaceContext,
      },
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: string } | null
      callbacks.onError(
        error?.error
          ?? (response.status === 401 ? 'Not authenticated' : `Chat failed (${response.status})`),
      )
      return
    }

    const conversationId = response.headers.get('X-Conversation-Id') ?? params.conversationId ?? ''
    const reader = response.body?.getReader()

    if (!reader) {
      callbacks.onError('No response stream available')
      return
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let lineBuffer = '' // Carry-over buffer for partial lines split across chunks

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const combined = lineBuffer + chunk
          const lines = combined.split('\n')

          lineBuffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const token = extractStreamToken(parsed)
              if (!token) continue
              fullText += token
              callbacks.onToken(token)
            } catch {
              // Skip unparseable lines (event: lines, empty lines, etc.)
            }
          }
        }

        callbacks.onComplete(fullText, conversationId)
      } catch (error) {
        if (signal?.aborted) return
        const message = error instanceof Error ? error.message : 'Stream interrupted'
        callbacks.onError(message)
      }
    }

    void processStream()
  } catch (error) {
    if (signal?.aborted) return
    if (error instanceof Error && error.message === 'Not authenticated') {
      callbacks.onError('Not authenticated')
      return
    }
    const message = error instanceof Error ? error.message : 'Chat request failed'
    callbacks.onError(message)
  }
}
