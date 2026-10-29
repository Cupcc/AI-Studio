import { defineContract, invoke } from './contract'
import type { SearchRequest, SearchResult } from '../tools/search'

export const searchContract = defineContract('search', {
  invoke: {
    /** A new search of the same Project and window cancels the previous one. */
    run: invoke<SearchRequest, SearchResult>('search:run'),
    cancel: invoke<{ projectId: string; searchId: string }, void>('search:cancel')
  }
})
