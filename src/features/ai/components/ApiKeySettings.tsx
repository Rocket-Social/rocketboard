import { useState } from 'react'
import { Bot, Shield } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { useToast } from '../../../components/ui/toast'
import { useConfirmDialog } from '../../../hooks/useConfirmDialog'
import { getErrorMessage } from '../../../platform/data/rpc-adapter'
import { AI_PROVIDER_LABELS } from '../ai.constants'
import type { AiProvider } from '../ai.types'
import { getApiKeyCredentialKindLabel, type ApiKeyCredentialKind } from '../anthropic-auth.shared'
import {
  useApiKeyStatusQuery,
  useClearApiKeyMutation,
  useSetApiKeyMutation,
} from '../api-key.queries'
import { useQueryClient } from '@tanstack/react-query'

import { aiKeyKeys } from '../api-key.queries'
import { beginAnthropicSubscriptionAuth, submitAnthropicSubscriptionCode } from '../api-key.repository'
import { AnthropicProviderCard } from './AnthropicProviderCard'
import { ApiKeyProviderCard } from './ApiKeyProviderCard'
import { ApiKeyStatusBanner } from './ApiKeyStatusBanner'

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'google']

type ApiKeySettingsProps = {
  organizationId: string
}

export function ApiKeySettings({ organizationId }: ApiKeySettingsProps) {
  const { toast } = useToast()
  const { confirm, confirmDialogProps } = useConfirmDialog()
  const queryClient = useQueryClient()
  const statusQuery = useApiKeyStatusQuery(organizationId)
  const setKeyMutation = useSetApiKeyMutation(organizationId)
  const clearKeyMutation = useClearApiKeyMutation(organizationId)
  const [savedCredentialKey, setSavedCredentialKey] = useState<string | null>(null)

  const userKeys = statusQuery.data?.userKeys ?? []
  const configuredProviders = Array.from(new Set(
    userKeys
      .filter((key) => !key.disabledReason)
      .map((key) => AI_PROVIDER_LABELS[key.provider]),
  ))

  const handleSave = (
    provider: AiProvider,
    key: string,
    credentialKind: ApiKeyCredentialKind = 'api_key',
  ) => {
    setKeyMutation.mutate(
      { credentialKind, key, provider, scope: 'user' },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Could not save the API key.'),
            title: 'Save failed',
            variant: 'error',
          })
        },
        onSuccess: () => {
          const credentialKey = `${provider}:${credentialKind}`
          setSavedCredentialKey(credentialKey)
          setTimeout(() => setSavedCredentialKey(null), 2000)
          toast({
            description: provider === 'anthropic'
              ? `Your Anthropic ${getApiKeyCredentialKindLabel(credentialKind).toLowerCase()} has been saved.`
              : `Your ${AI_PROVIDER_LABELS[provider]} key has been saved.`,
            title: 'API key saved',
          })
        },
      },
    )
  }

  const handleStartAnthropicConnect = async () => {
    try {
      const returnPath = typeof window === 'undefined'
        ? '/'
        : `${window.location.pathname}${window.location.search}`
      return await beginAnthropicSubscriptionAuth(returnPath)
    } catch (error) {
      toast({
        description: getErrorMessage(error, 'Could not start the Claude subscription connection flow.'),
        title: 'Connect failed',
        variant: 'error',
      })
      return null
    }
  }

  const handleSubmitAnthropicCode = async (input: { code: string; state: string }) => {
    await submitAnthropicSubscriptionCode(input)
    setSavedCredentialKey('anthropic:subscription')
    setTimeout(() => setSavedCredentialKey(null), 2000)
    toast({
      description: 'Your Claude subscription has been connected.',
      title: 'Connected with Claude',
    })
    void queryClient.invalidateQueries({ queryKey: aiKeyKeys.status(organizationId) })
  }

  const handleClear = async (
    provider: AiProvider,
    credentialKind: ApiKeyCredentialKind = 'api_key',
  ) => {
    const credentialLabel = provider === 'anthropic'
      ? getApiKeyCredentialKindLabel(credentialKind)
      : `${AI_PROVIDER_LABELS[provider]} API key`
    const confirmed = await confirm({
      confirmLabel: 'Delete key',
      title: `Delete your ${credentialLabel}?`,
      variant: 'destructive',
    })

    if (!confirmed) return

    clearKeyMutation.mutate(
      { credentialKind, provider, scope: 'user' },
      {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Could not delete the API key.'),
            title: 'Delete failed',
            variant: 'error',
          })
        },
        onSuccess: () => {
          toast({
            description: `Your ${credentialLabel} has been deleted.`,
            title: 'API key deleted',
          })
        },
      },
    )
  }

  return (
    <>
      <section className='rounded-3xl border border-border-subtle bg-surface-elevated p-5 shadow-panel'>
        <div className='flex items-center gap-2'>
          <Bot className='h-4 w-4 text-text-muted'/>
          <h3 className='font-display text-lg font-semibold text-text-strong'>
            Personal API Keys
          </h3>
        </div>

        <p className='mt-2 text-sm text-text-muted'>
          Add your personal provider keys to enable AI agents. Charges go directly
          to your provider accounts.
        </p>

        {statusQuery.isPending ? (
          <div className='mt-4 space-y-3'>
            {PROVIDERS.map((provider) => (
              <div
                className='h-28 animate-pulse rounded-2xl border border-border-subtle bg-surface-base'
                key={provider}
              />
            ))}
          </div>
        ) : statusQuery.isError ? (
          <div className='mt-4 rounded-2xl border border-border-subtle bg-surface-base p-4'>
            <p className='text-sm font-medium text-text-strong'>Couldn&apos;t load your API key status.</p>
            <p className='mt-1 text-xs text-text-muted'>
              {getErrorMessage(statusQuery.error, 'The server rejected the request.')}
            </p>
            <Button
              className='mt-3'
              onClick={() => { void statusQuery.refetch() }}
              variant='secondary'
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className='mt-4'>
              <ApiKeyStatusBanner configuredProviders={configuredProviders}/>
            </div>
            <div className='mt-4 space-y-3'>
              <AnthropicProviderCard
                apiKeyEntry={userKeys.find((key) => key.provider === 'anthropic' && key.credentialKind === 'api_key') ?? null}
                isFeatureEnabled={Boolean(statusQuery.data?.capabilities.anthropicSubscriptionEnabled)}
                isSaving={setKeyMutation.isPending}
                onClear={(credentialKind) => handleClear('anthropic', credentialKind)}
                onSave={(key, credentialKind) => handleSave('anthropic', key, credentialKind)}
                onStartConnect={handleStartAnthropicConnect}
                onSubmitCode={handleSubmitAnthropicCode}
                savedCredentialKind={
                  savedCredentialKey?.startsWith('anthropic:')
                    ? (savedCredentialKey.split(':')[1] as ApiKeyCredentialKind)
                    : null
                }
                subscriptionEntry={userKeys.find((key) => key.provider === 'anthropic' && key.credentialKind === 'subscription') ?? null}
              />

              {PROVIDERS.filter((provider) => provider !== 'anthropic').map((provider) => {
                const existing = userKeys.find((key) => key.provider === provider && key.credentialKind === 'api_key') ?? null
                return (
                  <ApiKeyProviderCard
                    existingKey={existing}
                    isSaving={setKeyMutation.isPending}
                    key={provider}
                    onClear={() => handleClear(provider, 'api_key')}
                    onSave={(key) => handleSave(provider, key, 'api_key')}
                    provider={provider}
                    savedProvider={savedCredentialKey === `${provider}:api_key` ? provider : null}
                  />
                )
              })}
            </div>
          </>
        )}

        <div className='mt-4 flex items-start gap-2 rounded-2xl bg-canvas-accent px-3 py-2.5'>
          <Shield className='mt-0.5 h-4 w-4 shrink-0 text-text-muted'/>
          <p className='text-xs text-text-muted'>
            Keys are encrypted at rest and never leave the server after saving.
            Only the last 4 characters are shown in Rocketboard.
          </p>
        </div>
      </section>

      {confirmDialogProps ? <ConfirmDialog {...confirmDialogProps} /> : null}
    </>
  )
}
