import { defineContract, event, invoke } from './contract'
import type {
  DiffFileRequest, DiffFileResult, DiffInvalidated, DiffSnapshot, DiffSubscription, DiffWatchChanged
} from '../tools/diff'

export const diffContract = defineContract('diff', {
  invoke: {
    getSnapshot: invoke<{ projectId: string }, DiffSnapshot>('diff:get-snapshot'),
    getFile: invoke<DiffFileRequest, DiffFileResult>('diff:get-file'),
    subscribe: invoke<{ projectId: string }, DiffSubscription>('diff:subscribe'),
    unsubscribe: invoke<{ projectId: string; subscriptionId: string }, void>('diff:unsubscribe')
  },
  events: {
    invalidated: event<DiffInvalidated>('diff:invalidated'),
    watchChanged: event<DiffWatchChanged>('diff:watch-changed')
  }
})
