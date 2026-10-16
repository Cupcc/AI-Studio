import type { FeatureBridge } from '@shared/ipc/contract'
import type { filesContract } from '@shared/ipc/files'
import { studio } from '../../../lib/studio'

export type FilesApi = FeatureBridge<typeof filesContract>

// The bridge is derived from the contract; the main integration registers the feature.
export const filesApi = (): FilesApi => (studio() as ReturnType<typeof studio> & { files: FilesApi }).files
