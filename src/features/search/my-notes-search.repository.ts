import {rpcAdapter} from '../../platform/data/rpc-adapter'

import type {MyNotesSearchSnapshot} from './my-notes-search.types'

export type MyNotesSearchRepository = {
  search(query: string): Promise<MyNotesSearchSnapshot>
}

export const myNotesSearchRepository: MyNotesSearchRepository = {
  async search(query) {
    return await rpcAdapter.callSingle<MyNotesSearchSnapshot>('search_my_notes', {
      target_query: query,
    }) ?? {notes: []}
  },
}
