import type { ApiKeyCredentialKind } from './anthropic-auth.shared'
import type { AiProvider } from './ai.types'

export const ACCENT_BG: Record<string, string> = {
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  purple: 'bg-violet-500',
  red: 'bg-red-500',
  teal: 'bg-teal-500',
}

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
}

export const AI_PROVIDER_DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
  openai: 'gpt-5.4',
}

export const AI_PROVIDER_MODEL_PLACEHOLDERS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
  openai: 'gpt-5.4',
}

export function createUniquePersonaSlug(name: string, existingSlugs: string[]) {
  const base = slugify(name) || 'agent'
  const slugSet = new Set(existingSlugs)

  if (!slugSet.has(base)) {
    return base
  }

  let suffix = 2
  let candidate = `${base}-${suffix}`
  while (slugSet.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }

  return candidate
}

export function getDefaultCredentialKindForProvider(provider: AiProvider): ApiKeyCredentialKind {
  if (provider === 'anthropic') {
    return 'api_key'
  }

  return 'api_key'
}

export function getDefaultModelForProvider(provider: AiProvider) {
  return AI_PROVIDER_DEFAULT_MODELS[provider]
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
