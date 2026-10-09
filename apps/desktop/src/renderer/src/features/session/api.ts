import type { FeatureBridge } from '@shared/ipc/contract'
import { sessionContract } from '@shared/ipc/session'
import { studio } from '../../lib/studio'

export type SessionApi = FeatureBridge<typeof sessionContract>

// The feature's contract is registered by the shell composition owner.
// Keep the temporary narrowing at this boundary, rather than in components.
export function sessionApi(): SessionApi {
  return (studio() as unknown as { session: SessionApi }).session
}
