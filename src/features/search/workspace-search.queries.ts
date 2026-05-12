import {useQuery} from '@tanstack/react-query'

import {workspaceSearchRepository} from './workspace-search.repository'

export function workspaceSearchQueryOptions(query: string) {
  return {
    gcTime: 5000,
    queryFn: () => workspaceSearchRepository.searchAccessible(query),
    queryKey: ['workspace-search', query] as const,
  }
}

export function useWorkspaceSearchQuery(query: string, enabled = true) {
  return useQuery({
    ...workspaceSearchQueryOptions(query),
    enabled,
  })
}
