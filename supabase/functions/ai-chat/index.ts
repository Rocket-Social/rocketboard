import { decryptToken } from '../_shared/github-crypto.ts'
import {
  buildAnthropicHeaders,
  buildAnthropicSystemPrompt,
  getAnthropicDisabledReason,
  type ApiKeyCredentialKind,
} from '../../../src/features/ai/anthropic-auth.shared.ts'
import {
  refreshStoredAnthropicOauthCredential,
  resolveStoredAnthropicCredential,
  type ResolvedAnthropicCredential,
} from '../_shared/anthropic-auth.ts'
import { getAnthropicSubscriptionFeatureEnabled } from '../_shared/feature-flags.ts'
import {
  createServiceClient,
  errorResponseForException,
  getAuthenticatedUser,
  handleCors,
  errorResponse,
  corsHeaders,
  parseJsonBody,
  z,
} from '../_shared/supabase.ts'
import {withMonitoring} from '../_shared/monitoring.ts'

export const ChatRequestBodySchema = z.object({
  personaId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1, 'message is required').max(32000, 'Message too long (max 32,000 characters)'),
  surface: z.enum(['notes', 'project', 'wiki', 'card', 'global']),
  surfaceContext: z.record(z.unknown()).optional(),
})

type ChatRequest = z.infer<typeof ChatRequestBodySchema>

type PersonaRow = {
  fallback_credential_kind: ApiKeyCredentialKind | null
  fallback_model: string | null
  fallback_provider: string | null
  id: string
  name: string
  organization_id: string
  provider: string
  primary_credential_kind: ApiKeyCredentialKind | null
  model: string
  system_prompt: string
  is_enabled: boolean
}

type MessageRow = {
  role: string
  content: string
}

type KeyRow = {
  credential_kind: ApiKeyCredentialKind | null
  encrypted_key: string | null
  encrypted_refresh_token: string | null
  expires_at: string | null
  id: string
}

type ProviderRoute = {
  credentialKind: ApiKeyCredentialKind
  model: string
  provider: string
}

type ResolvedRouteCredentials = {
  apiKey: string | null
  anthropicCredential: ResolvedAnthropicCredential | null
  keyRow: KeyRow
  route: ProviderRoute
}

class ProviderRequestError extends Error {
  hardFailure: boolean
  route: ProviderRoute

  constructor(route: ProviderRoute, message: string, hardFailure: boolean) {
    super(message)
    this.name = 'ProviderRequestError'
    this.route = route
    this.hardFailure = hardFailure
  }
}

const PROVIDER_API_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
}

const MAX_CONTEXT_TOKENS = 4000
const MAX_HISTORY_MESSAGES = 20
const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-5-20250514': 'claude-sonnet-4-20250514',
}

function createProviderRequestError(route: ProviderRoute, message: string, hardFailure: boolean) {
  return new ProviderRequestError(route, message, hardFailure)
}

function isHardProviderRequestError(error: unknown): error is ProviderRequestError {
  return error instanceof ProviderRequestError && error.hardFailure
}

function getCredentialLabel(route: ProviderRoute) {
  if (route.provider === 'anthropic' && route.credentialKind === 'subscription') {
    return 'Claude subscription'
  }

  if (route.provider === 'anthropic') {
    return 'Anthropic API key'
  }

  if (route.provider === 'openai') {
    return 'OpenAI API key'
  }

  if (route.provider === 'google') {
    return 'Google API key'
  }

  return `${route.provider} credentials`
}

function looksLikeModelAvailabilityError(errorText: string) {
  return /model|unsupported|unavailable|not found|does not exist/i.test(errorText)
}

function extractAnthropicErrorDetail(errorText: string): string | null {
  const trimmed = errorText?.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: string; type?: string } }
    const message = parsed.error?.message?.trim()
    if (message) {
      // Anthropic's error messages can be quite long; cap so the provider error
      // doesn't overwhelm the chat UI.
      return message.length > 220 ? `${message.slice(0, 220)}…` : message
    }
    const type = parsed.error?.type?.trim()
    if (type) return type
  } catch {
    // Not JSON — fall through
  }
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed
}

function resolveProviderModel(provider: string, model: string): string {
  if (provider !== 'anthropic') return model
  return ANTHROPIC_MODEL_ALIASES[model] ?? model
}

function buildContextSummary(surface: string, surfaceContext?: Record<string, unknown>): string {
  if (!surfaceContext) return ''

  const parts: string[] = [`Current surface: ${surface}`]

  if (surface === 'notes') {
    if (surfaceContext.activeNoteTitle) {
      parts.push(`Active note: "${surfaceContext.activeNoteTitle}"`)
    }
    if (surfaceContext.folderName) {
      parts.push(`Current folder: "${surfaceContext.folderName}"`)
    }
    if (surfaceContext.noteContent && typeof surfaceContext.noteContent === 'string') {
      const content = surfaceContext.noteContent.slice(0, MAX_CONTEXT_TOKENS)
      parts.push(`Note content:\n${content}`)
    }
    if (Array.isArray(surfaceContext.folderStructure)) {
      parts.push(`Folder structure: ${JSON.stringify(surfaceContext.folderStructure).slice(0, 500)}`)
    }
  } else if (surface === 'project') {
    if (surfaceContext.projectName) {
      parts.push(`Project: "${surfaceContext.projectName}"`)
    }
    if (surfaceContext.sprintName) {
      parts.push(`Active sprint: "${surfaceContext.sprintName}"`)
    }
    if (Array.isArray(surfaceContext.cards)) {
      const cardSummary = surfaceContext.cards
        .slice(0, 50)
        .map((c: { title?: string; status?: string }) => `- ${c.title ?? 'Untitled'} (${c.status ?? 'unknown'})`)
        .join('\n')
      parts.push(`Sprint cards:\n${cardSummary}`)
    }
  }

  return parts.join('\n')
}

async function streamAnthropicResponse(
  route: ProviderRoute,
  credential: ResolvedAnthropicCredential,
  model: string,
  systemPrompt: string,
  messages: MessageRow[],
  refreshOnUnauthorized?: () => Promise<ResolvedAnthropicCredential>,
): Promise<Response> {
  const sendRequest = async (nextCredential: ResolvedAnthropicCredential) => {
    try {
      return await fetch(PROVIDER_API_URLS.anthropic, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAnthropicHeaders({
            credentialKind: nextCredential.credentialKind,
            token: nextCredential.token,
          }),
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: buildAnthropicSystemPrompt({
            credentialKind: route.credentialKind,
            systemPrompt,
          }),
          stream: true,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
    } catch {
      throw createProviderRequestError(route, 'Anthropic is currently unreachable. Try again in a moment.', true)
    }
  }

  let activeCredential = credential
  let response = await sendRequest(activeCredential)

  if (
    response.status === 401
    && activeCredential.canRefresh
    && refreshOnUnauthorized
  ) {
    try {
      activeCredential = await refreshOnUnauthorized()
    } catch (error) {
      throw createProviderRequestError(
        route,
        error instanceof Error
          ? error.message
          : 'Claude subscription credentials could not be refreshed. Reconnect them in API Keys.',
        true,
      )
    }
    response = await sendRequest(activeCredential)
  }

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 401 || response.status === 403) {
      throw createProviderRequestError(
        route,
        activeCredential.credentialKind === 'api_key'
          ? 'Your Anthropic API key was rejected. Check your key in Account Settings.'
          : 'Your Claude subscription credentials were rejected. Reconnect them in API Keys.',
        true,
      )
    }
    if (response.status === 404) {
      throw createProviderRequestError(route, `Anthropic couldn't find model "${model}".`, true)
    }
    if (response.status === 429) {
      // Surface Anthropic's body so the user can tell whether they hit the API
      // quota or the Claude Code subscription bucket (which is shared across
      // every tool that reuses Anthropic's public claude-cli OAuth client —
      // Claude Code CLI, Hermes, OpenClaw, Rocketboard — and is distinct from
      // general claude.ai web chat usage).
      const detail = extractAnthropicErrorDetail(errorText)
      const base = route.credentialKind === 'subscription'
        ? 'Anthropic rate limit reached on your Claude subscription. If you also use Claude Code or Hermes, they share the same subscription usage bucket. Try again in a moment, or switch this persona to an API key.'
        : 'Anthropic rate limit reached. Try again in a moment.'
      throw createProviderRequestError(route, detail ? `${base} (${detail})` : base, true)
    }
    if (response.status >= 500) {
      throw createProviderRequestError(route, 'Anthropic is currently unavailable. Try again in a moment.', true)
    }
    if (looksLikeModelAvailabilityError(errorText)) {
      throw createProviderRequestError(route, `Anthropic couldn't use model "${model}".`, true)
    }
    throw createProviderRequestError(route, `Anthropic API error (${response.status}): ${errorText.slice(0, 200)}`, false)
  }

  return response
}

async function streamOpenAIResponse(
  route: ProviderRoute,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: MessageRow[],
): Promise<Response> {
  let response: Response

  try {
    response = await fetch(PROVIDER_API_URLS.openai, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    })
  } catch {
    throw createProviderRequestError(route, 'OpenAI is currently unreachable. Try again in a moment.', true)
  }

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 401 || response.status === 403) {
      throw createProviderRequestError(route, 'Your OpenAI API key was rejected. Check your key in Account Settings.', true)
    }
    if (response.status === 429) {
      throw createProviderRequestError(route, 'OpenAI rate limit reached. Try again in a moment.', true)
    }
    if (response.status === 404) {
      throw createProviderRequestError(route, `OpenAI couldn't find model "${model}".`, true)
    }
    if (response.status >= 500) {
      throw createProviderRequestError(route, 'OpenAI is currently unavailable. Try again in a moment.', true)
    }
    if (looksLikeModelAvailabilityError(errorText)) {
      throw createProviderRequestError(route, `OpenAI couldn't use model "${model}".`, true)
    }
    throw createProviderRequestError(route, `OpenAI API error (${response.status}): ${errorText.slice(0, 200)}`, false)
  }

  return response
}

async function streamGoogleResponse(
  route: ProviderRoute,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: MessageRow[],
): Promise<Response> {
  let response: Response

  try {
    response = await fetch(`${PROVIDER_API_URLS.google}/${normalizeGoogleModel(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: messages.map((message) => ({
          parts: [{ text: message.content }],
          role: message.role === 'assistant' ? 'model' : 'user',
        })),
      }),
    })
  } catch {
    throw createProviderRequestError(route, 'Google Gemini is currently unreachable. Try again in a moment.', true)
  }

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 401 || response.status === 403) {
      throw createProviderRequestError(route, 'Your Google API key was rejected. Check your key in API Keys.', true)
    }
    if (response.status === 429) {
      throw createProviderRequestError(route, 'Google Gemini rate limit reached. Try again in a moment.', true)
    }
    if (response.status === 404) {
      throw createProviderRequestError(route, `Google Gemini couldn't find model "${model}".`, true)
    }
    if (response.status >= 500) {
      throw createProviderRequestError(route, 'Google Gemini is currently unavailable. Try again in a moment.', true)
    }
    if (looksLikeModelAvailabilityError(errorText)) {
      throw createProviderRequestError(route, `Google Gemini couldn't use model "${model}".`, true)
    }
    throw createProviderRequestError(route, `Google Gemini API error (${response.status}): ${errorText.slice(0, 200)}`, false)
  }

  return response
}

function normalizeGoogleModel(model: string) {
  return model.startsWith('models/') ? model : `models/${model}`
}

function buildPersonaRoutes(persona: PersonaRow): ProviderRoute[] {
  const primary: ProviderRoute = {
    credentialKind: persona.provider === 'anthropic'
      ? persona.primary_credential_kind ?? 'api_key'
      : 'api_key',
    model: persona.model,
    provider: persona.provider,
  }

  const routes = [primary]

  if (persona.fallback_provider && persona.fallback_model) {
    const fallback: ProviderRoute = {
      credentialKind: persona.fallback_provider === 'anthropic'
        ? persona.fallback_credential_kind ?? 'api_key'
        : 'api_key',
      model: persona.fallback_model,
      provider: persona.fallback_provider,
    }

    const isDuplicate = fallback.provider === primary.provider
      && fallback.model === primary.model
      && fallback.credentialKind === primary.credentialKind

    if (!isDuplicate) {
      routes.push(fallback)
    }
  }

  return routes
}

async function resolveRouteCredentials(input: {
  anthropicSubscriptionEnabled: boolean
  organizationId: string
  route: ProviderRoute
  supabase: ReturnType<typeof createServiceClient>
  userId: string
}): Promise<ResolvedRouteCredentials> {
  const { anthropicSubscriptionEnabled, organizationId, route, supabase, userId } = input

  async function lookupKey(credentialKind: ApiKeyCredentialKind): Promise<KeyRow | null> {
    const { data: found } = await supabase
      .from('ai_api_keys')
      .select('id, encrypted_key, credential_kind, encrypted_refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', route.provider)
      .eq('credential_kind', credentialKind)
      .maybeSingle()
    if (found) return found as KeyRow

    const { data: orgFound } = await supabase
      .from('ai_api_keys')
      .select('id, encrypted_key, credential_kind, encrypted_refresh_token, expires_at')
      .eq('organization_id', organizationId)
      .eq('provider', route.provider)
      .eq('credential_kind', credentialKind)
      .maybeSingle()
    return (orgFound as KeyRow | null) ?? null
  }

  let resolvedKeyRow = await lookupKey(route.credentialKind)
  let effectiveRoute = route

  // Auto-fallback: if the preferred credentialKind isn't configured but the
  // other Anthropic credential kind is, use it. This keeps seeded personas
  // (which default to api_key) working for users who only wired up a Claude
  // subscription, without requiring them to edit every persona.
  if (!resolvedKeyRow && route.provider === 'anthropic') {
    const fallbackKind: ApiKeyCredentialKind = route.credentialKind === 'api_key' ? 'subscription' : 'api_key'
    const fallbackAllowedByFlag = fallbackKind === 'api_key' || anthropicSubscriptionEnabled
    if (fallbackAllowedByFlag) {
      const fallbackRow = await lookupKey(fallbackKind)
      if (fallbackRow) {
        resolvedKeyRow = fallbackRow
        effectiveRoute = { ...route, credentialKind: fallbackKind }
      }
    }
  }

  if (!resolvedKeyRow) {
    throw createProviderRequestError(
      route,
      `No ${getCredentialLabel(route)} configured. Add one in API Keys.`,
      true,
    )
  }

  if (effectiveRoute.provider === 'anthropic') {
    const disabledReason = getAnthropicDisabledReason({
      credentialKind: effectiveRoute.credentialKind,
      featureEnabled: anthropicSubscriptionEnabled,
      provider: effectiveRoute.provider,
    })

    if (disabledReason) {
      throw createProviderRequestError(effectiveRoute, disabledReason, true)
    }

    let anthropicCredential: ResolvedAnthropicCredential
    try {
      anthropicCredential = await resolveStoredAnthropicCredential(supabase, resolvedKeyRow)
    } catch (error) {
      throw createProviderRequestError(
        effectiveRoute,
        error instanceof Error
          ? error.message
          : 'Anthropic credentials could not be loaded. Update them in API Keys.',
        true,
      )
    }

    return {
      apiKey: null,
      anthropicCredential,
      keyRow: resolvedKeyRow,
      route: effectiveRoute,
    }
  }

  const apiKey = await decryptToken(resolvedKeyRow.encrypted_key ?? '')
  if (!apiKey) {
    throw createProviderRequestError(
      effectiveRoute,
      `Failed to decrypt ${getCredentialLabel(effectiveRoute)}. The saved credential may be corrupted.`,
      true,
    )
  }

  return {
    apiKey,
    anthropicCredential: null,
    keyRow: resolvedKeyRow,
    route: effectiveRoute,
  }
}

function createAccumulatingStream(
  upstreamResponse: Response,
  onComplete: (fullText: string) => void,
): ReadableStream<Uint8Array> {
  const reader = upstreamResponse.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let lineBuffer = '' // Carry-over for partial lines split across chunks

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        onComplete(fullText)
        controller.close()
        return
      }
      // Accumulate text from SSE data lines for assistant message persistence
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
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text
          } else if (parsed.choices?.[0]?.delta?.content) {
            fullText += parsed.choices[0].delta.content
          } else if (Array.isArray(parsed.candidates?.[0]?.content?.parts)) {
            const googleChunk = parsed.candidates[0].content.parts
              .map((part: { text?: string }) => part.text ?? '')
              .join('')
            if (googleChunk) {
              fullText += googleChunk
            }
          }
        } catch { /* skip unparseable lines */ }
      }
      controller.enqueue(value)
    },
    cancel() {
      reader.cancel()
    },
  })
}

Deno.serve(withMonitoring('ai-chat', async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const user = await getAuthenticatedUser(req)
  if (!user) {
    return errorResponse('Authentication required', 401)
  }

  let body: ChatRequest
  try {
    body = await parseJsonBody(req, ChatRequestBodySchema)
  } catch (err) {
    return errorResponseForException(err, 'Invalid request', 'ai-chat')
  }

  const supabase = createServiceClient()

  // Load persona and verify org membership
  const { data: persona, error: personaError } = await supabase
    .from('ai_personas')
    .select('id, name, organization_id, provider, model, primary_credential_kind, fallback_provider, fallback_model, fallback_credential_kind, system_prompt, is_enabled')
    .eq('id', body.personaId)
    .maybeSingle()

  if (personaError || !persona) {
    return errorResponse('Persona not found', 404)
  }

  const typedPersona = persona as PersonaRow

  if (!typedPersona.is_enabled) {
    return errorResponse('This AI agent is currently disabled', 400)
  }

  // Verify user is a member of the persona's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', typedPersona.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return errorResponse('Not authorized to use this AI agent', 403)
  }

  // Create or load conversation (verify ownership if resuming)
  let conversationId = body.conversationId

  if (conversationId) {
    const { data: existingConv } = await supabase
      .from('ai_conversations')
      .select('user_id')
      .eq('id', conversationId)
      .maybeSingle()

    if (!existingConv || existingConv.user_id !== user.id) {
      return errorResponse('Conversation not found or not authorized', 403)
    }
  }

  if (!conversationId) {
    const { data: newConversation, error: convError } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: user.id,
        persona_id: typedPersona.id,
        surface: body.surface,
        surface_resource_id: body.surfaceContext?.resourceId as string | undefined,
        title: body.message.trim().slice(0, 100),
      })
      .select('id')
      .single()

    if (convError || !newConversation) {
      console.error('[ai-chat] Failed to create conversation:', convError)
      return errorResponse('Failed to create conversation', 500)
    }

    conversationId = newConversation.id
  }

  // Save user message IMMEDIATELY (before streaming)
  const { error: msgError } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: body.message.trim(),
    })

  if (msgError) {
    console.error('[ai-chat] Failed to save user message:', msgError)
    return errorResponse('Failed to save message', 500)
  }

  // Load conversation history
  const { data: history } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_MESSAGES)

  const messages: MessageRow[] = (history ?? []).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }))

  // Build system prompt with context
  const contextSummary = buildContextSummary(body.surface, body.surfaceContext)
  const fullSystemPrompt = contextSummary
    ? `${typedPersona.system_prompt}\n\n--- CURRENT CONTEXT ---\n${contextSummary}`
    : typedPersona.system_prompt
  const anthropicSubscriptionEnabled = await getAnthropicSubscriptionFeatureEnabled()
  const routes = buildPersonaRoutes(typedPersona)

  // Stream from LLM provider
  let lastError: Error | null = null

  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const route = routes[routeIndex]

    try {
      const resolvedRoute = await resolveRouteCredentials({
        anthropicSubscriptionEnabled,
        organizationId: typedPersona.organization_id,
        route,
        supabase,
        userId: user.id,
      })
      const resolvedModel = resolveProviderModel(route.provider, route.model)

      if (resolvedModel !== route.model) {
        console.warn('[ai-chat] Remapped model alias:', route.model, '->', resolvedModel)
      }

      let upstreamResponse: Response

      if (route.provider === 'anthropic') {
        upstreamResponse = await streamAnthropicResponse(
          route,
          resolvedRoute.anthropicCredential!,
          resolvedModel,
          fullSystemPrompt,
          messages,
          resolvedRoute.anthropicCredential?.canRefresh
            ? async () => {
              const { data: latestKeyRow } = await supabase
                .from('ai_api_keys')
                .select('id, encrypted_key, credential_kind, encrypted_refresh_token, expires_at')
                .eq('id', resolvedRoute.keyRow.id)
                .maybeSingle()

              if (!latestKeyRow) {
                throw createProviderRequestError(route, 'Claude subscription credentials are missing. Reconnect in API Keys.', true)
              }

              return refreshStoredAnthropicOauthCredential(supabase, latestKeyRow as KeyRow)
            }
            : undefined,
        )
      } else if (route.provider === 'openai') {
        upstreamResponse = await streamOpenAIResponse(
          route,
          resolvedRoute.apiKey!,
          resolvedModel,
          fullSystemPrompt,
          messages,
        )
      } else if (route.provider === 'google') {
        upstreamResponse = await streamGoogleResponse(
          route,
          resolvedRoute.apiKey!,
          resolvedModel,
          fullSystemPrompt,
          messages,
        )
      } else {
        throw createProviderRequestError(route, `Provider ${route.provider} streaming is not supported.`, false)
      }

      const stream = createAccumulatingStream(upstreamResponse, (fullText) => {
        // Save assistant message after stream completes (fire-and-forget)
        if (fullText.trim()) {
          supabase
            .from('ai_messages')
            .insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: fullText,
            })
            .then(({ error: saveError }) => {
              if (saveError) {
                console.error('[ai-chat] Failed to save assistant message:', saveError)
              }
            })
        }
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Conversation-Id': conversationId,
          'Access-Control-Expose-Headers': 'X-Conversation-Id',
        },
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('AI request failed')
      console.error('[ai-chat] LLM error:', lastError.message)

      const shouldTryFallback = routeIndex === 0
        && routes.length > 1
        && isHardProviderRequestError(error)

      if (shouldTryFallback) {
        console.warn('[ai-chat] Primary route failed, trying fallback route:', lastError.message)
        continue
      }

      return errorResponse(lastError.message, 502)
    }
  }

  return errorResponse(lastError?.message ?? 'AI request failed', 502)
}))
