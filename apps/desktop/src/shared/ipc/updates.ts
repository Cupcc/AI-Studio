// Updates feature contract: checks GitHub Releases, downloads the app bundle, verifies it and swaps it in on quit
// (specs/settings/spec.md "关于与更新"; DEC-36: an unsigned app cannot use Squirrel.Mac, so the app updates itself).
import { defineContract, event, invoke } from './contract'

/** Public repository that publishes the releases (DEC-17). */
export const RELEASE_REPOSITORY = 'Tiancheng-ai/AI-Studio'
export const REPOSITORY_URL = `https://github.com/${RELEASE_REPOSITORY}`
export const RELEASES_URL = `${REPOSITORY_URL}/releases`
export const releaseTagUrl = (version: string) => `${RELEASES_URL}/tag/v${version}`

export interface ReleaseInfo {
  version: string
  name: string
  /** Release notes as written on GitHub (Markdown). */
  notes: string
  publishedAt: string | null
  url: string
}

/**
 * idle: not checked since launch · checking · current: no newer release · available: newer release found, not
 * downloaded (automatic updates off, or one-click install unavailable: see `blocked`) · downloading · ready: verified
 * and staged, installed when the app quits · error: the last check or download failed.
 */
export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  /** The newer release, from `available` on; kept on a failed download so the user can still open it. */
  release: ReleaseInfo | null
  progress: { received: number; total: number } | null
  error: string | null
  /** When the last check finished (epoch ms). */
  checkedAt: number | null
  /** Check and download automatically (default on). */
  automatic: boolean
  /** Why this copy cannot install updates itself (development build, read-only location, …); null when it can. */
  blocked: string | null
}

export interface SetAutomaticRequest { enabled: boolean }

export const updatesContract = defineContract('updates', {
  invoke: {
    getState: invoke<void, UpdateState>('updates:get-state'),
    /** Checks now; downloads a newer release when it can be installed. */
    check: invoke<void, UpdateState>('updates:check'),
    /** Quits the app (through the normal quit confirmation), installs the staged release and relaunches it. */
    restartToUpdate: invoke<void, UpdateState>('updates:restart-to-update'),
    setAutomatic: invoke<SetAutomaticRequest, UpdateState>('updates:set-automatic')
  },
  events: {
    stateChanged: event<UpdateState>('updates:state-changed'),
    /** Menu bar "检查更新…": the renderer opens Settings › 关于. */
    aboutRequested: event<void>('updates:about-requested')
  }
})
