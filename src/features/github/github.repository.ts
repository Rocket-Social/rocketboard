import { githubConnectionRepository } from './github-connection.repository'
import { githubPrRepository } from './github-pr.repository'
import { githubAnalyticsRepository } from './github-analytics.repository'
import { githubBoardRepository } from './github-board.repository'
import { githubCardLinkRepository } from './github-card-link.repository'

export const githubRepository = {
  ...githubConnectionRepository,
  ...githubPrRepository,
  ...githubAnalyticsRepository,
  ...githubBoardRepository,
  ...githubCardLinkRepository,
}
