import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {WorkspaceSearchSnapshot} from './workspace-search.types'

export type WorkspaceSearchRepository = {
  searchAccessible(query: string): Promise<WorkspaceSearchSnapshot>
}

export const workspaceSearchRepository: WorkspaceSearchRepository = {
  async searchAccessible(query) {
    return await rpcAdapter.callSingle<WorkspaceSearchSnapshot>('search_accessible_content', {
      target_query: query,
    }) ?? {cards: [], documents: []}
  },
}
