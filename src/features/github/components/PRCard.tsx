import type {GitHubPullRequest} from '../github.types'
import {derivePRLifecycleState} from '../github.types'

const REPO_COLORS = [
  '#335c8f', // steel-blue
  '#bf6224', // ember
  '#2f7a55', // success
  '#a86c0f', // warning
  '#a13d34', // error
  '#667487', // muted
]

type PRCardProps = {
  onOpen?: () => void
  pr: GitHubPullRequest
  repo?: { name: string; fullName: string; colorIndex: number }
}

export function PRCard({onOpen, pr, repo}: PRCardProps) {
  const ageMs = Date.now() - new Date(pr.createdAt).getTime()
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60))
  const ageDays = Math.floor(ageHours / 24)
  const ageLabel = ageDays > 0 ? `+${ageDays}d` : `+${ageHours}h`

  const ageColor =
    ageDays > 5 ? 'text-[#a13d34]'
      : ageDays > 3 ? 'text-[#a86c0f]'
        : ageDays > 1 ? 'text-[#455265]'
          : 'text-[#667487]'

  const repoColor = repo ? REPO_COLORS[repo.colorIndex % REPO_COLORS.length] : REPO_COLORS[5]

  const reviewIndicator = getReviewIndicator(pr)

  return (
    <button
      onClick={onOpen}
      className="block rounded-sm border border-border-subtle bg-surface-elevated p-2.5 hover:shadow-sm transition-shadow cursor-pointer"
      type="button"
    >
      {/* Row 1: repo + age */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{backgroundColor: repoColor}}
          />
          <span className="text-xs text-text-muted truncate font-mono">
            {repo?.name ?? 'unknown'}
          </span>
        </div>
        <span className={`text-xs font-mono flex-shrink-0 ${ageColor}`}>
          {ageLabel}
        </span>
      </div>

      {/* Row 2: PR title */}
      <p className="text-sm font-medium text-text-strong leading-snug line-clamp-2 mb-1">
        {pr.title}
      </p>

      {pr.linkedCards.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {pr.linkedCards.slice(0, 2).map((card) => (
            <span
              key={card.id}
              className="inline-flex max-w-full items-center rounded-full bg-canvas-accent px-1.5 py-0.5 text-[10px] text-text-medium"
            >
              {card.projectCardNumber !== null ? (
                <span className="mr-1 font-mono text-text-muted">#{card.projectCardNumber}</span>
              ) : null}
              <span className="truncate">{card.title}</span>
            </span>
          ))}
          {pr.linkedCards.length > 2 && (
            <span className="inline-flex items-center rounded-full bg-canvas-accent px-1.5 py-0.5 text-[10px] text-text-muted">
              +{pr.linkedCards.length - 2} more
            </span>
          )}
        </div>
      )}

      {/* Row 3: metadata */}
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        {pr.authorLogin && (
          <span className="truncate max-w-[60px]">{pr.authorLogin}</span>
        )}
        <span className="font-mono text-[10px]">
          +{pr.additions} −{pr.deletions}
        </span>
        {pr.checksStatus && (
          <span className={pr.checksStatus === 'success' ? 'text-[#2f7a55]' : pr.checksStatus === 'failure' ? 'text-[#a13d34]' : 'text-[#a86c0f]'}>
            {pr.checksStatus === 'success' ? '✓' : pr.checksStatus === 'failure' ? '✗' : '○'}CI
          </span>
        )}
        {reviewIndicator && (
          <span className="ml-auto flex-shrink-0" style={{color: reviewIndicator.color}}>
            {reviewIndicator.label}
          </span>
        )}
      </div>
    </button>
  )
}

function getReviewIndicator(pr: GitHubPullRequest): {label: string; color: string} | null {
  const state = derivePRLifecycleState(pr)
  switch (state) {
    case 'approved':
      return {label: '✓ approved', color: '#2f7a55'}
    case 'changes_requested':
      return {label: '△ changes', color: '#a86c0f'}
    case 'in_review':
      return {label: `● ${pr.reviewers.length} rev`, color: '#335c8f'}
    default:
      return null
  }
}
