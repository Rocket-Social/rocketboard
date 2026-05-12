import {useQuery} from '@tanstack/react-query'

import {projectSearchRepository} from './project-search.repository'

export function projectSearchQueryOptions(projectId: string, query: string) {
  return {
    gcTime: 5000,
    queryFn: () => projectSearchRepository.searchProject(projectId, query),
    queryKey: ['project-search', projectId, query] as const,
  }
}

export function useProjectSearchQuery(projectId: string, query: string, enabled = true) {
  return useQuery({
    ...projectSearchQueryOptions(projectId, query),
    enabled,
  })
}
