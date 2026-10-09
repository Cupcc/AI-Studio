import type { FeatureBridge } from '@shared/ipc/contract'
import { sessionContract } from '@shared/ipc/session'
import { studio } from '../../lib/studio'

export type SessionApi = FeatureBridge<typeof sessionContract>

export function sessionApi(): SessionApi {
  return studio().session
}
