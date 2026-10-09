// Single access point to the preload API so features can be tested with a fake.
import type { StudioApi } from '@shared/ipc/contracts'

export function studio(): StudioApi {
  return window.studio
}
