import { defineContract, event, invoke } from './contract'
import type {
  ExternalEditors, FileCreateRequest, FileKindResult, FileImageResult, FileIndexResult, FileOpenRequest, FileOpenResult, FileOperationResult,
  FilePathsRequest, FileReadRequest, FileReadResult, FileReferenceRequest, FileReferenceResult, FileRenameRequest, FilesChanged,
  FilesListResult, FilesPathRef, FilesProjectRef, FilesSubscription, FilesSubscriptionRef, FileTransferRequest, FilesWatchChanged
} from '../tools/files'

export const filesContract = defineContract('files', {
  invoke: {
    list: invoke<FilesPathRef, FilesListResult>('files:list'),
    read: invoke<FileReadRequest, FileReadResult>('files:read'),
    readImage: invoke<FilesPathRef, FileImageResult>('files:read-image'),
    resolveReference: invoke<FileReferenceRequest, FileReferenceResult>('files:resolve-reference'),
    create: invoke<FileCreateRequest, FileOperationResult>('files:create'),
    rename: invoke<FileRenameRequest, FileOperationResult>('files:rename'),
    move: invoke<FileTransferRequest, FileOperationResult>('files:move'),
    copy: invoke<FileTransferRequest, FileOperationResult>('files:copy'),
    trash: invoke<FilePathsRequest, FileOperationResult>('files:trash'),
    /** Reveal in Finder, open with the default app, or in an installed editor (VS Code / Cursor). */
    open: invoke<FileOpenRequest, FileOpenResult>('files:open'),
    editors: invoke<void, ExternalEditors>('files:editors'),
    /** Which paths exist (Terminal links); links and `.git` count as missing. */
    stat: invoke<FilePathsRequest, FileKindResult>('files:stat'),
    /** Quick Open: every non-ignored file of the Project. */
    index: invoke<FilesProjectRef, FileIndexResult>('files:index'),
    subscribe: invoke<FilesProjectRef, FilesSubscription>('files:subscribe'),
    unsubscribe: invoke<FilesSubscriptionRef, void>('files:unsubscribe')
  },
  events: {
    changed: event<FilesChanged>('files:changed'),
    watchChanged: event<FilesWatchChanged>('files:watch-changed')
  }
})
