import { rpcAdapter } from '../../platform/data/rpc-adapter'
import { resolveGitHubBoardConfig } from './github.board-config'
import type { GitHubBoardConfig } from './github.types'

export const githubBoardRepository = {
  async getGitHubBoardConfig(
    projectViewId: string,
  ): Promise<GitHubBoardConfig> {
    const row = await rpcAdapter.callSingle<{sharedConfig: Record<string, unknown>} | null>(
      'get_github_shared_config_by_view_id',
      {
        target_project_view_id: projectViewId,
      },
    )

    return resolveGitHubBoardConfig((row?.sharedConfig ?? {}) as Partial<GitHubBoardConfig>)
  },

  async setGitHubBoardConfig(
    projectViewId: string,
    config: GitHubBoardConfig,
  ): Promise<GitHubBoardConfig> {
    const row = await rpcAdapter.callSingle<{sharedConfig: Record<string, unknown>} | null>(
      'set_github_shared_config_by_view_id',
      {
        target_config: config,
        target_project_view_id: projectViewId,
      },
    )

    return resolveGitHubBoardConfig((row?.sharedConfig ?? {}) as Partial<GitHubBoardConfig>)
  },
}
