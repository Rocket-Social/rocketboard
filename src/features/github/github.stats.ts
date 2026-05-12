import type { ProjectMember } from '../access/access.types'
import type { JiraContributorStatsRow } from '../jira/jira.types'
import type { GitHubPullRequest } from './github.types'

export const ALL_STATS_CONTRIBUTORS = '__all__'

export type GitHubStatsContributor = {
  displayName: string
  email: string | null
  githubLogin: string
  label: string
  memberId: string | null
  value: string
}

export type GitHubStatsSummary = {
  averageCommentsPerPr: number | null
  averageDurationHours: number | null
  filesTouched: number
  netLines: number
  prsOpened: number
  totalAdditions: number
  totalDeletions: number
}

export type GitHubStatsTopPullRequest = {
  additions: number
  churn: number
  deletions: number
  htmlUrl: string
  number: number
  title: string
}

export type GitHubStatsTeamRow = {
  contributorId: string
  contributorName: string
  loggedHours: number | null
  reopenedBugs: number | null
  resolvedBugs: number | null
}

const HOUR_MS = 1000 * 60 * 60

export function getGitHubStatsContributors(input: {
  projectMembers: ProjectMember[]
  pullRequests: GitHubPullRequest[]
}): GitHubStatsContributor[] {
  const contributors = new Map<string, GitHubStatsContributor>()

  for (const member of input.projectMembers) {
    if (!member.githubLogin) continue
    const value = normalizeLogin(member.githubLogin)
    if (!value) continue
    contributors.set(value, {
      displayName: member.name || member.email || member.githubLogin,
      email: member.email,
      githubLogin: member.githubLogin,
      label: member.name
        ? `${member.name} (@${member.githubLogin})`
        : `@${member.githubLogin}`,
      memberId: member.id,
      value,
    })
  }

  for (const pr of input.pullRequests) {
    if (!pr.authorLogin) continue
    const value = normalizeLogin(pr.authorLogin)
    if (!value || contributors.has(value)) continue
    contributors.set(value, {
      displayName: pr.authorLogin,
      email: null,
      githubLogin: pr.authorLogin,
      label: `@${pr.authorLogin}`,
      memberId: null,
      value,
    })
  }

  return [...contributors.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  )
}

export function filterGitHubStatsPullRequests(
  pullRequests: GitHubPullRequest[],
  contributorValue: string,
): GitHubPullRequest[] {
  if (contributorValue === ALL_STATS_CONTRIBUTORS) return pullRequests
  return pullRequests.filter(
    (pr) => normalizeLogin(pr.authorLogin) === contributorValue,
  )
}

export function buildGitHubStatsSummary(
  pullRequests: GitHubPullRequest[],
): GitHubStatsSummary {
  const durationHours = pullRequests
    .map((pr) => getPrDurationHours(pr))
    .filter((value): value is number => value !== null)

  const totalComments = pullRequests.reduce(
    (sum, pr) => sum + pr.commentCount,
    0,
  )
  const totalAdditions = pullRequests.reduce(
    (sum, pr) => sum + pr.additions,
    0,
  )
  const totalDeletions = pullRequests.reduce(
    (sum, pr) => sum + pr.deletions,
    0,
  )

  return {
    averageCommentsPerPr:
      pullRequests.length > 0 ? totalComments / pullRequests.length : null,
    averageDurationHours: average(durationHours),
    filesTouched: pullRequests.reduce((sum, pr) => sum + pr.changedFiles, 0),
    netLines: totalAdditions - totalDeletions,
    prsOpened: pullRequests.length,
    totalAdditions,
    totalDeletions,
  }
}

export function getGitHubStatsTopPullRequests(
  pullRequests: GitHubPullRequest[],
): GitHubStatsTopPullRequest[] {
  return pullRequests
    .map((pr) => ({
      additions: pr.additions,
      churn: pr.additions + pr.deletions,
      deletions: pr.deletions,
      htmlUrl: pr.htmlUrl,
      number: pr.number,
      title: pr.title,
    }))
    .sort((left, right) => {
      if (right.churn !== left.churn) return right.churn - left.churn
      return right.number - left.number
    })
    .slice(0, 5)
}

export function buildGitHubStatsTeamRows(
  contributors: GitHubStatsContributor[],
  jiraStatsRows: JiraContributorStatsRow[] = [],
): GitHubStatsTeamRow[] {
  const jiraByEmail = new Map<string, JiraContributorStatsRow>()
  const jiraByName = new Map<string, JiraContributorStatsRow>()

  for (const row of jiraStatsRows) {
    const email = normalizeEmail(row.contributorEmail)
    if (email) jiraByEmail.set(email, row)
    jiraByName.set(normalizeName(row.contributorName), row)
  }

  const usedJiraAccountIds = new Set<string>()
  const rows = contributors.map((contributor) => {
    const jiraRow = findJiraRowForContributor(contributor, jiraByEmail, jiraByName)
    if (jiraRow) usedJiraAccountIds.add(jiraRow.jiraAccountId)

    return {
      contributorId: contributor.githubLogin
        ? `@${contributor.githubLogin}`
        : (contributor.memberId ?? 'Not mapped'),
      contributorName: contributor.displayName,
      loggedHours: jiraRow ? jiraRow.loggedSeconds / 60 / 60 : null,
      reopenedBugs: jiraRow?.reopenedBugs ?? null,
      resolvedBugs: jiraRow?.resolvedBugs ?? null,
    }
  })

  for (const row of jiraStatsRows) {
    if (usedJiraAccountIds.has(row.jiraAccountId)) continue
    rows.push({
      contributorId: row.contributorEmail ?? row.jiraAccountId,
      contributorName: row.contributorName,
      loggedHours: row.loggedSeconds / 60 / 60,
      reopenedBugs: row.reopenedBugs,
      resolvedBugs: row.resolvedBugs,
    })
  }

  return rows
}

function findJiraRowForContributor(
  contributor: GitHubStatsContributor,
  jiraByEmail: Map<string, JiraContributorStatsRow>,
  jiraByName: Map<string, JiraContributorStatsRow>,
) {
  const emailMatch = normalizeEmail(contributor.email)
  if (emailMatch && jiraByEmail.has(emailMatch)) {
    return jiraByEmail.get(emailMatch)
  }
  return jiraByName.get(normalizeName(contributor.displayName)) ?? null
}

function getPrDurationHours(pr: GitHubPullRequest): number | null {
  const completedAt = pr.mergedAt ?? pr.closedAt
  if (!completedAt) return null

  const started = new Date(pr.createdAt).getTime()
  const completed = new Date(completedAt).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return null
  if (completed < started) return null

  return (completed - started) / HOUR_MS
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function normalizeLogin(value: string | null): string {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeEmail(value: string | null): string {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}
