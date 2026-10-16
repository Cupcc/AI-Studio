import { defineContract, event, invoke } from './contract'
import type {
  FileReadRequest, FileReadResult, FileReferenceRequest, FileReferenceResult, FilesChanged, FilesListResult,
  FilesPathRef, FilesProjectRef, FilesSubscription, FilesSubscriptionRef, FilesWatchChanged
} from '../tools/files'

export const filesContract = defineContract('files', {
  invoke: {
    list: invoke<FilesPathRef, FilesListResult>('files:list'),
    read: invoke<FileReadRequest, FileReadResult>('files:read'),
    resolveReference: invoke<FileReferenceRequest, FileReferenceResult>('files:resolve-reference'),
    subscribe: invoke<FilesProjectRef, FilesSubscription>('files:subscribe'),
    unsubscribe: invoke<FilesSubscriptionRef, void>('files:unsubscribe')
  },
  events: {
    changed: event<FilesChanged>('files:changed'),
    watchChanged: event<FilesWatchChanged>('files:watch-changed')
  }
})
