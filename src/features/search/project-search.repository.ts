import {rpcAdapter} from '../../platform/data/rpc-adapter'
import type {ProjectSearchSnapshot} from './project-search.types'

export type ProjectSearchRepository = {
  searchProject(projectId: string, query: string): Promise<ProjectSearchSnapshot>
}

export const projectSearchRepository: ProjectSearchRepository = {
  async searchProject(projectId, query) {
    return await rpcAdapter.callSingle<ProjectSearchSnapshot>('search_project_content', {
      target_project_id: projectId,
      target_query: query,
    }) ?? {cards: [], documents: []}
  },
}
