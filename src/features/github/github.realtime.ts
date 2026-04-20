import {useEffect} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {realtimeAdapter} from '../../platform/realtime/realtime-adapter'

type UseGitHubRealtimeOptions = {
  projectId: string
}

export function useGitHubRealtime({projectId}: UseGitHubRealtimeOptions) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = realtimeAdapter.channel(`github:${projectId}`)

    channel
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'project_github_settings'},
        () => {
          queryClient.invalidateQueries({queryKey: ['github-project-settings', projectId]})
          queryClient.invalidateQueries({queryKey: ['github-repos', projectId]})
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'github_repositories'},
        () => {
          queryClient.invalidateQueries({queryKey: ['github-repos', projectId]})
          queryClient.invalidateQueries({queryKey: ['github-summary', projectId]})
          queryClient.invalidateQueries({
            predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'github-analytics-prs' && query.queryKey[1] === projectId,
          })
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'github_pull_requests'},
        () => {
          queryClient.invalidateQueries({queryKey: ['github-prs', projectId]})
          queryClient.invalidateQueries({queryKey: ['github-summary', projectId]})
          queryClient.invalidateQueries({
            predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'github-analytics-prs' && query.queryKey[1] === projectId,
          })
        },
      )
      .on(
        'postgres_changes',
        {event: 'INSERT', schema: 'public', table: 'github_events'},
        () => {
          queryClient.invalidateQueries({queryKey: ['github-events', projectId]})
          queryClient.invalidateQueries({
            predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'github-review-events' && query.queryKey[1] === projectId,
          })
        },
      )
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'card_github_links'},
        () => {
          queryClient.invalidateQueries({
            predicate: (query) =>
              Array.isArray(query.queryKey) && query.queryKey[0] === 'card-github-links',
          })
          queryClient.invalidateQueries({queryKey: ['github-prs', projectId]})
        },
      )
      .subscribe()

    return () => {
      realtimeAdapter.removeChannel(channel)
    }
  }, [projectId, queryClient])
}
