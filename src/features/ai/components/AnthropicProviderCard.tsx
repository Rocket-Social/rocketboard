import { useEffect, useState } from 'react'
import { ExternalLink, Eye, EyeOff, Key, Link2, Loader2, Trash2 } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/cn'
import type { ApiKeyStatus } from '../ai.types'

type AnthropicProviderCardProps = {
  apiKeyEntry: ApiKeyStatus | null
  isFeatureEnabled: boolean
  isSaving: boolean
  onClear: (credentialKind: 'api_key' | 'subscription') => void
  onSave: (key: string, credentialKind: 'api_key' | 'subscription') => void
  onStartConnect: () => Promise<{ authorizationUrl: string; state: string } | null>
  onSubmitCode: (input: { code: string; state: string }) => Promise<void>
  savedCredentialKind: null | 'api_key' | 'subscription'
  subscriptionEntry: ApiKeyStatus | null
}

const slotClass = 'rounded-2xl border border-border-subtle bg-surface-elevated p-4'

export function AnthropicProviderCard({
  apiKeyEntry,
  isFeatureEnabled,
  isSaving,
  onClear,
  onSave,
  onStartConnect,
  onSubmitCode,
  savedCredentialKind,
  subscriptionEntry,
}: AnthropicProviderCardProps) {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [setupTokenInput, setSetupTokenInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSetupToken, setShowSetupToken] = useState(false)
  const [isReplacingApiKey, setIsReplacingApiKey] = useState(false)
  const [isReplacingSubscription, setIsReplacingSubscription] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [awaitingPaste, setAwaitingPaste] = useState<{ state: string; authorizationUrl: string } | null>(null)
  const [pastedCode, setPastedCode] = useState('')
  const [isSubmittingCode, setIsSubmittingCode] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)

  useEffect(() => {
    if (savedCredentialKind !== 'api_key') return

    setApiKeyInput('')
    setShowApiKey(false)
    setIsReplacingApiKey(false)
  }, [savedCredentialKind])

  useEffect(() => {
    if (savedCredentialKind !== 'subscription') return

    setSetupTokenInput('')
    setShowSetupToken(false)
    setIsReplacingSubscription(false)
    setAwaitingPaste(null)
    setPastedCode('')
    setPasteError(null)
  }, [savedCredentialKind])

  const showSubscriptionSlot = isFeatureEnabled || Boolean(subscriptionEntry)
  const showApiKeyEditor = !apiKeyEntry || isReplacingApiKey
  const showSubscriptionEditor = isFeatureEnabled && (!subscriptionEntry || isReplacingSubscription)

  async function handleStartConnect() {
    setIsConnecting(true)
    setPasteError(null)
    try {
      const result = await onStartConnect()
      if (result) {
        if (typeof window !== 'undefined') {
          // Returns null on popup-blocked browsers; the waiting-paste UI below
          // surfaces the same URL as a clickable link so the user can still
          // complete the flow manually.
          window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer')
        }
        setAwaitingPaste({ authorizationUrl: result.authorizationUrl, state: result.state })
        setPastedCode('')
      }
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSubmitPastedCode() {
    const trimmed = pastedCode.trim()
    if (!trimmed || !awaitingPaste) return

    // Guard against the common clipboard mishap where the user pastes a URL
    // (e.g. a browser tab address) instead of the auth code from Anthropic.
    // The real code is a base64-like blob optionally followed by `#<uuid>`;
    // anything starting with http(s):// or containing "://" is clearly wrong.
    if (/^https?:\/\//i.test(trimmed) || trimmed.includes('://')) {
      setPasteError(
        'That looks like a URL. Paste the authorization code from Anthropic instead (a long string, optionally followed by "#" and a UUID).',
      )
      return
    }

    setIsSubmittingCode(true)
    setPasteError(null)
    try {
      await onSubmitCode({ code: trimmed, state: awaitingPaste.state })
      setAwaitingPaste(null)
      setPastedCode('')
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : 'Could not complete Claude connection.')
    } finally {
      setIsSubmittingCode(false)
    }
  }

  function handleCancelPaste() {
    setAwaitingPaste(null)
    setPastedCode('')
    setPasteError(null)
  }

  return (
    <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas-accent text-text-muted'>
            <Key className='h-4 w-4' />
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium text-text-strong'>Anthropic</span>
            </div>
            <a
              className='mt-1 inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80'
              href='https://console.anthropic.com/settings/keys'
              rel='noreferrer'
              target='_blank'
            >
              Get a key from Anthropic Console
              <ExternalLink className='h-3 w-3' />
            </a>
          </div>
        </div>
      </div>

      <div className='mt-4 space-y-3'>
        <div className={slotClass}>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <p className='text-sm font-medium text-text-strong'>Anthropic API key</p>
              <p className='mt-1 text-xs text-text-muted'>
                Direct Anthropic API billing with a Console key.
              </p>
            </div>
            {apiKeyEntry ? (
              <span className='rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'>
                Configured
              </span>
            ) : null}
          </div>

          {apiKeyEntry && !showApiKeyEditor ? (
            <div className='mt-3 rounded-2xl bg-canvas-accent px-3 py-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <p className='font-mono text-xs text-text-strong'>
                    {apiKeyEntry.lastFour ? `••••••••••••${apiKeyEntry.lastFour}` : 'Saved'}
                  </p>
                  <p className='mt-1 text-xs text-text-muted'>
                    {apiKeyEntry.setAt ? `Saved ${new Date(apiKeyEntry.setAt).toLocaleDateString()}` : 'Saved recently'}
                  </p>
                </div>

                <div className='flex gap-2'>
                  <Button
                    onClick={() => setIsReplacingApiKey(true)}
                    type='button'
                    variant='secondary'
                  >
                    Replace
                  </Button>
                  <Button
                    onClick={() => onClear('api_key')}
                    type='button'
                    variant='ghost'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {showApiKeyEditor ? (
            <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
              <div className='relative flex-1'>
                <Input
                  autoComplete='off'
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder='sk-ant-...'
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                />
                <button
                  className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-strong'
                  onClick={() => setShowApiKey((current) => !current)}
                  type='button'
                >
                  {showApiKey ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                </button>
              </div>

              <div className='flex gap-2'>
                {apiKeyEntry ? (
                  <Button
                    onClick={() => {
                      setApiKeyInput('')
                      setShowApiKey(false)
                      setIsReplacingApiKey(false)
                    }}
                    type='button'
                    variant='secondary'
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button
                  disabled={!apiKeyInput.trim() || isSaving || isConnecting}
                  onClick={() => onSave(apiKeyInput.trim(), 'api_key')}
                  type='button'
                  variant='primary'
                >
                  {isSaving ? <Loader2 className='h-4 w-4 animate-spin' /> : apiKeyEntry ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {showSubscriptionSlot ? (
          <div className={slotClass}>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm font-medium text-text-strong'>Claude subscription</p>
                <p className='mt-1 text-xs text-text-muted'>
                  Use Claude Pro, Max, Team, or Enterprise credentials.
                </p>
              </div>
              {subscriptionEntry ? (
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  subscriptionEntry.disabledReason
                    ? 'bg-warning/10 text-warning'
                    : 'bg-success/10 text-success',
                )}>
                  {subscriptionEntry.disabledReason ? 'Saved, disabled' : 'Configured'}
                </span>
              ) : null}
            </div>

            {subscriptionEntry && !showSubscriptionEditor ? (
              <div className='mt-3 space-y-3'>
                <div className='rounded-2xl bg-canvas-accent px-3 py-3'>
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                      <p className='font-mono text-xs text-text-strong'>Connected with Claude</p>
                      <p className='mt-1 text-xs text-text-muted'>
                        {subscriptionEntry.setAt ? `Saved ${new Date(subscriptionEntry.setAt).toLocaleDateString()}` : 'Saved recently'}
                      </p>
                    </div>

                    <div className='flex gap-2'>
                      {!isFeatureEnabled ? (
                        <Button
                          onClick={() => setIsReplacingApiKey(true)}
                          type='button'
                          variant='secondary'
                        >
                          Replace with API key
                        </Button>
                      ) : null}
                      {isFeatureEnabled ? (
                        <Button
                          onClick={() => setIsReplacingSubscription(true)}
                          type='button'
                          variant='secondary'
                        >
                          Replace
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => onClear('subscription')}
                        type='button'
                        variant='ghost'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>

                {subscriptionEntry.disabledReason ? (
                  <div className='rounded-2xl border border-warning/20 bg-warning/10 px-3 py-3 text-sm text-warning'>
                    {subscriptionEntry.disabledReason}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showSubscriptionEditor ? (
              <div className='mt-3 space-y-4'>
                {awaitingPaste ? (
                  <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
                    <p className='text-sm font-medium text-text-strong'>Finish connecting with Claude</p>
                    <p className='mt-1 text-xs leading-relaxed text-text-muted'>
                      A new tab should have opened on claude.ai. After you approve Rocketboard, Anthropic shows an
                      authorization code. Copy it and paste it here.
                    </p>
                    <p className='mt-2 text-xs text-text-muted'>
                      Didn't see a new tab?{' '}
                      <a
                        className='font-medium text-primary underline-offset-2 hover:underline'
                        href={awaitingPaste.authorizationUrl}
                        rel='noreferrer'
                        target='_blank'
                      >
                        Open the Claude authorization page
                      </a>
                      .
                    </p>

                    <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
                      <Input
                        autoComplete='off'
                        className='flex-1'
                        onChange={(event) => setPastedCode(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleSubmitPastedCode()
                        }}
                        placeholder='Paste code#state from the Anthropic console…'
                        value={pastedCode}
                      />
                      <div className='flex gap-2'>
                        <Button
                          disabled={isSubmittingCode}
                          onClick={handleCancelPaste}
                          type='button'
                          variant='secondary'
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={!pastedCode.trim() || isSubmittingCode}
                          onClick={() => void handleSubmitPastedCode()}
                          type='button'
                          variant='primary'
                        >
                          {isSubmittingCode ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Connect'}
                        </Button>
                      </div>
                    </div>

                    {pasteError ? (
                      <p className='mt-2 text-xs text-error'>{pasteError}</p>
                    ) : null}
                  </div>
                ) : (
                  <button
                    className='flex w-full items-start justify-between rounded-2xl border border-border-subtle bg-surface-base p-4 text-left transition-colors hover:border-border-strong hover:bg-canvas-accent'
                    disabled={isConnecting || isSaving}
                    onClick={() => void handleStartConnect()}
                    type='button'
                  >
                    <div>
                      <div className='flex items-center gap-2 text-sm font-medium text-text-strong'>
                        <Link2 className='h-4 w-4' />
                        Connect with Claude
                      </div>
                      <p className='mt-2 text-xs leading-relaxed text-text-muted'>
                        Opens a new tab on claude.ai. After you approve, you'll copy a code from the
                        Anthropic console and paste it back here.
                      </p>
                    </div>
                    {isConnecting ? <Loader2 className='h-4 w-4 animate-spin text-text-muted' /> : null}
                  </button>
                )}

                <div className='rounded-2xl border border-border-subtle bg-surface-base p-4'>
                  <p className='text-sm font-medium text-text-strong'>Paste setup token</p>
                  <p className='mt-1 text-xs leading-relaxed text-text-muted'>
                    Run <code>claude setup-token</code>, then paste the subscription token here.
                  </p>

                  <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
                    <div className='relative flex-1'>
                      <Input
                        autoComplete='off'
                        onChange={(event) => setSetupTokenInput(event.target.value)}
                        placeholder='Paste Claude setup token...'
                        type={showSetupToken ? 'text' : 'password'}
                        value={setupTokenInput}
                      />
                      <button
                        className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-strong'
                        onClick={() => setShowSetupToken((current) => !current)}
                        type='button'
                      >
                        {showSetupToken ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                      </button>
                    </div>

                    <Button
                      disabled={!setupTokenInput.trim() || isSaving || isConnecting}
                      onClick={() => onSave(setupTokenInput.trim(), 'subscription')}
                      type='button'
                      variant='primary'
                    >
                      {isSaving ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Save token'}
                    </Button>
                  </div>
                </div>

                {subscriptionEntry ? (
                  <Button
                    onClick={() => {
                      setSetupTokenInput('')
                      setShowSetupToken(false)
                      setIsReplacingSubscription(false)
                      handleCancelPaste()
                    }}
                    type='button'
                    variant='secondary'
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
