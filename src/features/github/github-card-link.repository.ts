import { getSupabaseBrowserClient } from '../../platform/supabase/client'
import { rpcAdapter } from '../../platform/data/rpc-adapter'
import { mapPullRequest, type PullRequestRow } from './github-pr.repository'
import type {
  CardGitHubLink,
  GitHubProjectCard,
  GitHubPullRequest,
} from './github.types'

type CardGitHubLinkRow = {
  id: string
  card_id: string
  pull_request_id: string
  link_type: string
  created_at: string
}

type ProjectCardRow = {
  id: string
  title: string
  project_card_number: number | null
}

function supabase() {
  return getSupabaseBrowserClient()
}

function mapLink(row: CardGitHubLinkRow): CardGitHubLink {
  return {
    id: row.id,
    cardId: row.card_id,
    pullRequestId: row.pull_request_id,
    linkType: row.link_type as CardGitHubLink['linkType'],
    createdAt: row.created_at,
  }
}

function mapProjectCard(row: ProjectCardRow): GitHubProjectCard {
  return {
    id: row.id,
    title: row.title,
    projectCardNumber: row.project_card_number,
  }
}

export const githubCardLinkRepository = {
  async getProjectCards(projectId: string): Promise<GitHubProjectCard[]> {
    const rows = await rpcAdapter.call<ProjectCardRow[]>(
      'get_project_github_cards',
      {
        target_project_id: projectId,
      },
    )

    return (rows ?? []).map((row) => mapProjectCard(row))
  },

  async getLinkedPRsForCard(
    cardId: string,
  ): Promise<{ link: CardGitHubLink; pr: GitHubPullRequest }[]> {
    const { data, error } = await supabase()
      .from('card_github_links')
      .select('*, github_pull_requests(*)')
      .eq('card_id', cardId)

    if (error) throw error

    return (data ?? []).map((row: Record<string, unknown>) => ({
      link: mapLink(row as CardGitHubLinkRow),
      pr: mapPullRequest(row.github_pull_requests as PullRequestRow),
    }))
  },

  async linkCardToPR(cardId: string, prId: string): Promise<string> {
    return rpcAdapter.call<string>('link_card_to_pr', {
      target_card_id: cardId,
      target_pr_id: prId,
    })
  },

  async unlinkCardFromPR(cardId: string, prId: string): Promise<void> {
    await rpcAdapter.call('unlink_card_from_pr', {
      target_card_id: cardId,
      target_pr_id: prId,
    })
  },
}
