import type { ApiKeyCredentialKind } from './anthropic-auth.shared'

export type AiProvider = 'openai' | 'anthropic' | 'google'

export type AiPersona = {
  accentColor: string | null
  avatarUrl: string | null
  fallbackCredentialKind: ApiKeyCredentialKind | null
  fallbackModel: null | string
  fallbackProvider: AiProvider | null
  createdAt: string
  createdBy: string | null
  focusArea: string | null
  id: string
  isDefault: boolean
  isEnabled: boolean
  model: string
  name: string
  organizationId: string
  primaryCredentialKind: ApiKeyCredentialKind
  provider: AiProvider
  slug: string
  systemPrompt: string
  updatedAt: string
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
}
