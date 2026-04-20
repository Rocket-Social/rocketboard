import { Bot, Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import {
  ACCENT_BG,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODEL_PLACEHOLDERS,
  getDefaultCredentialKindForProvider,
  getDefaultModelForProvider,
} from '../ai.constants'
import type { AiPersona, AiProvider } from '../ai.types'
import type { ApiKeyCredentialKind } from '../anthropic-auth.shared'

const ACCENT_OPTIONS = [
  { key: 'amber', label: 'Amber' },
  { key: 'blue', label: 'Blue' },
  { key: 'green', label: 'Green' },
  { key: 'purple', label: 'Purple' },
  { key: 'red', label: 'Red' },
  { key: 'teal', label: 'Teal' },
] as const

const PROVIDER_OPTIONS: AiProvider[] = ['anthropic', 'openai', 'google']
const CREDENTIAL_KIND_OPTIONS: ApiKeyCredentialKind[] = ['api_key', 'subscription']

export type PersonaFormValues = {
  accentColor: string
  fallbackCredentialKind: ApiKeyCredentialKind | null
  fallbackModel: string | null
  fallbackProvider: AiProvider | null
  focusArea: string | null
  model: string
  name: string
  primaryCredentialKind: ApiKeyCredentialKind
  provider: AiProvider
  systemPrompt: string
}

type PersonaEditDialogProps = {
  isOpen: boolean
  isSaving: boolean
  mode?: 'create' | 'edit'
  onClose: () => void
  onSave: (values: PersonaFormValues) => void
  persona: AiPersona
}

export function PersonaEditDialog({
  isOpen,
  isSaving,
  mode = 'edit',
  onClose,
  onSave,
  persona,
}: PersonaEditDialogProps) {
  const [name, setName] = useState(persona.name)
  const [focusArea, setFocusArea] = useState(persona.focusArea ?? '')
  const [systemPrompt, setSystemPrompt] = useState(persona.systemPrompt)
  const [accentColor, setAccentColor] = useState(persona.accentColor ?? 'blue')
  const [provider, setProvider] = useState<AiProvider>(persona.provider)
  const [model, setModel] = useState(persona.model)
  const [primaryCredentialKind, setPrimaryCredentialKind] = useState<ApiKeyCredentialKind>(persona.primaryCredentialKind)
  const [fallbackProvider, setFallbackProvider] = useState<AiProvider | ''>(persona.fallbackProvider ?? '')
  const [fallbackModel, setFallbackModel] = useState(persona.fallbackModel ?? '')
  const [fallbackCredentialKind, setFallbackCredentialKind] = useState<ApiKeyCredentialKind>(
    persona.fallbackCredentialKind ?? 'api_key',
  )
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false
      return
    }

    if (wasOpenRef.current) return

    wasOpenRef.current = true
    setName(persona.name)
    setFocusArea(persona.focusArea ?? '')
    setSystemPrompt(persona.systemPrompt)
    setAccentColor(persona.accentColor ?? 'blue')
    setProvider(persona.provider)
    setModel(persona.model)
    setPrimaryCredentialKind(persona.primaryCredentialKind)
    setFallbackProvider(persona.fallbackProvider ?? '')
    setFallbackModel(persona.fallbackModel ?? '')
    setFallbackCredentialKind(persona.fallbackCredentialKind ?? 'api_key')
  }, [isOpen, persona])

  const normalizedValues = useMemo<PersonaFormValues>(() => {
    const trimmedFallbackProvider = fallbackProvider || null
    const trimmedFallbackModel = trimmedFallbackProvider ? fallbackModel.trim() || null : null

    return {
      accentColor,
      fallbackCredentialKind: trimmedFallbackProvider
        ? trimmedFallbackProvider === 'anthropic'
          ? fallbackCredentialKind
          : 'api_key'
        : null,
      fallbackModel: trimmedFallbackModel,
      fallbackProvider: trimmedFallbackProvider,
      focusArea: focusArea.trim() || null,
      model: model.trim(),
      name: name.trim(),
      primaryCredentialKind: provider === 'anthropic' ? primaryCredentialKind : 'api_key',
      provider,
      systemPrompt,
    }
  }, [
    accentColor,
    fallbackCredentialKind,
    fallbackModel,
    fallbackProvider,
    focusArea,
    model,
    name,
    primaryCredentialKind,
    provider,
    systemPrompt,
  ])

  const initialValues = useMemo<PersonaFormValues>(() => ({
    accentColor: persona.accentColor ?? 'blue',
    fallbackCredentialKind: persona.fallbackProvider
      ? persona.fallbackProvider === 'anthropic'
        ? persona.fallbackCredentialKind ?? 'api_key'
        : 'api_key'
      : null,
    fallbackModel: persona.fallbackModel,
    fallbackProvider: persona.fallbackProvider,
    focusArea: persona.focusArea,
    model: persona.model,
    name: persona.name,
    primaryCredentialKind: persona.provider === 'anthropic' ? persona.primaryCredentialKind : 'api_key',
    provider: persona.provider,
    systemPrompt: persona.systemPrompt,
  }), [persona])

  const isDirty = mode === 'create'
    ? true
    : JSON.stringify(normalizedValues) !== JSON.stringify(initialValues)
  const canSave = Boolean(
    normalizedValues.name
    && normalizedValues.model
    && normalizedValues.systemPrompt.trim()
    && (!normalizedValues.fallbackProvider || normalizedValues.fallbackModel)
    && !isSaving
    && isDirty,
  )

  const avatarBg = ACCENT_BG[accentColor] ?? ACCENT_BG.blue
  const initial = (name.trim() || persona.name || 'A').charAt(0).toUpperCase()

  function handleSave() {
    if (!canSave) return
    onSave(normalizedValues)
  }

  function handlePrimaryProviderChange(nextProvider: AiProvider) {
    setProvider(nextProvider)
    setModel(getDefaultModelForProvider(nextProvider))
    setPrimaryCredentialKind(getDefaultCredentialKindForProvider(nextProvider))
  }

  function handleFallbackProviderChange(nextProvider: '' | AiProvider) {
    setFallbackProvider(nextProvider)

    if (!nextProvider) {
      setFallbackModel('')
      setFallbackCredentialKind('api_key')
      return
    }

    setFallbackModel(getDefaultModelForProvider(nextProvider))
    setFallbackCredentialKind(getDefaultCredentialKindForProvider(nextProvider))
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className='h-[min(46rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto rounded-[28px] bg-surface-base p-0'>
        <DialogHeader className='flex-row items-center gap-3 px-6 py-5 pr-14'>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl font-display text-lg font-bold text-white ${avatarBg}`}
          >
            {initial}
          </div>
          <div>
            <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>
              {mode === 'create' ? 'New AI Agent' : 'AI Agent'}
            </p>
            <DialogTitle className='font-display text-xl'>
              {mode === 'create' ? 'Create AI Agent' : persona.name}
            </DialogTitle>
            <DialogDescription className='sr-only'>Edit the AI agent's identity, system prompt, and routing configuration.</DialogDescription>
          </div>
        </DialogHeader>

        <div className='space-y-6 px-6 py-5'>
          <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <Bot className='h-4 w-4 text-text-muted' />
              <h3 className='font-display text-lg font-semibold text-text-strong'>
                Identity
              </h3>
            </div>

            <div className='mt-4 space-y-4'>
              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Name</span>
                <Input
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  placeholder='Agent name'
                  value={name}
                />
              </label>

              <label className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Focus area</span>
                <Input
                  onChange={(event) => setFocusArea(event.target.value)}
                  placeholder='e.g. CTO / Strategy'
                  value={focusArea}
                />
              </label>

              <div className='space-y-2'>
                <span className='text-sm font-medium text-text-strong'>Accent color</span>
                <div className='flex gap-2'>
                  {ACCENT_OPTIONS.map((option) => (
                    <button
                      aria-label={option.label}
                      className={`h-8 w-8 rounded-xl transition-all ${
                        ACCENT_BG[option.key]
                      } ${
                        accentColor === option.key
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-elevated'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      key={option.key}
                      onClick={() => setAccentColor(option.key)}
                      type='button'
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <Bot className='h-4 w-4 text-text-muted' />
              <h3 className='font-display text-lg font-semibold text-text-strong'>
                System prompt
              </h3>
            </div>

            <div className='mt-4'>
              <Textarea
                className='min-h-[180px] font-mono text-xs leading-relaxed'
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder='You are a helpful AI assistant.'
                value={systemPrompt}
              />
              <p className='mt-2 text-xs text-text-muted'>
                This prompt defines the agent&apos;s personality and behavior in conversations.
              </p>
            </div>
          </section>

          <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
            <div className='flex items-center gap-2'>
              <Bot className='h-4 w-4 text-text-muted' />
              <h3 className='font-display text-lg font-semibold text-text-strong'>
                Routing
              </h3>
            </div>

            <div className='mt-4 space-y-5'>
              <div className='space-y-4 rounded-2xl border border-border-subtle bg-surface-base p-4'>
                <p className='text-sm font-medium text-text-strong'>Primary model</p>

                <label className='space-y-2'>
                  <span className='text-sm font-medium text-text-strong'>Provider</span>
                  <select
                    aria-label='Primary provider'
                    className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                    onChange={(event) => handlePrimaryProviderChange(event.target.value as AiProvider)}
                    value={provider}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {AI_PROVIDER_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className='space-y-2'>
                  <span className='text-sm font-medium text-text-strong'>Model</span>
                  <Input
                    aria-label='Primary model'
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={AI_PROVIDER_MODEL_PLACEHOLDERS[provider]}
                    value={model}
                  />
                </label>

                {provider === 'anthropic' ? (
                  <label className='space-y-2'>
                    <span className='text-sm font-medium text-text-strong'>Credential</span>
                    <select
                      aria-label='Primary credential kind'
                      className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                      onChange={(event) => setPrimaryCredentialKind(event.target.value as ApiKeyCredentialKind)}
                      value={primaryCredentialKind}
                    >
                      {CREDENTIAL_KIND_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option === 'subscription' ? 'Claude subscription' : 'Anthropic API key'}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className='text-xs text-text-muted'>
                    {AI_PROVIDER_LABELS[provider]} currently uses its standard API key route.
                  </p>
                )}
              </div>

              <div className='space-y-4 rounded-2xl border border-border-subtle bg-surface-base p-4'>
                <p className='text-sm font-medium text-text-strong'>Fallback model</p>

                <label className='space-y-2'>
                  <span className='text-sm font-medium text-text-strong'>Provider</span>
                  <select
                    aria-label='Fallback provider'
                    className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                    onChange={(event) => handleFallbackProviderChange(event.target.value as '' | AiProvider)}
                    value={fallbackProvider}
                  >
                    <option value=''>No fallback</option>
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {AI_PROVIDER_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>

                {fallbackProvider ? (
                  <>
                    <label className='space-y-2'>
                      <span className='text-sm font-medium text-text-strong'>Model</span>
                      <Input
                        aria-label='Fallback model'
                        onChange={(event) => setFallbackModel(event.target.value)}
                        placeholder={AI_PROVIDER_MODEL_PLACEHOLDERS[fallbackProvider]}
                        value={fallbackModel}
                      />
                    </label>

                    {fallbackProvider === 'anthropic' ? (
                      <label className='space-y-2'>
                        <span className='text-sm font-medium text-text-strong'>Credential</span>
                        <select
                          aria-label='Fallback credential kind'
                          className='h-10 w-full rounded-xl border border-border-subtle bg-surface-base px-3 text-sm text-text-strong outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-soft'
                          onChange={(event) => setFallbackCredentialKind(event.target.value as ApiKeyCredentialKind)}
                          value={fallbackCredentialKind}
                        >
                          {CREDENTIAL_KIND_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option === 'subscription' ? 'Claude subscription' : 'Anthropic API key'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className='text-xs text-text-muted'>
                        {AI_PROVIDER_LABELS[fallbackProvider]} fallback uses its standard API key route.
                      </p>
                    )}
                  </>
                ) : (
                  <p className='text-xs text-text-muted'>
                    Rocketboard will use only the primary route when no fallback is configured.
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className='flex justify-end gap-3 pb-2'>
            <Button onClick={onClose} variant='ghost'>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={handleSave} variant='primary'>
              {isSaving ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Save className='h-4 w-4' />
              )}
              {isSaving ? 'Saving...' : mode === 'create' ? 'Create agent' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
