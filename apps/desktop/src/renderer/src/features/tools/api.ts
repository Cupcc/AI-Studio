import type { FeatureBridge } from '@shared/ipc/contract'
import type { browserContract } from '@shared/ipc/browser'
import type { terminalContract } from '@shared/ipc/terminal'
import { studio } from '../../lib/studio'

export type BrowserApi = FeatureBridge<typeof browserContract>
export type TerminalApi = FeatureBridge<typeof terminalContract>

// Each bridge is derived from its feature contract; the main integration registers both.
type RuntimeApi = ReturnType<typeof studio> & { browser: BrowserApi; terminal: TerminalApi }
export const browserApi = (): BrowserApi => (studio() as RuntimeApi).browser
export const terminalApi = (): TerminalApi => (studio() as RuntimeApi).terminal
