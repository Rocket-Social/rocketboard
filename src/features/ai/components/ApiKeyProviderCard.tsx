import { useEffect, useState } from 'react'
import { Check, ExternalLink, Eye, EyeOff, Key, Loader2, Trash2 } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import type { AiProvider, ApiKeyStatus } from '../ai.types'

const PROVIDER_CONFIG: Record<AiProvider, {
  consoleLabel: string
  consoleUrl: string
  label: string
  placeholder: string
}> = {
  anthropic: {
    consoleLabel: 'Anthropic Console',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
  },
  google: {
    consoleLabel: 'Google AI Studio',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    label: 'Google',
    placeholder: 'AIza...',
  },
  openai: {
    consoleLabel: 'OpenAI Platform',
    consoleUrl: 'https://platform.openai.com/api-keys',
    label: 'OpenAI',
    placeholder: 'sk-...',
  },
}

type ApiKeyProviderCardProps = {
  existingKey: ApiKeyStatus | null
  isSaving: boolean
  onClear: () => void
  onSave: (key: string) => void
  provider: AiProvider
  savedProvider: AiProvider | null
}

export function ApiKeyProviderCard({
  existingKey,
  isSaving,
  onClear,
  onSave,
  provider,
  savedProvider,
}: ApiKeyProviderCardProps) {
  const [isReplacing, setIsReplacing] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const config = PROVIDER_CONFIG[provider]
  const justSaved = savedProvider === provider

  useEffect(() => {
    if (!justSaved) return

    setIsReplacing(false)
    setKeyInput('')
    setShowKey(false)
  }, [justSaved])

  const showEditor = !existingKey || isReplacing

  return (
    <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas-accent text-text-muted'>
            <Key className='h-4 w-4'/>
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium text-text-strong'>{config.label}</span>
              {existingKey ? (
                <span className='rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'>
                  Configured
                </span>
              ) : null}
            </div>
            <a
              className='mt-1 inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80'
              href={config.consoleUrl}
              rel='noreferrer'
              target='_blank'
            >
              Get a key from {config.consoleLabel}
              <ExternalLink className='h-3 w-3'/>
            </a>
          </div>
        </div>
      </div>

      {existingKey && !showEditor ? (
        <div className='mt-4 rounded-2xl bg-canvas-accent px-3 py-3'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='font-mono text-xs text-text-strong'>
                {existingKey.lastFour ? `••••••••••••${existingKey.lastFour}` : 'Saved'}
              </p>
              <p className='mt-1 text-xs text-text-muted'>
                {existingKey.setAt ? `Saved ${new Date(existingKey.setAt).toLocaleDateString()}` : 'Saved recently'}
              </p>
            </div>

            <div className='flex gap-2'>
              <Button
                onClick={() => setIsReplacing(true)}
                type='button'
                variant='secondary'
              >
                Replace
              </Button>
              <Button
                onClick={onClear}
                type='button'
                variant='ghost'
              >
                <Trash2 className='h-3.5 w-3.5'/>
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditor ? (
        <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
          <div className='relative flex-1'>
            <Input
              autoComplete='off'
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={config.placeholder}
              type={showKey ? 'text' : 'password'}
              value={keyInput}
            />
            <button
              className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-strong'
              onClick={() => setShowKey((current) => !current)}
              type='button'
            >
              {showKey ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
            </button>
          </div>

          <div className='flex gap-2'>
            {existingKey ? (
              <Button
                onClick={() => {
                  setIsReplacing(false)
                  setKeyInput('')
                  setShowKey(false)
                }}
                type='button'
                variant='secondary'
              >
                Cancel
              </Button>
            ) : null}
            <Button
              disabled={!keyInput.trim() || isSaving}
              onClick={() => onSave(keyInput.trim())}
              type='button'
              variant='primary'
            >
              {isSaving ? (
                <Loader2 className='h-4 w-4 animate-spin'/>
              ) : justSaved ? (
                <Check className='h-4 w-4'/>
              ) : existingKey ? (
                'Update'
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
