import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Plus } from 'lucide-react'

import { Button } from '../../components/ui/button'
import { useToast } from '../../components/ui/toast'
import { getErrorMessage } from '../../platform/data/rpc-adapter'
import { useSignedInAppFrame } from '../shell/SignedInAppFrame'
import { buildOrgApiKeysHref } from '../shell/route-helpers'
import { createUniquePersonaSlug, getDefaultModelForProvider } from './ai.constants'
import type { ApiKeyCredentialKind } from './anthropic-auth.shared'
import type { AiPersona, ApiKeyConfig } from './ai.types'
import {
  useCreatePersonaMutation,
  usePersonasQuery,
  useSeedPersonasMutation,
  useUpdatePersonaMutation,
} from './ai.queries'
import { useApiKeyStatusQuery } from './api-key.queries'
import { PersonaCard } from './components/PersonaCard'
import { PersonaEditDialog, type PersonaFormValues } from './components/PersonaEditDialog'

function pickDefaultAnthropicCredentialKind(
  keyStatus: ApiKeyConfig | undefined,
): ApiKeyCredentialKind {
  // Default new personas to whichever credential the user has actually wired up.
  // If only a Claude subscription is configured, pick that; otherwise default to
  // api_key (the historical default, covers "both" and "neither" cases).
  if (!keyStatus) return 'api_key'
  const anthropicKeys = [...(keyStatus.userKeys ?? []), ...(keyStatus.orgKeys ?? [])]
    .filter((key) => key.provider === 'anthropic' && !key.disabledReason)
  const hasApiKey = anthropicKeys.some((key) => key.credentialKind === 'api_key')
  const hasSubscription = anthropicKeys.some((key) => key.credentialKind === 'subscription')
  if (hasSubscription && !hasApiKey) return 'subscription'
  return 'api_key'
}

function buildDraftPersona(
  organizationId: string,
  primaryCredentialKind: ApiKeyCredentialKind,
): AiPersona {
  return {
    accentColor: 'blue',
    avatarUrl: null,
    createdAt: '',
    createdBy: null,
    fallbackCredentialKind: null,
    fallbackModel: null,
    fallbackProvider: null,
    focusArea: null,
    id: 'draft-persona',
    isDefault: false,
    isEnabled: true,
    model: getDefaultModelForProvider('anthropic'),
    name: '',
    organizationId,
    primaryCredentialKind,
    provider: 'anthropic',
    slug: 'draft-persona',
    systemPrompt: 'You are a helpful AI assistant.',
    updatedAt: '',
  }
}

export function AiAgentsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { currentWorkspace, workspaces } = useSignedInAppFrame()
  const [dialogState, setDialogState] = useState<{
    mode: 'create' | 'edit'
    persona: AiPersona
  } | null>(null)
  const orgId = currentWorkspace?.organizationId ?? workspaces[0]?.organizationId ?? ''

  const personasQuery = usePersonasQuery(orgId)
  const seedMutation = useSeedPersonasMutation()
  const updateMutation = useUpdatePersonaMutation(orgId)
  const createMutation = useCreatePersonaMutation(orgId)
  const keyStatusQuery = useApiKeyStatusQuery(orgId)
  const hasSeededRef = useRef(false)

  const personas = personasQuery.data ?? []
  const hasAnyKey =
    (keyStatusQuery.data?.userKeys.filter((key) => !key.disabledReason).length ?? 0) > 0
    || (keyStatusQuery.data?.orgKeys.filter((key) => !key.disabledReason).length ?? 0) > 0
  const shouldShowNoApiKeyWarning = keyStatusQuery.isSuccess && !hasAnyKey

  // Auto-seed default personas on first visit
  useEffect(() => {
    if (
      orgId &&
      !hasSeededRef.current &&
      personasQuery.data &&
      personasQuery.data.length === 0 &&
      !personasQuery.isPending &&
      !seedMutation.isPending
    ) {
      hasSeededRef.current = true
      seedMutation.mutate(orgId, {
        onError: (error) => {
          toast({
            description: getErrorMessage(error, 'Could not set up AI agents.'),
            title: 'Setup failed',
            variant: 'error',
          })
        },
      })
    }
  }, [orgId, personasQuery.data, personasQuery.isPending, seedMutation, toast])

  const handleToggle = useCallback(
    (personaId: string, currentEnabled: boolean) => {
      updateMutation.mutate(
        { personaId, updates: { isEnabled: !currentEnabled } },
        {
          onError: (error) => {
            toast({
              description: getErrorMessage(error),
              title: 'Update failed',
              variant: 'error',
            })
          },
        },
      )
    },
    [updateMutation, toast],
  )

  const handleSavePersona = useCallback(
    (values: PersonaFormValues) => {
      if (!dialogState) return

      if (dialogState.mode === 'edit') {
        updateMutation.mutate(
          { personaId: dialogState.persona.id, updates: values },
          {
            onError: (error) => {
              toast({
                description: getErrorMessage(error),
                title: 'Update failed',
                variant: 'error',
              })
            },
            onSuccess: () => {
              setDialogState(null)
            },
          },
        )
        return
      }

      createMutation.mutate(
        {
          ...values,
          slug: createUniquePersonaSlug(values.name, personas.map((persona) => persona.slug)),
        },
        {
          onError: (error) => {
            toast({
              description: getErrorMessage(error),
              title: 'Create failed',
              variant: 'error',
            })
          },
          onSuccess: () => {
            setDialogState(null)
          },
        },
      )
    },
    [createMutation, dialogState, personas, toast, updateMutation],
  )

  return (
    <>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Bot className="h-6 w-6 text-primary" />
              <h1 className="font-display text-2xl font-semibold text-text-strong">AI Agents</h1>
            </div>
            <p className="mt-1 text-sm text-text-muted">Your AI team</p>
          </div>
          <Button
            onClick={() => setDialogState({
              mode: 'create',
              persona: buildDraftPersona(
                orgId,
                pickDefaultAnthropicCredentialKind(keyStatusQuery.data),
              ),
            })}
            type="button"
            variant="primary"
          >
            <Plus className="h-4 w-4" />
            New agent
          </Button>
        </div>

        {/* No API key warning */}
        {shouldShowNoApiKeyWarning ? (
          <div className="mb-6 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3">
            <p className="text-sm text-warning">
              No API key configured. Open{' '}
              <button
                className="font-medium underline underline-offset-2 hover:no-underline"
                onClick={() => {
                  if (!currentWorkspace) return
                  void navigate({ href: buildOrgApiKeysHref(currentWorkspace.organizationSlug) })
                }}
                type="button"
              >
                API Keys
              </button>{' '}
              to add one.
            </p>
          </div>
        ) : null}

        {/* Persona grid */}
        {personasQuery.isPending || seedMutation.isPending ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="h-[180px] animate-pulse rounded-3xl border border-border-subtle bg-surface-base" key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personas.map((persona) => (
              <PersonaCard
                key={persona.id}
                onEdit={() => setDialogState({ mode: 'edit', persona })}
                onToggle={() => handleToggle(persona.id, persona.isEnabled)}
                persona={persona}
              />
            ))}
          </div>
        )}
      </div>

      {dialogState ? (
        <PersonaEditDialog
          isOpen={!!dialogState}
          isSaving={dialogState.mode === 'create' ? createMutation.isPending : updateMutation.isPending}
          mode={dialogState.mode}
          onClose={() => setDialogState(null)}
          onSave={handleSavePersona}
          persona={dialogState.persona}
        />
      ) : null}
    </>
  )
}
