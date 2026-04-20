import {useQuery} from '@tanstack/react-query'
import {ExternalLink, GitPullRequest} from 'lucide-react'

import {cardGitHubLinksQueryOptions} from '../github.queries'
import {derivePRLifecycleState} from '../github.types'

type CardGitHubSectionProps = {
  cardId: string
}

const STATE_COLORS: Record<string, string> = {
  draft: '#667487',
  open: '#2f7a55',
  in_review: '#335c8f',
  changes_requested: '#a86c0f',
  approved: '#2f7a55',
  merged: '#bf6224',
  closed: '#a13d34',
}

export function CardGitHubSection({cardId}: CardGitHubSectionProps) {
  const linksQuery = useQuery(cardGitHubLinksQueryOptions(cardId))
  const links = linksQuery.data ?? []

  if (linksQuery.isLoading) return null
  if (links.length === 0) return null

  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
        <GitPullRequest className="inline w-3 h-3 mr-1" />
        Pull Requests
      </label>
      <div className="space-y-1.5">
        {links.map(({link, pr}) => {
          const state = derivePRLifecycleState(pr)
          const stateColor = STATE_COLORS[state] ?? '#667487'
          const ageMs = Date.now() - new Date(pr.createdAt).getTime()
          const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
          const ageLabel = ageDays === 0 ? '<1d' : `${ageDays}d`

          return (
            <a
              key={link.id}
              href={pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm border border-border-subtle bg-surface-base hover:bg-canvas-accent transition-colors text-sm"
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{backgroundColor: stateColor}}
              />
              <span className="text-text-strong truncate flex-1">
                #{pr.number} {pr.title}
              </span>
              <span className="text-xs text-text-muted font-mono flex-shrink-0">
                {ageLabel}
              </span>
              <ExternalLink className="w-3 h-3 text-text-muted flex-shrink-0" />
            </a>
          )
        })}
      </div>
    </div>
  )
}
