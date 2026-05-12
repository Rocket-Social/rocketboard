import {queryOptions, useQuery} from '@tanstack/react-query'

import {orgRouteRepository} from './org-route.repository'

export const orgRouteKeys = {
  all: ['org-route'] as const,
  context: (orgSlug: string) => ['org-route', orgSlug] as const,
}

export function organizationRouteContextQueryOptions(orgSlug: string) {
  return queryOptions({
    enabled: Boolean(orgSlug),
    queryFn: () => orgRouteRepository.resolveOrganizationSlug(orgSlug),
    queryKey: orgRouteKeys.context(orgSlug),
    staleTime: 5 * 60_000,
  })
}

export function useOrganizationRouteContextQuery(orgSlug: string | null | undefined) {
  return useQuery({
    ...organizationRouteContextQueryOptions(orgSlug ?? ''),
    enabled: Boolean(orgSlug),
  })
}
