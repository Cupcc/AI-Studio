import type { FeatureBridge } from '@shared/ipc/contract'
import type { diffContract } from '@shared/ipc/diff'
import { studio } from '../../../lib/studio'

export type DiffApi = FeatureBridge<typeof diffContract>

// The bridge is derived from the contract; the main integration registers the feature.
export const diffApi = (): DiffApi => (studio() as ReturnType<typeof studio> & { diff: DiffApi }).diff
