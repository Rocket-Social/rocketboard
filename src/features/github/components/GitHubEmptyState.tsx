import {GitPullRequest, Settings} from 'lucide-react'

type GitHubEmptyStateProps = {
  variant: 'no-prs' | 'no-repos' | 'no-source'
}

export function GitHubEmptyState({variant}: GitHubEmptyStateProps) {
  if (variant === 'no-source') {
    return (
      <div className="flex items-start justify-start h-full p-8">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-sm bg-canvas-accent flex items-center justify-center">
              <Settings className="w-5 h-5 text-text-muted" />
            </div>
            <h2 className="text-xl font-semibold text-text-strong" style={{fontFamily: "'Space Grotesk', sans-serif"}}>
              Configure a GitHub source
            </h2>
          </div>
          <p className="text-sm text-text-medium">
            Bind an organization or personal GitHub source to this board before you connect repositories.
          </p>
        </div>
      </div>
    )
  }

  if (variant === 'no-repos') {
    return (
      <div className="flex items-start justify-start h-full p-8">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-sm bg-canvas-accent flex items-center justify-center">
              <GitPullRequest className="w-5 h-5 text-text-muted" />
            </div>
            <h2 className="text-xl font-semibold text-text-strong" style={{fontFamily: "'Space Grotesk', sans-serif"}}>
              Add repositories to this board
            </h2>
          </div>
          <p className="text-sm text-text-medium">
            This board already has a GitHub source. Add one or more repositories to start syncing PRs, reviews, and activity.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center max-w-sm">
        <GitPullRequest className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-medium">
          No pull requests yet. Your PRs will appear here automatically after the next sync.
        </p>
      </div>
    </div>
  )
}
