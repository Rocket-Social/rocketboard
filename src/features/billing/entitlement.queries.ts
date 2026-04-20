import {queryOptions, useQuery} from '@tanstack/react-query'

import {entitlementRepository} from './entitlement.repository'

type OrgEntitlementsQueryOptions = {
  includeAdminDetails?: boolean
}

export function orgUsageQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: ['org-usage', orgId],
    queryFn: () => entitlementRepository.getOrgUsage(orgId),
    staleTime: 30_000, // 30s — usage counts change with member/project operations
    enabled: !!orgId,
  })
}

export function orgEntitlementsQueryOptions(orgId: string, options?: OrgEntitlementsQueryOptions) {
  return queryOptions({
    queryKey: ['org-entitlements', orgId, options?.includeAdminDetails ?? false],
    queryFn: () => entitlementRepository.getOrgEntitlements(orgId, options),
    staleTime: 60_000, // 1min — plan changes are infrequent
    enabled: !!orgId,
  })
}

export function useOrgUsageQuery(orgId: string) {
  return useQuery(orgUsageQueryOptions(orgId))
}

export function useOrgEntitlementsQuery(orgId: string, options?: OrgEntitlementsQueryOptions) {
  return useQuery(orgEntitlementsQueryOptions(orgId, options))
}
