import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AiProvider } from './ai.types'
import { clearApiKey, getApiKeyStatus, setApiKey } from './api-key.repository'
import type { ApiKeyCredentialKind } from './anthropic-auth.shared'

export const aiKeyKeys = {
  all: ['ai-api-keys'] as const,
  status: (orgId?: string) => [...aiKeyKeys.all, 'status', orgId] as const,
}

export function apiKeyStatusQueryOptions(organizationId?: string) {
  return queryOptions({
    enabled: !!organizationId,
    queryFn: () => getApiKeyStatus(organizationId),
    queryKey: aiKeyKeys.status(organizationId),
    retry: false,
    staleTime: 60_000,
  })
}

export function useApiKeyStatusQuery(organizationId?: string) {
  return useQuery(apiKeyStatusQueryOptions(organizationId))
}

export function useSetApiKeyMutation(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      key,
      provider,
      scope,
      credentialKind,
    }: {
      credentialKind?: ApiKeyCredentialKind
      key: string
      provider: AiProvider
      scope: 'user' | 'org'
    }) => setApiKey(provider, key, scope, credentialKind, organizationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiKeyKeys.status(organizationId) })
    },
  })
}

export function useClearApiKeyMutation(organizationId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      provider,
      scope,
      credentialKind,
    }: {
      credentialKind?: ApiKeyCredentialKind
      provider: AiProvider
      scope: 'user' | 'org'
    }) => clearApiKey(provider, scope, credentialKind, organizationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiKeyKeys.status(organizationId) })
    },
  })
}
