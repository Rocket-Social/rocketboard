import { getSupabaseBrowserClient } from '../../platform/supabase/client'
import { snakeToCamel } from '../../platform/data/rpc-adapter'
import type { AiConversation, AiMessage, AiPersona } from './ai.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables not yet in generated types; regenerate after migration
function aiTable(name: string): any {
  return (getSupabaseBrowserClient() as any).from(name)
}

export async function listPersonas(organizationId: string): Promise<AiPersona[]> {
  const { data, error } = await aiTable('ai_personas')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row: unknown) => snakeToCamel<AiPersona>(row))
}

export async function updatePersona(
  personaId: string,
  updates: Partial<Pick<
    AiPersona,
    | 'accentColor'
    | 'fallbackCredentialKind'
    | 'fallbackModel'
    | 'fallbackProvider'
    | 'focusArea'
    | 'isEnabled'
    | 'maxRunsPerHour'
    | 'model'
    | 'name'
    | 'primaryCredentialKind'
    | 'provider'
    | 'systemPrompt'
  >>,
): Promise<void> {
  const snakeUpdates: Record<string, unknown> = {}
  if (updates.name !== undefined) snakeUpdates.name = updates.name
  if (updates.systemPrompt !== undefined) snakeUpdates.system_prompt = updates.systemPrompt
  if (updates.focusArea !== undefined) snakeUpdates.focus_area = updates.focusArea
  if (updates.accentColor !== undefined) snakeUpdates.accent_color = updates.accentColor
  if (updates.isEnabled !== undefined) snakeUpdates.is_enabled = updates.isEnabled
  if (updates.maxRunsPerHour !== undefined) snakeUpdates.max_runs_per_hour = updates.maxRunsPerHour
  if (updates.provider !== undefined) snakeUpdates.provider = updates.provider
  if (updates.model !== undefined) snakeUpdates.model = updates.model
  if (updates.primaryCredentialKind !== undefined) {
    snakeUpdates.primary_credential_kind = updates.primaryCredentialKind
  }
  if (updates.fallbackProvider !== undefined) snakeUpdates.fallback_provider = updates.fallbackProvider
  if (updates.fallbackModel !== undefined) snakeUpdates.fallback_model = updates.fallbackModel
  if (updates.fallbackCredentialKind !== undefined) {
    snakeUpdates.fallback_credential_kind = updates.fallbackCredentialKind
  }

  const { error } = await aiTable('ai_personas')
    .update(snakeUpdates)
    .eq('id', personaId)

  if (error) throw error
}

export async function createPersona(
  organizationId: string,
  persona: Pick<
    AiPersona,
    | 'accentColor'
    | 'fallbackCredentialKind'
    | 'fallbackModel'
    | 'fallbackProvider'
    | 'focusArea'
    | 'maxRunsPerHour'
    | 'model'
    | 'name'
    | 'primaryCredentialKind'
    | 'provider'
    | 'slug'
    | 'systemPrompt'
  >,
): Promise<AiPersona> {
  const insertRow: Record<string, unknown> = {
    organization_id: organizationId,
    name: persona.name,
    slug: persona.slug,
    system_prompt: persona.systemPrompt,
    focus_area: persona.focusArea,
    accent_color: persona.accentColor,
    provider: persona.provider,
    model: persona.model,
    primary_credential_kind: persona.primaryCredentialKind,
    fallback_provider: persona.fallbackProvider,
    fallback_model: persona.fallbackModel,
    fallback_credential_kind: persona.fallbackCredentialKind,
  }
  // Only set max_runs_per_hour explicitly when the form supplied it; let
  // the DB default (60) apply otherwise.
  if (persona.maxRunsPerHour !== undefined) {
    insertRow.max_runs_per_hour = persona.maxRunsPerHour
  }

  const { data, error } = await aiTable('ai_personas')
    .insert(insertRow)
    .select('*')
    .single()

  if (error) throw error
  return snakeToCamel<AiPersona>(data)
}

export async function listConversations(
  userId: string,
  surface?: string,
  surfaceResourceId?: string,
  limit = 20,
): Promise<AiConversation[]> {
  let query = aiTable('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (surface) {
    query = query.eq('surface', surface)
  }

  if (surfaceResourceId) {
    query = query.eq('surface_resource_id', surfaceResourceId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row: unknown) => snakeToCamel<AiConversation>(row))
}

export async function listMessages(conversationId: string): Promise<AiMessage[]> {
  const { data, error } = await aiTable('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw error
  return (data ?? []).map((row: unknown) => snakeToCamel<AiMessage>(row))
}
