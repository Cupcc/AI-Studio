// Native-dependency smoke check (`--studio-smoke-output=<file>`): SQLite
// read/write + repeatable migrations, a node-pty shell, the Terminal screen model
// (headless xterm + serialize addon + emulator-state capture), and login-shell
// environment with codex/claude discovery. The report is sanitized: only
// booleans, counts, versions and executable paths — never environment values.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getAppMeta, setAppMeta } from '../services/database/app-meta'
import { isInsideDirectory, openDatabase } from '../services/database/database'
import { migrations } from '../services/database/migrations'
import { runPtySmoke } from '../services/pty/pty-smoke'
import { createTerminalScreen } from '../services/terminal/screen'
import { listProjectFiles, ripgrepPath } from '../services/files/file-index'
import { renameExclusive } from '../services/files/rename-exclusive'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findExecutable, probeExecutable, splitPath, type ExecutableProbe } from '../services/shell-env/executables'
import { resolveLoginEnv, toEnv } from '../services/shell-env/login-env'
import type { RendererSmokeResult } from './renderer-smoke'

export const SMOKE_EXECUTABLES = ['codex', 'claude'] as const
/** Reported, never gating: the project Diff degrades to an explanation when Git is missing. */
export const SMOKE_INFO_EXECUTABLES = ['git'] as const

export interface SmokeReport {
  schema: 1
  ok: boolean
  app: { version: string; isPackaged: boolean; platform: string; arch: string; electron: string; node: string }
  launchEnv: { pathEntryCount: number; codexOnLaunchPath: boolean; claudeOnLaunchPath: boolean }
  sqlite: {
    ok: boolean
    driver: 'node:sqlite'
    sqliteVersion?: string
    dbInsideUserData: boolean
    firstRunApplied: number
    secondRunApplied: number
    readBack: boolean
    error?: string
  }
  shellEnv: { ok: boolean; source: string; shell: string; durationMs: number; pathEntryCount: number; error?: string }
  pty: { ok: boolean; shell: string; receivedMarker: boolean; exitCode?: number; durationMs: number; error?: string }
  /** The packaged app must resolve the external `@xterm/*` packages and their private structures. */
  terminalScreen: { ok: boolean; serializedMarker: boolean; emulatorStateVersion?: number; xtermVersion?: string; error?: string }
  /** Search and Quick Open run the bundled ripgrep, which must be executable outside the asar archive (DEC-25). */
  ripgrep?: { ok: boolean; unpacked: boolean; listedFixture: boolean; error?: string }
  filesRename?: { ok: boolean; moved: boolean; refusedOverwrite: boolean; error?: string }
  executables: Record<string, Omit<ExecutableProbe, 'name'>>
  /** Added by the main entry after loading the real window hidden. */
  renderer?: RendererSmokeResult
}

export interface SmokeInput {
  userDataDir: string
  app: SmokeReport['app']
  launchEnv?: NodeJS.ProcessEnv
}

export async function runNativeSmoke(input: SmokeInput): Promise<SmokeReport> {
  const launchEnv = input.launchEnv ?? process.env
  const sqlite = checkSqlite(input.userDataDir)
  const loginEnv = await resolveLoginEnv({ baseEnv: launchEnv })
  const pty = await runPtySmoke({ shell: loginEnv.shell, env: loginEnv.env })
  const terminalScreen = await checkTerminalScreen()
  const ripgrep = await checkRipgrep()
  const filesRename = await checkFilesRename()
  const executables: SmokeReport['executables'] = {}
  for (const name of [...SMOKE_EXECUTABLES, ...SMOKE_INFO_EXECUTABLES]) {
    const { name: _ignored, ...probe } = await probeExecutable(name, loginEnv.env)
    executables[name] = probe
  }
  const launchPath = toEnv(launchEnv).PATH
  const report: SmokeReport = {
    schema: 1,
    ok: false,
    app: input.app,
    launchEnv: {
      pathEntryCount: splitPath(launchPath).length,
      codexOnLaunchPath: (await findExecutable('codex', launchPath)) !== null,
      claudeOnLaunchPath: (await findExecutable('claude', launchPath)) !== null
    },
    sqlite,
    shellEnv: {
      ok: loginEnv.source === 'login-shell',
      source: loginEnv.source,
      shell: loginEnv.shell,
      durationMs: loginEnv.durationMs,
      pathEntryCount: splitPath(loginEnv.env.PATH).length,
      ...(loginEnv.error ? { error: loginEnv.error } : {})
    },
    pty,
    terminalScreen,
    ripgrep,
    filesRename,
    executables
  }
  report.ok =
    sqlite.ok &&
    report.shellEnv.ok &&
    pty.ok &&
    terminalScreen.ok &&
    ripgrep.ok &&
    filesRename.ok &&
    SMOKE_EXECUTABLES.every((name) => executables[name]?.found && executables[name]?.version)
  return report
}

async function checkFilesRename(): Promise<NonNullable<SmokeReport['filesRename']>> {
  let dir: string | null = null
  try {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'studio-files-rename-smoke-')))
    await writeFile(join(dir, 'source.txt'), 'source')
    await writeFile(join(dir, 'keep.txt'), 'keep')
    await renameExclusive(join(dir, 'source.txt'), join(dir, 'moved.txt'))
    const moved = await readFile(join(dir, 'moved.txt'), 'utf8') === 'source'
    let refusedOverwrite = false
    try { await renameExclusive(join(dir, 'moved.txt'), join(dir, 'keep.txt')) }
    catch (error) { refusedOverwrite = (error as NodeJS.ErrnoException).code === 'EEXIST' }
    refusedOverwrite &&= await readFile(join(dir, 'keep.txt'), 'utf8') === 'keep' && await readFile(join(dir, 'moved.txt'), 'utf8') === 'source'
    return { ok: moved && refusedOverwrite, moved, refusedOverwrite }
  } catch (error) {
    return { ok: false, moved: false, refusedOverwrite: false, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }
  } finally { if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

async function checkRipgrep(): Promise<NonNullable<SmokeReport['ripgrep']>> {
  let dir: string | null = null
  try {
    const rg = await ripgrepPath()
    dir = await realpath(await mkdtemp(join(tmpdir(), 'studio-rg-smoke-')))
    await writeFile(join(dir, 'marker.txt'), 'x')
    const listed = await listProjectFiles(dir, { rg, timeoutMs: 10_000 })
    const listedFixture = listed.status === 'ok' && listed.paths.includes('marker.txt')
    return { ok: listedFixture, unpacked: !rg.includes('app.asar/'), listedFixture, ...(listed.status === 'unavailable' ? { error: listed.reason } : {}) }
  } catch (error) {
    return { ok: false, unpacked: false, listedFixture: false, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }
  } finally { if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

async function checkTerminalScreen(): Promise<SmokeReport['terminalScreen']> {
  const result: SmokeReport['terminalScreen'] = { ok: false, serializedMarker: false }
  try {
    const screen = createTerminalScreen(40, 5)
    try {
      await new Promise<void>((resolve) => screen.write('\u001b[31mSMOKE_SCREEN\u001b[0m\r\n', resolve))
      result.serializedMarker = screen.serialize().includes('SMOKE_SCREEN')
      const state = screen.emulatorState()
      result.emulatorStateVersion = state.version
      result.xtermVersion = state.xtermVersion
      result.ok = result.serializedMarker && state.version === 1 && state.cols === 40 && state.rows === 5
    } finally { screen.dispose() }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}

function checkSqlite(userDataDir: string): SmokeReport['sqlite'] {
  const result: SmokeReport['sqlite'] = {
    ok: false,
    driver: 'node:sqlite',
    dbInsideUserData: false,
    firstRunApplied: 0,
    secondRunApplied: 0,
    readBack: false
  }
  try {
    const first = openDatabase({ userDataDir, migrations })
    result.firstRunApplied = first.migration.applied.length
    result.dbInsideUserData = isInsideDirectory(first.path, userDataDir)
    const token = `smoke-${Date.now()}`
    setAppMeta(first.db, 'smoke.lastRun', token)
    result.sqliteVersion = (first.db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v
    first.close()
    // Reopen: migrations must be a no-op and the written value must persist.
    const second = openDatabase({ userDataDir, migrations })
    result.secondRunApplied = second.migration.applied.length
    result.readBack = getAppMeta(second.db, 'smoke.lastRun') === token
    second.close()
    result.ok = result.dbInsideUserData && result.secondRunApplied === 0 && result.readBack
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}

export async function writeSmokeReport(file: string, report: SmokeReport): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
