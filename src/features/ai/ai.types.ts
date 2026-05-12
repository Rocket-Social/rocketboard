import type { ApiKeyCredentialKind } from './anthropic-auth.shared'

export type AiProvider = 'openai' | 'anthropic' | 'google'

// Wave 2 Phase 1 (PRD §7.1) added 6 columns to ai_personas to support
// agents-as-app-users dispatch. All have defaults so existing code paths
// that construct an AiPersona just need to include the defaults.
export type AiPersonaRole = 'assistant' | 'chat' | 'monitor' | 'retro'
export type AiPersonaAutonomy = 'auto' | 'manual'
export type AiPersonaVisibility = 'creator_only' | 'org'

export type AiPersona = {
  accentColor: string | null
  agentUserId: string | null
  autonomyLevel: AiPersonaAutonomy
  avatarUrl: string | null
  capabilities: string[]
  fallbackCredentialKind: ApiKeyCredentialKind | null
  fallbackModel: null | string
  fallbackProvider: AiProvider | null
  createdAt: string
  createdBy: string | null
  defaultReviewUserId: string | null
  focusArea: string | null
  id: string
  isDefault: boolean
  isEnabled: boolean
  // Phase 7-C: rolling-60-min rate cap on agent runs picked up for this
  // persona. NULL = admin opt-out (no cap). Default 60 from the DB.
  maxRunsPerHour: number | null
  model: string
  name: string
  organizationId: string
  primaryCredentialKind: ApiKeyCredentialKind
  provider: AiProvider
  role: AiPersonaRole
  slug: string
  systemPrompt: string
  updatedAt: string
  visibility: AiPersonaVisibility
}

// Defaults for the Phase 1 columns. Used by buildDraftPersona + test
// fixtures so a single source of truth controls what "no overrides
// specified" means for the AI Kanban-related fields.
export const AI_PERSONA_PHASE1_DEFAULTS: Pick<
  AiPersona,
  'agentUserId' | 'autonomyLevel' | 'capabilities' | 'defaultReviewUserId' | 'role' | 'visibility'
> = {
  agentUserId: null,
  autonomyLevel: 'manual',
  capabilities: ['add_comment'],
  defaultReviewUserId: null,
  role: 'assistant',
  visibility: 'org',
}

export type AiConversation = {
  createdAt: string
  id: string
  personaId: string
  surface: AiSurface
  surfaceResourceId: string | null
  title: string | null
  updatedAt: string
  userId: string
}

export type AiMessage = {
  content: string
  conversationId: string
  createdAt: string
  id: string
  metadata: Record<string, unknown>
  role: 'user' | 'assistant' | 'system'
  toolCalls: AiToolCall[]
}

export type AiToolCall = {
  action: string
  description: string
  id: string
  params: Record<string, unknown>
}

export type AiSurface = 'notes' | 'project' | 'wiki' | 'card' | 'global'

export type WikiSurfaceMode = 'empty-index' | 'index' | 'page'

export type WikiSurfacePageReference = {
  fullPath: string
  title: string
  updatedAt?: string
}

export type WikiSurfaceTreeReference = {
  depth: number
  fullPath: string
  title: string
}

export type ApiKeyStatus = {
  credentialKind: ApiKeyCredentialKind
  disabledReason?: string | null
  lastFour: null | string
  provider: AiProvider
  setAt: string
  setBy?: string
}

export type ApiKeyConfig = {
  capabilities: {
    anthropicSubscriptionEnabled: boolean
  }
  orgKeys: ApiKeyStatus[]
  userKeys: ApiKeyStatus[]
}

export type SurfaceContext = {
  activeNoteTitle?: string
  cards?: Array<{ status?: string; title?: string }>
  folderName?: string
  folderStructure?: Array<{ id: string; name: string }>
  noteContent?: string
  projectName?: string
  resourceId?: string
  sprintName?: string
  wikiBreadcrumbs?: string[]
  wikiPageContentMd?: string
  wikiPageCount?: number
  wikiPageList?: WikiSurfaceTreeReference[]
  wikiPagePath?: string
  wikiPageStatus?: string
  wikiPageTitle?: string
  wikiPageUpdatedAt?: string
  wikiPinnedPages?: WikiSurfacePageReference[]
  wikiRecentPages?: WikiSurfacePageReference[]
  wikiView?: WikiSurfaceMode
}
