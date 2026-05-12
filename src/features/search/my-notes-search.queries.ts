import {useQuery} from '@tanstack/react-query'

import {myNotesSearchRepository} from './my-notes-search.repository'

export function myNotesSearchQueryOptions(query: string) {
  return {
    gcTime: 5000,
    queryFn: () => myNotesSearchRepository.search(query),
    queryKey: ['my-notes-search', query] as const,
  }
}

export function useMyNotesSearchQuery(query: string, enabled = true) {
  return useQuery({
    ...myNotesSearchQueryOptions(query),
    enabled,
  })
}
