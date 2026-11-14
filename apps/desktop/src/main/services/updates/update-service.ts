// Update state machine (specs/settings/spec.md "关于与更新"). Every side effect goes through `UpdateSystem`, so the
// flow is unit-tested without Electron, the network or the file system; ./index.ts provides the real one.
import { REPOSITORY_URL, releaseTagUrl, type ReleaseInfo, type UpdateState } from '@shared/ipc/updates'
import { compareVersions, parseRelease, type Release, type ReleaseAsset } from './release'

export const FIRST_CHECK_DELAY_MS = 20_000
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const PROGRESS_INTERVAL_MS = 200

/** An error whose message is already worded for the user. */
export class UpdateError extends Error {}

export interface UpdateSystem {
  currentVersion: string
  arch: string
  /** Why this copy cannot replace itself, or null. Read once at start. */
  blocked(): string | null
  /** The parsed JSON of GitHub's "latest release". Throws UpdateError for failures worth showing as they are. */
  fetchLatest(signal: AbortSignal): Promise<unknown>
  /** Streams the asset to disk and returns the SHA-256 (hex) of what was written. */
  download(asset: ReleaseAsset, onProgress: (received: number, total: number) => void, signal: AbortSignal): Promise<{ file: string; sha256: string }>
  /** Unpacks the zip and verifies the bundle (identifier, version, code signature); returns the staged .app path. */
  stage(file: string, version: string): Promise<string>
  /** Removes downloads and staged bundles of earlier runs. */
  clean(): Promise<void>
  /** Message left by the previous run's installer when it failed, consumed on read. */
  takeInstallFailure(): Promise<string | null>
  /** Starts the detached installer that swaps the bundle once this process exits. */
  install(stagedApp: string, version: string, relaunch: boolean): void
  quit(): void
  readAutomatic(): boolean
  writeAutomatic(enabled: boolean): void
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface UpdateService {
  state(): UpdateState
  /** Cleans earlier downloads and, unless `automaticChecks` is false (development builds), schedules automatic checks. */
  start(options?: { automaticChecks?: boolean }): Promise<void>
  check(): Promise<UpdateState>
  restartToUpdate(): UpdateState
  /** The quit started by restartToUpdate was cancelled: a later ordinary quit installs without relaunching. */
  cancelRestart(): void
  setAutomatic(enabled: boolean): UpdateState
  /** Called once quitting is certain: starts the installer when an update is staged. */
  applyOnQuit(): void
  subscribe(listener: (state: UpdateState) => void): () => void
  dispose(): void
}

const message = (error: unknown) => error instanceof UpdateError ? error.message : `更新失败：${error instanceof Error ? error.message : String(error)}`

export function createUpdateService(system: UpdateSystem): UpdateService {
  const blocked = system.blocked()
  let state: UpdateState = { phase: 'idle', release: null, progress: null, error: null, checkedAt: null, automatic: system.readAutomatic(), blocked }
  let staged: { app: string; version: string } | null = null
  let relaunch = false
  let timer: unknown = null
  let lastProgress = 0
  let controller: AbortController | null = null
  let running: Promise<UpdateState> | null = null
  let automaticChecks = true
  const listeners = new Set<(state: UpdateState) => void>()

  const set = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }

  const info = (release: Release): ReleaseInfo => ({
    version: release.version, name: release.name, notes: release.notes, publishedAt: release.publishedAt,
    // Links open in the system browser; only pages of the release repository are trusted.
    url: release.url.startsWith(`${REPOSITORY_URL}/`) ? release.url : releaseTagUrl(release.version)
  })

  /** Why this release cannot be installed in one click; null when it can. */
  const releaseBlock = (release: Release): string | null =>
    blocked ?? (!release.asset ? `该版本没有适用于本机（${system.arch}）的安装包，请前往 GitHub 下载。`
      : !release.asset.sha256 ? '该版本没有提供校验值，无法确认安装包完整，请前往 GitHub 下载。' : null)

  const schedule = (delay: number) => {
    if (timer !== null) system.clearTimeout(timer)
    timer = state.automatic && automaticChecks ? system.setTimeout(() => { timer = null; void check(true) }, delay) : null
  }

  async function download(release: Release, asset: ReleaseAsset & { sha256: string }, signal: AbortSignal): Promise<void> {
    set({ phase: 'downloading', progress: { received: 0, total: asset.size }, error: null })
    const { file, sha256 } = await system.download(asset, (received, total) => {
      const now = system.now()
      if (now - lastProgress < PROGRESS_INTERVAL_MS && received < total) return
      lastProgress = now
      set({ progress: { received, total } })
    }, signal)
    if (sha256 !== asset.sha256) throw new UpdateError('下载的安装包校验不一致，已丢弃。请稍后重试。')
    staged = { app: await system.stage(file, release.version), version: release.version }
    set({ phase: 'ready', progress: null })
  }

  async function run(automatic: boolean): Promise<UpdateState> {
    controller = new AbortController()
    const { signal } = controller
    set({ phase: 'checking', error: null })
    let release: Release | null = null
    try {
      release = parseRelease(await system.fetchLatest(signal), system.arch)
      const checkedAt = system.now()
      if (!release) throw new UpdateError('GitHub 上没有找到已发布的版本。')
      if (compareVersions(release.version, system.currentVersion) <= 0) {
        set({ phase: 'current', release: null, checkedAt, blocked })
        return state
      }
      const reason = releaseBlock(release)
      set({ phase: 'available', release: info(release), checkedAt, blocked: reason })
      // Automatic checks download only while automatic updates are on; a manual check always does.
      if (reason || !release.asset?.sha256 || (automatic && !state.automatic)) return state
      await download(release, release.asset as ReleaseAsset & { sha256: string }, signal)
    } catch (error) {
      if (signal.aborted) return state
      set({ phase: 'error', progress: null, error: message(error), checkedAt: state.checkedAt ?? system.now(), release: release && compareVersions(release.version, system.currentVersion) > 0 ? info(release) : state.release })
    } finally {
      controller = null
    }
    return state
  }

  function check(automatic = false): Promise<UpdateState> {
    // Once staged, the update waits for the quit; an in-flight check or download is joined, not restarted.
    if (state.phase === 'ready') return Promise.resolve(state)
    running ??= run(automatic).finally(() => { running = null; schedule(CHECK_INTERVAL_MS) })
    return running
  }

  return {
    state: () => state,
    async start(options = {}) {
      automaticChecks = options.automaticChecks ?? true
      try {
        await system.clean()
        const failure = await system.takeInstallFailure()
        if (failure) set({ phase: 'error', error: `上次更新没有安装成功：${failure}` })
      } catch (error) { console.error('[updates] cleanup failed', error) }
      schedule(FIRST_CHECK_DELAY_MS)
    },
    check: () => check(false),
    restartToUpdate() {
      if (state.phase !== 'ready' || !staged) throw new UpdateError('新版本还没有下载完成。')
      relaunch = true
      system.quit()
      return state
    },
    cancelRestart() { relaunch = false },
    setAutomatic(enabled) {
      system.writeAutomatic(enabled)
      set({ automatic: enabled })
      schedule(state.checkedAt === null ? FIRST_CHECK_DELAY_MS : CHECK_INTERVAL_MS)
      return state
    },
    applyOnQuit() {
      if (state.phase !== 'ready' || !staged) return
      try { system.install(staged.app, staged.version, relaunch) } catch (error) { console.error('[updates] install failed to start', error) }
      staged = null
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() {
      if (timer !== null) system.clearTimeout(timer)
      timer = null
      controller?.abort()
      listeners.clear()
    }
  }
}
