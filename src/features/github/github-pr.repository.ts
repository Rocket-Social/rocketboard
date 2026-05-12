import { rpcAdapter } from '../../platform/data/rpc-adapter'
import type {
  GitHubLinkedCard,
  GitHubPullRequest,
  GitHubReviewer,
} from './github.types'

type PullRequestLinkedCardRow = {
  card_id: string
  link_type: string
  cards: {
    id: string
    title: string
    project_card_number: number
  } | null
}

type PullRequestLinkedCardRpcRow = {
  id: string
  link_type: string
  project_card_number: number | null
  title: string
}

export type PullRequestRow = {
  id: string
  repo_id: string
  github_pr_id: number
  number: number
  title: string
  body: string | null
  state: string
  draft: boolean
  author_login: string | null
  author_avatar_url: string | null
  head_ref: string | null
  base_ref: string | null
  additions: number
  changed_files: number
  comment_count: number
  deletions: number
  review_state: string | null
  reviewers: GitHubReviewer[]
  checks_status: string | null
  html_url: string
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
  first_review_submitted_at: string | null
  last_review_submitted_at: string | null
  review_count: number
  approval_count: number
  changes_requested_count: number
  synced_at: string
  card_github_links?: PullRequestLinkedCardRow[] | null
  linked_cards?: PullRequestLinkedCardRpcRow[] | null
}

function mapLinkedCards(input: {
  nestedRows?: PullRequestRow['card_github_links']
  rpcRows?: PullRequestRow['linked_cards']
}): GitHubLinkedCard[] {
  const fromRpc = (input.rpcRows ?? []).map((row) => ({
    id: row.id,
    linkType: row.link_type as GitHubLinkedCard['linkType'],
    projectCardNumber:
      typeof row.project_card_number === 'number'
        ? row.project_card_number
        : null,
    title: row.title,
  }))

  if (fromRpc.length > 0) {
    return fromRpc.sort(
      (left, right) =>
        (left.projectCardNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.projectCardNumber ?? Number.MAX_SAFE_INTEGER),
    )
  }

  return (input.nestedRows ?? [])
    .map((row) => {
      if (!row.cards) return null
      return {
        id: row.cards.id,
        linkType: row.link_type as GitHubLinkedCard['linkType'],
        projectCardNumber:
          typeof row.cards.project_card_number === 'number'
            ? row.cards.project_card_number
            : null,
        title: row.cards.title,
      }
    })
    .filter((card): card is GitHubLinkedCard => card !== null)
    .sort(
      (left, right) =>
        (left.projectCardNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.projectCardNumber ?? Number.MAX_SAFE_INTEGER),
    )
}

export function mapPullRequest(row: PullRequestRow): GitHubPullRequest {
  return {
    id: row.id,
    repoId: row.repo_id,
    githubPrId: row.github_pr_id,
    number: row.number,
    title: row.title,
    body: row.body,
    state: row.state as GitHubPullRequest['state'],
    draft: row.draft,
    authorLogin: row.author_login,
    authorAvatarUrl: row.author_avatar_url,
    headRef: row.head_ref,
    baseRef: row.base_ref,
    additions: row.additions,
    changedFiles: Number(row.changed_files ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    deletions: row.deletions,
    reviewState: row.review_state as GitHubPullRequest['reviewState'],
    reviewers: Array.isArray(row.reviewers) ? row.reviewers : [],
    checksStatus: row.checks_status as GitHubPullRequest['checksStatus'],
    linkedCards: mapLinkedCards({
      nestedRows: row.card_github_links,
      rpcRows: row.linked_cards,
    }),
    htmlUrl: row.html_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mergedAt: row.merged_at,
    closedAt: row.closed_at,
    firstReviewSubmittedAt: row.first_review_submitted_at,
    lastReviewSubmittedAt: row.last_review_submitted_at,
    reviewCount: Number(row.review_count ?? 0),
    approvalCount: Number(row.approval_count ?? 0),
    changesRequestedCount: Number(row.changes_requested_count ?? 0),
    syncedAt: row.synced_at,
  }
}

export const githubPrRepository = {
  async getPullRequestsForProject(
    projectId: string,
  ): Promise<GitHubPullRequest[]> {
    const rows = await rpcAdapter.call<PullRequestRow[]>(
      'get_project_github_pull_requests',
      {
        target_project_id: projectId,
      },
    )

    return (rows ?? []).map((row) => mapPullRequest(row))
  },
}
